// Processador da fila `mensagens_agendadas`.
//
// Acionado por pg_cron a cada minuto, via net.http_post (ver a migration
// 20260809000000_fila_mensagens_agendadas.sql). O cron não sabe nada de
// WhatsApp: ele só cutuca esta função, e toda a lógica de envio segue em
// TypeScript, reaproveitando sendWhatsAppText.
//
// Por que uma fila em vez de esperar dentro da própria function: esperar com
// setTimeout dentro de EdgeRuntime.waitUntil amarra a entrega ao ciclo de vida
// de um isolate efêmero, e quando ele é recolhido a mensagem some sem erro
// nenhum no log. Aqui cada tentativa deixa estado consultável.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { exigirChamador } from "../_shared/auth.ts";
import {
  sendWhatsAppAudio,
  sendWhatsAppMedia,
  sendWhatsAppText,
  type EvolutionMediaType,
} from "../_shared/evolution-send.ts";
import { confirmarEnvio, descartarEnvio, registrarEnvio } from "../_shared/envio-registrado.ts";
import { podeAbordar } from "../_shared/primeiro-contato.ts";
import { responderLead, type InstanciaWhatsapp } from "../_shared/resposta-ia.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 20 × 4 partes × 1,5s ≈ 2 min, com folga sobre o wall clock. Como o cron roda
// de minuto em minuto, o que sobrar sai na execução seguinte.
const LOTE = 20;

/** Pausa entre as partes, como alguém digitando em blocos. */
const PAUSA_ENTRE_PARTES_MS = 1500;

/** Backoff exponencial entre tentativas: 2, 8 e 32 min (mais jitter). */
const BACKOFF_BASE_MS = 2 * 60 * 1000;

/** Instância caída não é falha da mensagem: espera mais um pouco e tenta de novo. */
const SEM_INSTANCIA_MS = 5 * 60 * 1000;

const MAX_TENTATIVAS = 3;

