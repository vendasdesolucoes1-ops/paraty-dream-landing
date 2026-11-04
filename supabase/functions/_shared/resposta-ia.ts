// Resposta da Sophia a um lead, com debounce ANTES do modelo e entrega durável
// (auditoria R-07, issue #36).
//
// Antes: o webhook chamava o modelo na hora, aplicava os efeitos no CRM
// (status, recusa, pausa), esperava 30 s e só então via se o lead tinha
// mandado outra mensagem — descartando a resposta, mas não os efeitos. E a
// espera vivia num setTimeout dentro de waitUntil: se o isolate fosse
// recolhido, a resposta sumia sem rastro.
//
// Agora:
//   1. Cada mensagem recebida (re)agenda uma linha `resposta_ia` na fila
//      (enfileirar_resposta_ia), com prazo de segurança de 3 min.
//   2. O webhook espera o debounce e, se nenhuma mensagem mais nova chegou,
//      REIVINDICA a linha (pendente → enviando). Só quem reivindica responde.
//   3. Se o isolate morrer no caminho, a linha fica para o cron
//      (processar-fila-mensagens), que chama esta mesma função sem debounce.
//   4. O modelo só é chamado depois do debounce, então os efeitos no CRM
//      correspondem à resposta que de fato sai.
//   5. As ações da Sophia (agendar, qualificar, transferir, bloquear, enviar
//      material) voltam do modelo como PENDENTES e só rodam depois que todas
//      as mensagens saíram. Chegou mensagem nova do lead enquanto a resposta
//      era gerada? Nada sai, nada é feito, e a resposta é gerada de novo
//      considerando a conversa inteira.
//
// O "Testar agente" do painel passa por aqui também (opção `teste`): mesma
// decisão, mesmo histórico, mesmas ações — só sem debounce, sem exigir a IA
// ligada e sem sair pelo WhatsApp (as mensagens são gravadas no lead de teste).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isHumanTakeoverActive, pauseAI } from "./ai-takeover.ts";
import { sendWhatsAppText } from "./evolution-send.ts";
import { enviarTextoRegistrado, jidDoTelefone } from "./envio-registrado.ts";
import { fetchComRetry } from "./http.ts";
import { notificarResponsaveis } from "./notificar.ts";
import { temTexto } from "./mensagem-entrada.ts";
import { ehPedidoDeParada } from "./contato-bloqueado.ts";
import { gerarRespostaSophia, type TurnoSophia } from "./sophia.ts";
import { executarAcoes } from "./sophia-acoes.ts";
import { lerConsultor, type Consultor } from "./sophia-regras.ts";

const OPENAI_API_KEY = (Deno.env.get("OPENAI_API_KEY") ?? "")
  .trim()
  .replace(/[\r\n\t]/g, "")
  .replace(/[^\x20-\x7E]/g, "");

export const DEBOUNCE_MS = 30_000;
const INTER_MESSAGE_DELAY_MIN_MS = 1000;
const INTER_MESSAGE_DELAY_MAX_MS = 3000;
const INTER_MESSAGE_DELAY_MS_PER_CHAR = 35;

const MENSAGEM_FALHA_IA =
  "Opa, tive um probleminha aqui pra te responder. Já chamei alguém da equipe pra continuar com você.";

export interface InstanciaWhatsapp {
  id: string;
  api_url: string;
  api_key: string;
  instance_name: string;
}

export type ResultadoResposta = "enviado" | "abortado" | "falhou" | "sem_resposta";

