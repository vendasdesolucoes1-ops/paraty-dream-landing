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

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isHumanTakeoverActive, pauseAI } from "./ai-takeover.ts";
import { sendWhatsAppText } from "./evolution-send.ts";
import { enviarTextoRegistrado, jidDoTelefone } from "./envio-registrado.ts";
import { fetchComRetry } from "./http.ts";
import { handleLeadQualification } from "./lead-qualification.ts";
import { handleVisitaAgendada } from "./lead-visita.ts";
import { MENSAGEM_VISITA_A_CONFIRMAR } from "./janela-visita.ts";
import { notificarResponsaveis } from "./notificar.ts";
import { temTexto } from "./mensagem-entrada.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

async function finalizar(
  supabase: SupabaseClient,
  filaId: string,
  leadId: string,
  inicio: string,
  erro: string | null,
) {
  // Chegou mensagem nova do lead enquanto esta resposta era gerada: a linha
  // volta para a fila, e a próxima resposta já considera a conversa inteira.
  const { data: novas } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("lead_id", leadId)
    .eq("from_me", false)
    .neq("content", "")
    .gt("created_at", inicio)
    .limit(1);

  const agora = new Date().toISOString();
  if (novas?.length) {
    await supabase
      .from("mensagens_agendadas")
      .update({ status: "pendente", agendado_para: agora, erro: null, atualizado_em: agora })
      .eq("id", filaId);
    return;
  }
  await supabase
    .from("mensagens_agendadas")
    .update({ status: "enviado", enviado_em: agora, erro, atualizado_em: agora })
    .eq("id", filaId);
}

interface Opcoes {
  /** Caminho rápido (webhook): espera o debounce antes de reivindicar. */
  aguardarDebounce?: boolean;
  /** Quando a mensagem que disparou o debounce foi recebida. */
  recebidaEm?: string;
  /** Linha já reivindicada pelo cron (caminho durável). */
  filaId?: string;
}

/**
 * Gera e envia a resposta da Sophia para o lead. Seguro para chamar em
 * paralelo: só quem reivindica a linha da fila responde.
 */
export async function responderLead(
  supabase: SupabaseClient,
  instancia: InstanciaWhatsapp,
  leadId: string,
  opcoes: Opcoes = {},
): Promise<ResultadoResposta> {
  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead?.telefone) return "abortado";
  const telefone = String(lead.telefone).replace(/\D/g, "");
  const sessionId = telefone;

  if (opcoes.aguardarDebounce) {
    await digitando(instancia, telefone);
    await dormir(DEBOUNCE_MS);
    if (opcoes.recebidaEm) {
      const { data: maisNovas } = await supabase
        .from("whatsapp_messages")
        .select("id")
        .eq("lead_id", leadId)
        .eq("from_me", false)
        // Mídia/áudio sem texto não dispara resposta (issue #55): não pode
        // abortar a resposta a um texto anterior.
        .neq("content", "")
        .gt("created_at", opcoes.recebidaEm)
        .limit(1);
      // A mensagem mais nova tem o próprio debounce: ela responde.
      if (maisNovas?.length) return "abortado";
    }
  }

  const filaId = opcoes.filaId ?? (await reivindicar(supabase, leadId));
  if (!filaId) return "abortado";
  const inicio = new Date().toISOString();

  const cancelar = async (motivo: string) => {
    await supabase
      .from("mensagens_agendadas")
      .update({ status: "cancelado", erro: motivo, atualizado_em: new Date().toISOString() })
      .eq("id", filaId);
  };

  if (await isHumanTakeoverActive(supabase, sessionId)) {
    await cancelar("atendimento humano em andamento");
    return "abortado";
  }

  const { data: agente } = await supabase
    .from("ai_agents")
    .select("id")
    .eq("instance_id", instancia.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!agente) {
    await cancelar("IA desativada");
    return "abortado";
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

  // Nunca chama o modelo com mensagem vazia: a Sophia responderia a algo que
  // não leu (áudio, mídia sem legenda). O webhook já trata esses casos.
  if (!temTexto(ultima?.content)) {
    await cancelar("mensagem sem texto");
    return "abortado";
  }

  const resposta = await fetchComRetry(
    `${SUPABASE_URL}/functions/v1/ai-agent-chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        agent_id: agente.id,
        message: String(ultima!.content).trim(),
        contact_phone: telefone,
        contact_name: lead.nome ?? null,
        lead_id: leadId,
        session_id: sessionId,
      }),
    },
    { timeoutMs: 60_000 },
  ).catch((e) => e as Error);

  if (resposta instanceof Error || !resposta.ok) {
    const motivo = resposta instanceof Error ? resposta.message : `HTTP ${resposta.status}`;
    console.error("[resposta-ia] IA falhou", { leadId, motivo });
    await responderFalhaDaIA(supabase, instancia, leadId, telefone, sessionId, agente.id);
    await finalizar(supabase, filaId, leadId, inicio, `IA falhou: ${motivo}`.slice(0, 500));
    return "falhou";
  }

  const resultado = await resposta.json();
  let partes = ((resultado.messages ?? []) as string[])
    .map((m) => String(m).trim())
    .filter((m) => m.length > 0);

  if (resultado.lead_qualificado) {
    await handleLeadQualification(supabase, lead, instancia, OPENAI_API_KEY).catch((e) =>
      console.error("[resposta-ia] pós-qualificação falhou:", (e as Error)?.message),
    );
  }
  if (resultado.visita_agendada) {
    const visita = await handleVisitaAgendada(supabase, lead, OPENAI_API_KEY, instancia).catch(
      (e) => {
        console.error("[resposta-ia] criação da visita falhou:", (e as Error)?.message);
        return null;
      },
    );
    // Fora da janela ou em conflito na agenda do vendedor: a confirmação que o
    // modelo escreveu não sai — o lead fica sabendo que o horário vai ser
    // confirmado, e o vendedor já foi avisado.
    if (visita?.aConfirmar) {
      partes = MENSAGEM_VISITA_A_CONFIRMAR.split("||").map((m) => m.trim());
    }
  }

  if (partes.length === 0) {
    await finalizar(supabase, filaId, leadId, inicio, null);
    return "sem_resposta";
  }

  const { data: contato } = await supabase
    .from("whatsapp_contacts")
    .select("id")
    .eq("phone", telefone)
    .maybeSingle();

  for (const [indice, texto] of partes.entries()) {
    if (indice > 0) {
      // Um vendedor pode ter assumido no meio da resposta: a máquina para.
      if (await isHumanTakeoverActive(supabase, sessionId)) break;
      await digitando(instancia, telefone);
      await dormir(atrasoHumano(texto));
    }
    await enviarTextoRegistrado(
      supabase,
      (i, tel, txt) => sendWhatsAppText(i.api_url, i.api_key, i.instance_name, tel, txt),
      instancia,
      telefone,
      texto,
      { lead_id: leadId, contact_id: (contato?.id as string | undefined) ?? null },
    );
  }

  await finalizar(supabase, filaId, leadId, inicio, null);
  return "enviado";
}

async function responderFalhaDaIA(
  supabase: SupabaseClient,
  instancia: InstanciaWhatsapp,
  leadId: string,
  telefone: string,
  sessionId: string,
  agentId: string,
) {
  await pauseAI(supabase, sessionId, agentId);
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
    { lead_id: leadId },
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