async function agenteAtivo(instanceId: string) {
  const { data, error } = await supabase
    .from("ai_agents")
    .select("is_active")
    .eq("instance_id", instanceId)
    .eq("is_active", true)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function adiarPorPausa(m: MensagemAgendada) {
  const { error } = await supabase
    .from("mensagens_agendadas")
    .update({
      status: "pendente",
      agendado_para: new Date(Date.now() + 60_000).toISOString(),
      erro: "IA desativada",
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", m.id);
  if (error) throw error;
}

interface MensagemAgendada {
  id: string;
  lead_id: string;
  tipo: string;
  telefone: string;
  partes: string[];
  tentativas: number;
  partes_enviadas?: number | null;
  instance_id?: string | null;
  inscricao_id?: string | null;
  /** Mídia da campanha, enviada depois do texto (conta como a última parte). */
  midia?: { url: string; tipo: EvolutionMediaType | "audio"; nome?: string } | null;
}

/** Envios ativos de follow-up: cadência e campanha. */
const TIPOS_FOLLOW_UP = new Set(["cadencia", "campanha"]);

/** Texto do histórico do CRM para cada tipo de envio ativo. */
const DESCRICAO_ENVIO: Record<string, string> = {
  primeiro_contato:
    "Sophia iniciou a conversa por WhatsApp após o preenchimento do formulário do site.",
  cadencia: "Mensagem de follow-up enviada pela cadência automática.",
  campanha: "Mensagem de campanha enviada por WhatsApp.",
};

/** Meia-noite do dia seguinte em Brasília (UTC-3, sem horário de verão). */
function inicioDoProximoDia(agora = new Date()): string {
  const local = new Date(agora.getTime() - 3 * 3600_000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1, 3, 0),
  ).toISOString();
}

interface Instancia {
  id: string;
  api_url: string;
  api_key: string;
  instance_name: string;
}

type ClasseErro = "transitorio" | "permanente" | "instancia";

/**
 * Classifica a falha de envio. Instância caída não é culpa da mensagem (não
 * conta tentativa); 4xx da Evolution (número inexistente, payload inválido)
 * não melhora com retry; o resto (timeout, 5xx, rede) é transitório.
 */
function classificarErro(motivo: string): ClasseErro {
  if (/connection closed|not connected|instance.*(not found|closed)|desconect/i.test(motivo)) {
    return "instancia";
  }
  const status = Number(/error: (\d{3})/.exec(motivo)?.[1] ?? 0);
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return "permanente";
  return "transitorio";
}

/** Devolve a mensagem para 'pendente' no futuro, ou desiste (dead-letter). */
async function marcarFalha(m: MensagemAgendada, motivo: string) {
  const classe = classificarErro(motivo);
  const agora = new Date().toISOString();

  if (classe === "instancia") {
    await supabase
      .from("mensagens_agendadas")
      .update({
        status: "pendente",
        erro: motivo.slice(0, 2000),
        agendado_para: new Date(Date.now() + SEM_INSTANCIA_MS).toISOString(),
        atualizado_em: agora,
      })
      .eq("id", m.id);
    return;
  }

  const tentativas = m.tentativas + 1;
  const desistir = classe === "permanente" || tentativas >= MAX_TENTATIVAS;
  const base = BACKOFF_BASE_MS * 4 ** (tentativas - 1);
  const espera = base + Math.floor(Math.random() * (base / 2));

  await supabase
    .from("mensagens_agendadas")
    .update({
      status: desistir ? "erro" : "pendente",
      tentativas,
      erro: `[${classe}] ${motivo}`.slice(0, 2000),
      agendado_para: new Date(Date.now() + espera).toISOString(),
      atualizado_em: agora,
    })
    .eq("id", m.id);

  // Dead-letter não pode ser silencioso: a gestão é avisada no painel.
  if (desistir) {
    const { data: gestao } = await supabase
      .from("profiles")
      .select("id")
      .in("role", ["admin", "gestor"])
      .eq("ativo", true)
      .is("deletado_em", null);
    if (gestao?.length) {
      await supabase.from("notifications").insert(
        gestao.map((p) => ({
          user_id: p.id,
          type: "fila_erro",
          title: "Mensagem automática não enviada",
          body: `A mensagem "${m.tipo}" desistiu depois de ${tentativas} tentativa(s): ${motivo.slice(0, 200)}`,
          link: `/dashboard/crm?lead=${m.lead_id}`,
        })),
      );
    }
  }
}

/** Reagenda sem contar tentativa (ex.: fora da janela de envio). */
async function reagendar(m: MensagemAgendada, quando: string, motivo: string) {
  await supabase
    .from("mensagens_agendadas")
    .update({
      status: "pendente",
      agendado_para: quando,
      erro: motivo,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", m.id);
}

async function cancelar(m: MensagemAgendada, motivo: string) {
  await supabase
    .from("mensagens_agendadas")
    .update({ status: "cancelado", erro: motivo, atualizado_em: new Date().toISOString() })
    .eq("id", m.id);
}

/** Pergunta ao banco (pode_enviar) se este envio ativo pode sair agora. */
async function checarEnvio(
  m: MensagemAgendada,
  instanciaId: string,
): Promise<{ ok: boolean; motivo: string | null }> {
  // A instância entra para o limite diário e o aquecimento do número.
  const { data, error } = await supabase.rpc("pode_enviar", {
    p_lead_id: m.lead_id,
    p_tipo: m.tipo,
    p_instance_id: instanciaId,
  });
  // Falha fechada: sem resposta do banco, não envia agora.
  if (error) {
    console.error("[fila] pode_enviar falhou:", error.message);
    return { ok: false, motivo: "verificacao_indisponivel" };
  }
  const linha = Array.isArray(data) ? data[0] : data;
  return { ok: linha?.ok === true, motivo: linha?.motivo ?? null };
}

/** Motivos que encerram a mensagem; os demais só adiam. */
const MOTIVOS_DEFINITIVOS = new Set([
  "lead_inexistente",
  "opt_out",
  "sem_interesse",
  "convertido",
  "sem_base_legal",
  "takeover",
]);

async function aplicarRecusa(m: MensagemAgendada, motivo: string | null) {
  if (motivo && MOTIVOS_DEFINITIVOS.has(motivo)) {
    await cancelar(m, `pode_enviar: ${motivo}`);
    return;
  }
  if (motivo === "limite_diario") {
    // Cota do número acabou hoje: volta no começo da janela de amanhã.
    const { data: quando } = await supabase.rpc("proximo_horario_util", {
      p_agora: inicioDoProximoDia(),
    });
    await reagendar(
      m,
      (quando as string) ?? new Date(Date.now() + 12 * 3600_000).toISOString(),
      "limite diário da instância",
    );
    return;
  }
  if (motivo === "fora_da_janela") {
    const { data: quando } = await supabase.rpc("proximo_horario_util");
    await reagendar(
      m,
      (quando as string) ?? new Date(Date.now() + 3600_000).toISOString(),
      "fora da janela de envio",
    );
    return;
  }
  await reagendar(
    m,
    new Date(Date.now() + 5 * 60_000).toISOString(),
    `pode_enviar: ${motivo ?? "?"}`,
  );
}

/** Envia as partes e registra tudo no histórico do CRM. */
async function enviar(m: MensagemAgendada, instancia: Instancia) {
  const { data: contato } = await supabase
    .from("whatsapp_contacts")
    .select("id")
    .eq("phone", m.telefone)
    .maybeSingle();

  const partes = Array.isArray(m.partes) ? m.partes : [];
  // Retoma de onde parou: uma falha na parte 3 não reenvia as partes 1 e 2.
  const inicio = Math.min(Math.max(m.partes_enviadas ?? 0, 0), partes.length);

  for (let i = inicio; i < partes.length; i++) {
    const texto = partes[i];
    if (i > inicio) {
      await new Promise((r) => setTimeout(r, PAUSA_ENTRE_PARTES_MS));
      // O lead pode ter pedido para parar (ou um humano assumido) entre as
      // partes: a checagem vale antes de CADA parte, não só da primeira.
      const checagem = await checarEnvio(m, instancia.id);
      if (!checagem.ok) {
        await aplicarRecusa(m, checagem.motivo);
        return false;
      }
    }

    if (!(await agenteAtivo(instancia.id))) {
      // partes_enviadas já guarda até onde foi: ao retomar, nada se repete.
      await adiarPorPausa(m);
      return false;
    }

    // Gravado ANTES do envio, para o eco da Evolution encontrar a linha. Aqui
    // isso pesa mais que em qualquer outro lugar: são 4 partes em sequência,
    // ou seja, 4 ecos concorrendo com 4 inserts.
    const rowId = await registrarEnvio(supabase, {
      instance_id: instancia.id,
      contact_id: contato?.id ?? null,
      lead_id: m.lead_id,
      remote_jid: `${m.telefone}@s.whatsapp.net`,
      content: texto,
      mensagem_agendada_id: m.id,
    });

    try {
      const enviado = await sendWhatsAppText(
        instancia.api_url,
        instancia.api_key,
        instancia.instance_name,
        m.telefone,
        texto,
      );
      await confirmarEnvio(supabase, rowId, enviado?.key?.id);
    } catch (error) {
      await descartarEnvio(supabase, rowId);
      throw error;
    }

    m.partes_enviadas = i + 1;
    await supabase
      .from("mensagens_agendadas")
      .update({ partes_enviadas: i + 1, atualizado_em: new Date().toISOString() })
      .eq("id", m.id);
  }

  // Mídia por último, como no disparo antigo: texto e arquivo em duas
  // mensagens. Retomada não reenvia (partes_enviadas passa do texto).
  if (m.midia?.url && (m.partes_enviadas ?? 0) <= partes.length) {
    if (partes.length > 0) await new Promise((r) => setTimeout(r, PAUSA_ENTRE_PARTES_MS));
    const checagem = await checarEnvio(m, instancia.id);
    if (!checagem.ok) {
      await aplicarRecusa(m, checagem.motivo);
      return false;
    }
    if (!(await agenteAtivo(instancia.id))) {
      await adiarPorPausa(m);
      return false;
    }
    if (m.midia.tipo === "audio") {
      await sendWhatsAppAudio(
        instancia.api_url,
        instancia.api_key,
        instancia.instance_name,
        m.telefone,
        m.midia.url,
      );
    } else {
      await sendWhatsAppMedia(
        instancia.api_url,
        instancia.api_key,
        instancia.instance_name,
        m.telefone,
        {
          url: m.midia.url,
          tipo: m.midia.tipo,
          nomeArquivo: m.midia.nome,
        },
      );
    }
    m.partes_enviadas = partes.length + 1;
    await supabase
      .from("mensagens_agendadas")
      .update({ partes_enviadas: m.partes_enviadas, atualizado_em: new Date().toISOString() })
      .eq("id", m.id);
  }

  await supabase.from("interacoes").insert({
    lead_id: m.lead_id,
    tipo: "sistema",
    canal: "sistema",
    conteudo: DESCRICAO_ENVIO[m.tipo] ?? "Mensagem automática enviada por WhatsApp.",
  });
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const chamador = await exigirChamador(req, { segredos: ["cron_fila_secret"] });
  if (chamador instanceof Response) return chamador;

  try {
    // Reivindicação atômica (FOR UPDATE SKIP LOCKED no banco): duas execuções
    // sobrepostas do cron nunca pegam a mesma linha. Esta RPC também expira o
    // que está na fila há mais de 24h e recupera órfãs presas em 'enviando'.
    const { data, error } = await supabase.rpc("reivindicar_mensagens_agendadas", {
      p_limite: LOTE,
    });
    if (error) throw error;

    const mensagens = (data ?? []) as MensagemAgendada[];
    if (mensagens.length === 0) {
      return new Response(JSON.stringify({ ok: true, processadas: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Uma busca por lote, não por mensagem.
    // Instância escolhida de forma determinística: a do agente ativo, se
    // estiver conectada; senão a conectada mais antiga (auditoria R-34).
    const { data: conectadas } = await supabase
      .from("whatsapp_instances")
      .select("id, api_url, api_key, instance_name")
      .in("status", ["connected", "open"])
      .order("created_at", { ascending: true });
    const { data: agentesAtivos } = await supabase
      .from("ai_agents")
      .select("instance_id")
      .eq("is_active", true);
    const idsComAgente = new Set((agentesAtivos ?? []).map((a) => a.instance_id));
    const instancia =
      (conectadas ?? []).find((i) => idsComAgente.has(i.id)) ?? (conectadas ?? [])[0] ?? null;

    // Sem instância nada é consumido: as linhas voltam para pendente. A
    // tentativa não conta, porque a mensagem não tem culpa de a instância
    // estar fora do ar — quem limita esse caso é o teto de 24h.
    if (!instancia) {
      console.warn("[fila] nenhuma instância conectada", { adiadas: mensagens.length });
      const adiado = new Date(Date.now() + SEM_INSTANCIA_MS).toISOString();
      await supabase
        .from("mensagens_agendadas")
        .update({
          status: "pendente",
          agendado_para: adiado,
          erro: "nenhuma instância conectada",
          atualizado_em: new Date().toISOString(),
        })
        .in(
          "id",
          mensagens.map((m) => m.id),
        );

      return new Response(JSON.stringify({ ok: true, processadas: 0, sem_instancia: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let enviadas = 0;
    let canceladas = 0;
    let falhas = 0;

    const porId = new Map((conectadas ?? []).map((i) => [i.id, i]));

    for (const m of mensagens) {
      // Cadência com instância própria usa ela (se conectada); o resto, a padrão.
      const instanciaDoEnvio = (m.instance_id && porId.get(m.instance_id)) || instancia;
      try {
        // Resposta da Sophia que o caminho rápido do webhook não concluiu
        // (isolate recolhido no debounce, por exemplo). Não passa por
        // pode_enviar: é resposta a quem escreveu, não envio ativo.
        if (m.tipo === "resposta_ia") {
          // Responde pela instância em que o lead escreveu (gravada por
          // enfileirar_resposta_ia), não pela padrão.
          const resultado = await responderLead(
            supabase,
            instanciaDoEnvio as InstanciaWhatsapp,
            m.lead_id,
            {
              filaId: m.id,
            },
          );
          if (resultado === "enviado") enviadas++;
          continue;
        }

        // Regras de envio num só lugar (pode_enviar, no banco): opt-out, sem
        // interesse, takeover humano, convertido, base legal e janela de
        // horário. Entre o enfileiramento e agora qualquer uma pode ter mudado.
        const checagem = await checarEnvio(m, instanciaDoEnvio.id);
        if (!checagem.ok) {
          await aplicarRecusa(m, checagem.motivo);
          if (checagem.motivo && MOTIVOS_DEFINITIVOS.has(checagem.motivo)) canceladas++;
          continue;
        }

        // Entre o enfileiramento e agora o lead pode ter escrito primeiro — e
        // aí a conversa já está acontecendo. Abordar agora atropelaria.
        // Follow-up não passa por aqui: a resposta do lead já pausa a
        // cadência no banco, e lembrete de visita é para quem já conversa.
        if (!TIPOS_FOLLOW_UP.has(m.tipo) && !(await podeAbordar(supabase, m.lead_id))) {
          await supabase
            .from("mensagens_agendadas")
            .update({
              status: "cancelado",
              erro: "conversa já ativa com o lead",
              atualizado_em: new Date().toISOString(),
            })
            .eq("id", m.id);
          canceladas++;
          continue;
        }

        if (!(await agenteAtivo(instanciaDoEnvio.id))) {
          await adiarPorPausa(m);
          continue;
        }

        if (!(await enviar(m, instanciaDoEnvio as Instancia))) continue;

        // A instância que enviou fica no item: é ela que gasta a cota do dia.
        await supabase
          .from("mensagens_agendadas")
          .update({
            status: "enviado",
            instance_id: instanciaDoEnvio.id,
            enviado_em: new Date().toISOString(),
            erro: null,
            atualizado_em: new Date().toISOString(),
          })
          .eq("id", m.id);
        enviadas++;
      } catch (e) {
        // Falha de uma mensagem não derruba o lote.
        const motivo = (e as Error)?.message ?? String(e);
        console.error("[fila] envio falhou", { id: m.id, leadId: m.lead_id, motivo });
        await marcarFalha(m, motivo);
        falhas++;
      }
    }

    console.log("[fila] lote processado", { enviadas, canceladas, falhas });

    return new Response(
      JSON.stringify({ ok: true, processadas: mensagens.length, enviadas, canceladas, falhas }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[fila] erro:", error);
    return new Response(JSON.stringify({ error: (error as Error)?.message ?? String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