export interface DetalheResposta {
  resultado: ResultadoResposta;
  motivo?: string;
  mensagens: string[];
  /** Linhas "⚙" executadas depois do envio. */
  acoes: string[];
  /** Ferramentas de leitura usadas (lotes, base, horários). */
  leituras: string[];
  turno?: TurnoSophia;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function atrasoHumano(texto: string): number {
  const estimado = texto.length * INTER_MESSAGE_DELAY_MS_PER_CHAR;
  return Math.min(INTER_MESSAGE_DELAY_MAX_MS, Math.max(INTER_MESSAGE_DELAY_MIN_MS, estimado));
}

async function digitando(instancia: InstanciaWhatsapp, telefone: string) {
  try {
    await fetchComRetry(
      `${instancia.api_url}/chat/sendPresence/${instancia.instance_name}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: instancia.api_key },
        body: JSON.stringify({ number: telefone, presence: "composing" }),
      },
      { timeoutMs: 5_000 },
    );
  } catch {
    // "digitando..." é cortesia; falhar aqui não muda nada.
  }
}

/** Agenda (ou empurra, no debounce) a resposta da Sophia para este lead. */
export async function enfileirarResposta(
  supabase: SupabaseClient,
  leadId: string,
  telefone: string,
  instanceId: string,
): Promise<void> {
  const { error } = await supabase.rpc("enfileirar_resposta_ia", {
    p_lead_id: leadId,
    p_telefone: telefone,
    p_instance_id: instanceId,
  });
  if (error) console.error("[resposta-ia] enfileirar falhou:", error.message);
}

/** pendente → enviando, atômico. Devolve o id da linha se ESTE chamador ganhou. */
async function reivindicar(supabase: SupabaseClient, leadId: string): Promise<string | null> {
  const { data } = await supabase
    .from("mensagens_agendadas")
    .update({ status: "enviando", atualizado_em: new Date().toISOString() })
    .eq("lead_id", leadId)
    .eq("tipo", "resposta_ia")
    .eq("status", "pendente")
    .select("id")
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function chegouMensagemNova(
  supabase: SupabaseClient,
  leadId: string,
  desde: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("lead_id", leadId)
    .eq("from_me", false)
    // Mídia/áudio sem texto não dispara resposta (issue #55).
    .neq("content", "")
    .gt("created_at", desde)
    .limit(1);
  return Boolean(data?.length);
}

async function consultorDoPainel(supabase: SupabaseClient): Promise<Consultor | null> {
  const { data } = await supabase
    .from("configuracoes")
    .select("valor")
    .eq("chave", "consultor_responsavel")
    .maybeSingle();
  return lerConsultor(data?.valor ?? null);
}

interface Opcoes {
  /** Caminho rápido (webhook): espera o debounce antes de reivindicar. */
  aguardarDebounce?: boolean;
  /** Quando a mensagem que disparou o debounce foi recebida. */
  recebidaEm?: string;
  /** Espera do debounce (padrão DEBOUNCE_MS). O teste usa uma espera curta. */
  debounceMs?: number;
  /** Linha já reivindicada pelo cron (caminho durável). */
  filaId?: string;
  /** "Testar agente": sem WhatsApp, sem debounce, sem exigir a IA ligada. */
  teste?: { agentId: string; consultor?: Consultor | null; modelo?: string | null };
}

/**
 * Gera e envia a resposta da Sophia para o lead. Seguro para chamar em
 * paralelo: só quem reivindica a linha da fila responde.
 */
export async function responderLead(
  supabase: SupabaseClient,
  instancia: InstanciaWhatsapp | null,
  leadId: string,
  opcoes: Opcoes = {},
): Promise<DetalheResposta> {
  const teste = opcoes.teste ?? null;
  const fim = (
    resultado: ResultadoResposta,
    motivo?: string,
    extra: Partial<DetalheResposta> = {},
  ) => ({ resultado, motivo, mensagens: [], acoes: [], leituras: [], ...extra }) as DetalheResposta;

  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead?.telefone) return fim("abortado", "lead sem telefone");
  const telefone = String(lead.telefone).replace(/\D/g, "");
  const sessionId = telefone;

  // O teste pode pedir o mesmo debounce (mais curto) para provar o caso de
  // duas mensagens seguidas: só a mais nova responde.
  if (opcoes.aguardarDebounce && (teste || instancia)) {
    if (!teste && instancia) await digitando(instancia, telefone);
    await dormir(opcoes.debounceMs ?? DEBOUNCE_MS);
    // A mensagem mais nova tem o próprio debounce: ela responde.
    if (opcoes.recebidaEm && (await chegouMensagemNova(supabase, leadId, opcoes.recebidaEm))) {
      return fim("abortado", "mensagem mais nova vai responder");
    }
  }

  const filaId = teste ? null : (opcoes.filaId ?? (await reivindicar(supabase, leadId)));
  if (!teste && !filaId) return fim("abortado", "outra execução respondeu");
  const inicio = new Date().toISOString();

  const fecharFila = async (status: "enviado" | "cancelado" | "pendente", erro: string | null) => {
    if (!filaId) return;
    const agora = new Date().toISOString();
    await supabase
      .from("mensagens_agendadas")
      .update({
        status,
        erro,
        atualizado_em: agora,
        ...(status === "enviado" ? { enviado_em: agora } : {}),
        ...(status === "pendente" ? { agendado_para: agora } : {}),
      })
      .eq("id", filaId);
  };

  if (await isHumanTakeoverActive(supabase, sessionId)) {
    await fecharFila("cancelado", "atendimento humano em andamento");
    return fim("abortado", "atendimento humano em andamento");
  }

  let agentId: string;
  if (teste) {
    agentId = teste.agentId;
  } else {
    const { data: agente } = await supabase
      .from("ai_agents")
      .select("id")
      .eq("instance_id", instancia!.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!agente) {
      await fecharFila("cancelado", "IA desativada");
      return fim("abortado", "IA desativada");
    }
    agentId = agente.id as string;
  }

  const { data: ultima } = await supabase
    .from("whatsapp_messages")
    .select("content")
    .eq("lead_id", leadId)
    .eq("from_me", false)
    .neq("content", "")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Nunca chama o modelo com mensagem vazia (áudio, mídia sem legenda).
  if (!temTexto(ultima?.content)) {
    await fecharFila("cancelado", "mensagem sem texto");
    return fim("abortado", "mensagem sem texto");
  }
  const mensagem = String(ultima!.content).trim();

  // Quem pediu para sair não recebe resposta automática (a não ser a
  // despedida, quando o pedido é ESTA mensagem). A equipe fica sabendo.
  if (lead.contato_bloqueado && !ehPedidoDeParada(mensagem)) {
    await fecharFila("cancelado", "contato bloqueado (opt-out)");
    if (!teste) {
      await notificarResponsaveis(
        supabase,
        leadId,
        {
          tipo: "lead_bloqueado_escreveu",
          titulo: "Lead que pediu para sair escreveu",
          corpo:
            "A IA não responde contatos bloqueados. Veja a mensagem e responda pelo CRM, se fizer sentido.",
        },
        instancia,
      );
    }
    return fim("abortado", "contato bloqueado");
  }

  const consultor = teste?.consultor ?? (await consultorDoPainel(supabase));

  let turno: TurnoSophia;
  try {
    turno = await gerarRespostaSophia(supabase, OPENAI_API_KEY, {
      agentId,
      leadId,
      sessionId,
      mensagem,
      canal: teste ? "teste" : "producao",
      consultorTeste: teste?.consultor ?? null,
      modeloForcado: teste?.modelo ?? null,
    });
  } catch (e) {
    const motivo = (e as Error)?.message ?? String(e);
    console.error("[resposta-ia] IA falhou", { leadId, motivo });
    if (!teste && instancia) {
      await responderFalhaDaIA(supabase, instancia, leadId, telefone, sessionId, agentId);
    }
    await fecharFila("enviado", `IA falhou: ${motivo}`.slice(0, 500));
    return fim("falhou", motivo);
  }

  const leituras = turno.leituras.map((l) => `${l.ferramenta}: ${l.resumo}`);

  // Chegou mensagem nova enquanto a resposta era gerada: nada sai, nada é
  // feito, e a fila volta a pendente para gerar de novo com a conversa toda.
  if (await chegouMensagemNova(supabase, leadId, inicio)) {
    await fecharFila("pendente", null);
    // No teste não há fila: quem gravou a mensagem mais nova responde por ela.
    return fim("abortado", "lead escreveu de novo; a resposta é refeita com a conversa toda", {
      turno,
      leituras,
    });
  }

  if (turno.mensagens.length === 0 && turno.acoes.length === 0) {
    await fecharFila("enviado", null);
    return fim("sem_resposta", turno.atalho ?? undefined, { turno, leituras });
  }

  const { data: contato } = await supabase
    .from("whatsapp_contacts")
    .select("id")
    .eq("phone", telefone)
    .maybeSingle();

  // Envio. Qualquer falha aqui interrompe ANTES das ações.
  const enviadas: string[] = [];
  try {
    for (const [indice, texto] of turno.mensagens.entries()) {
      if (teste) {
        await supabase.from("whatsapp_messages").insert({
          lead_id: leadId,
          contact_id: (contato?.id as string | undefined) ?? null,
          remote_jid: jidDoTelefone(telefone),
          message_id: `teste:${crypto.randomUUID()}`,
          from_me: true,
          autor: "sophia",
          message_type: "text",
          content: texto,
          status: "sent",
        });
        enviadas.push(texto);
        continue;
      }
      if (indice > 0) {
        // Um vendedor pode ter assumido no meio da resposta: a máquina para.
        if (await isHumanTakeoverActive(supabase, sessionId)) break;
        await digitando(instancia!, telefone);
        await dormir(atrasoHumano(texto));
      }
      await enviarTextoRegistrado(
        supabase,
        (i, tel, txt) => sendWhatsAppText(i.api_url, i.api_key, i.instance_name, tel, txt),
        instancia!,
        telefone,
        texto,
        {
          lead_id: leadId,
          contact_id: (contato?.id as string | undefined) ?? null,
          autor: "sophia",
        },
      );
      enviadas.push(texto);
    }
  } catch (e) {
    const motivo = `envio falhou: ${(e as Error)?.message ?? e}`.slice(0, 500);
    console.error("[resposta-ia]", motivo);
    await fecharFila("enviado", motivo);
    return fim("falhou", motivo, { mensagens: enviadas, turno, leituras });
  }

  // Resposta interrompida (humano assumiu no meio): as ações não rodam.
  const acoes =
    enviadas.length === turno.mensagens.length
      ? await executarAcoes(
          supabase,
          {
            leadId,
            sessionId,
            agentId,
            instancia: teste ? null : instancia,
            consultor,
            openaiKey: OPENAI_API_KEY,
            telefone,
          },
          turno.acoes,
        )
      : [];

  await fecharFila("enviado", null);
  return { resultado: "enviado", mensagens: enviadas, acoes, leituras, turno };
}

async function responderFalhaDaIA(
  supabase: SupabaseClient,
  instancia: InstanciaWhatsapp,
  leadId: string,
  telefone: string,
  sessionId: string,
  agentId: string,
) {
  await pauseAI(supabase, sessionId, agentId, "falha_ia");
  await supabase.from("interacoes").insert({
    lead_id: leadId,
    tipo: "sistema",
    canal: "sistema",
    conteudo:
      "A IA não conseguiu responder (falha técnica). O lead recebeu uma mensagem de espera e a IA foi pausada até alguém assumir.",
  });
  await enviarTextoRegistrado(
    supabase,
    (i, tel, txt) => sendWhatsAppText(i.api_url, i.api_key, i.instance_name, tel, txt),
    instancia,
    telefone,
    MENSAGEM_FALHA_IA,
    { lead_id: leadId, autor: "sistema" },
  ).catch((e) =>
    console.error("[resposta-ia] mensagem de espera não enviada:", (e as Error).message),
  );
  await notificarResponsaveis(
    supabase,
    leadId,
    {
      tipo: "ia_falhou",
      titulo: "Lead esperando atendimento",
      corpo: "A IA falhou ao responder e foi pausada. Assuma a conversa pelo CRM.",
    },
    instancia,
  );
}

export { jidDoTelefone };
