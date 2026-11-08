// Executa as ações que a Sophia decidiu (sophia.ts) DEPOIS que a resposta foi
// de fato entregue. Cada ação vira uma linha "⚙ …" no histórico do lead.
//
// Idempotente onde importa: visita não duplica (índice único por lead+horário
// e reagendamento atualiza a visita futura existente), qualificação não avisa o
// vendedor duas vezes (handleLeadQualification guarda pelo histórico), bloqueio
// e transferência são estados.
//
// No teste ("Testar agente") tudo é gravado no CRM do lead de teste, mas nada
// sai pelo WhatsApp: nem material, nem aviso ao consultor.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { pauseAI } from "./ai-takeover.ts";
import { sendWhatsAppLocation, sendWhatsAppMedia, sendWhatsAppText } from "./evolution-send.ts";
import {
  enviarTextoRegistrado,
  jidDoTelefone,
  registrarEnvio,
  confirmarEnvio,
  descartarEnvio,
} from "./envio-registrado.ts";
import { handleLeadQualification } from "./lead-qualification.ts";
import { notificarResponsaveis } from "./notificar.ts";
import type { AcaoPendente, Material } from "./sophia.ts";
import { linkMaps, nomeDoConsultor, type Consultor } from "./sophia-regras.ts";

export interface InstanciaAcoes {
  id: string;
  api_url: string;
  api_key: string;
  instance_name: string;
}

export interface ContextoAcoes {
  leadId: string;
  sessionId: string;
  agentId: string | null;
  /** null = teste: nada sai pelo WhatsApp. */
  instancia: InstanciaAcoes | null;
  consultor: Consultor | null;
  openaiKey: string;
  telefone: string;
}

const ETAPAS_ANTES_DA_VISITA = ["novo", "qualificado", "nutricao", "perdido", "agendado"];
const ETAPAS_QUE_A_IA_PODE_REBAIXAR = new Set(["novo", "qualificado", "agendado", "nutricao"]);

async function linha(supabase: SupabaseClient, leadId: string, texto: string) {
  await supabase.from("interacoes").insert({
    lead_id: leadId,
    tipo: "sistema",
    canal: "sophia_acao",
    conteudo: `⚙ ${texto}`,
  });
}

/** Avisa o consultor responsável por WhatsApp (produção) além do sino. */
async function avisarConsultor(
  supabase: SupabaseClient,
  ctx: ContextoAcoes,
  aviso: { tipo: string; titulo: string; corpo: string },
) {
  await notificarResponsaveis(supabase, ctx.leadId, aviso, ctx.instancia);
  // notificarResponsaveis já manda WhatsApp ao vendedor DONO do lead; sem dono,
  // quem recebe é o consultor responsável cadastrado no painel.
  if (!ctx.instancia || !ctx.consultor?.telefone) return;
  const { data: lead } = await supabase
    .from("leads")
    .select("vendedor_id, nome, telefone, is_teste")
    .eq("id", ctx.leadId)
    .maybeSingle();
  if (lead?.vendedor_id || lead?.is_teste) return;
  const texto = `*${aviso.titulo}*\n${lead?.nome ?? "Lead"} (${lead?.telefone ?? ""})\n${aviso.corpo}`;
  await enviarTextoRegistrado(
    supabase,
    (i, tel, txt) => sendWhatsAppText(i.api_url, i.api_key, i.instance_name, tel, txt),
    ctx.instancia,
    ctx.consultor.telefone,
    texto,
    { autor: "sistema" },
  ).catch((e) => console.error("[sophia-acoes] aviso ao consultor falhou:", (e as Error).message));
}

async function registrarRecusa(supabase: SupabaseClient, leadId: string, semInteresse: boolean) {
  const { data: atual } = await supabase
    .from("leads")
    .select("recusas_visita, recusou_visita_em, sem_interesse_em, status_crm")
    .eq("id", leadId)
    .maybeSingle();
  if (!atual || atual.sem_interesse_em) return;
  const recusas = (atual.recusas_visita ?? 0) + (semInteresse ? 0 : 1);
  const vira = semInteresse || recusas >= 2;
  const agora = new Date().toISOString();
  const patch: Record<string, unknown> = {
    recusas_visita: recusas,
    recusou_visita_em: atual.recusou_visita_em ?? agora,
  };
  if (vira) {
    patch.sem_interesse_em = agora;
    if (ETAPAS_QUE_A_IA_PODE_REBAIXAR.has(atual.status_crm ?? "novo")) patch.status_crm = "perdido";
  }
  await supabase.from("leads").update(patch).eq("id", leadId);
}

async function agendar(
  supabase: SupabaseClient,
  ctx: ContextoAcoes,
  dados: Record<string, unknown>,
) {
  const { data: lead } = await supabase
    .from("leads")
    .select("id, vendedor_id, status_crm")
    .eq("id", ctx.leadId)
    .maybeSingle();
  const vendedorId = lead?.vendedor_id ?? ctx.consultor?.vendedor_id ?? null;
  const observacoes = [
    "Marcada pela Sophia.",
    dados.acompanhantes ? `Acompanhantes: ${dados.acompanhantes}.` : "",
    dados.observacao ? String(dados.observacao) : "",
    dados.status === "a_confirmar"
      ? `A CONFIRMAR: ${dados.motivo === "conflito_agenda" ? "conflito na agenda" : "fora dos horários de visita"}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Já tem visita futura? Reagenda a mesma em vez de criar outra.
  const { data: futura } = await supabase
    .from("visitas")
    .select("id, data_hora")
    .eq("lead_id", ctx.leadId)
    .in("status", ["agendada", "a_confirmar", "confirmada"])
    .gte("data_hora", new Date().toISOString())
    .order("data_hora")
    .limit(1)
    .maybeSingle();

  if (futura) {
    if (
      new Date(String(futura.data_hora)).getTime() !== new Date(String(dados.data_hora)).getTime()
    ) {
      await supabase
        .from("visitas")
        .update({
          data_hora: dados.data_hora,
          status: dados.status,
          observacoes,
          vendedor_id: vendedorId,
        })
        .eq("id", futura.id);
    }
  } else {
    const { error } = await supabase.from("visitas").insert({
      lead_id: ctx.leadId,
      vendedor_id: vendedorId,
      data_hora: dados.data_hora,
      status: dados.status,
      origem: "sophia",
      observacoes,
    });
    // 23505 = já existe (mesma ação repetida): idempotente.
    if (error && error.code !== "23505") throw error;
  }

  if (lead && ETAPAS_ANTES_DA_VISITA.includes(lead.status_crm ?? "novo")) {
    await supabase.from("leads").update({ status_crm: "agendado" }).eq("id", ctx.leadId);
  }

  await avisarConsultor(supabase, ctx, {
    tipo: dados.status === "a_confirmar" ? "visita_a_confirmar" : "visita_agendada",
    titulo: dados.status === "a_confirmar" ? "Visita a confirmar" : "Visita agendada pela Sophia",
    corpo: `${dados.quando}${dados.acompanhantes ? ` (+${dados.acompanhantes})` : ""}${
      dados.status === "a_confirmar" ? ". Confirme o horário com o lead." : "."
    }`,
  });
}

async function enviarMateriais(
  supabase: SupabaseClient,
  ctx: ContextoAcoes,
  ids: string[],
): Promise<string[]> {
  const { data } = await supabase.from("materiais_agente").select("*").in("id", ids);
  const materiais = (data ?? []) as Material[];
  const enviados: string[] = [];
  for (const m of materiais) {
    const descricao = m.tipo === "localizacao" ? `📍 ${m.titulo}` : `[${m.tipo}] ${m.titulo}`;
    if (!ctx.instancia) {
      // Teste: aparece na conversa do lead de teste, sem sair pelo WhatsApp.
      await supabase.from("whatsapp_messages").insert({
        lead_id: ctx.leadId,
        remote_jid: jidDoTelefone(ctx.telefone),
        message_id: `teste:${crypto.randomUUID()}`,
        from_me: true,
        autor: "sophia",
        message_type: m.tipo === "localizacao" ? "locationMessage" : "mediaMessage",
        content:
          m.tipo === "localizacao" && m.latitude != null && m.longitude != null
            ? `${descricao} — ${linkMaps(m.latitude, m.longitude)}`
            : `${descricao}${m.url ? ` — ${m.url}` : ""}`,
        media_url: m.url,
        status: "sent",
      });
      enviados.push(m.titulo);
      continue;
    }
    const rowId = await registrarEnvio(supabase, {
      instance_id: ctx.instancia.id,
      lead_id: ctx.leadId,
      remote_jid: jidDoTelefone(ctx.telefone),
      message_type: m.tipo === "localizacao" ? "locationMessage" : "mediaMessage",
      content: descricao,
      autor: "sophia",
    });
    try {
      const i = ctx.instancia;
      let r: { key?: { id?: string } } | null;
      if (m.tipo === "localizacao" && m.latitude != null && m.longitude != null) {
        r = await sendWhatsAppLocation(i.api_url, i.api_key, i.instance_name, ctx.telefone, {
          latitude: Number(m.latitude),
          longitude: Number(m.longitude),
          nome: m.titulo,
          endereco: m.endereco,
        });
      } else {
        r = await sendWhatsAppMedia(i.api_url, i.api_key, i.instance_name, ctx.telefone, {
          url: String(m.url),
          tipo: m.tipo === "pdf" ? "document" : m.tipo === "foto" ? "image" : "video",
          nomeArquivo: m.tipo === "pdf" ? `${m.titulo}.pdf` : undefined,
          caption: m.tipo === "pdf" ? undefined : (m.descricao ?? undefined),
        });
      }
      await confirmarEnvio(supabase, rowId, r?.key?.id);
      enviados.push(m.titulo);
    } catch (e) {
      await descartarEnvio(supabase, rowId);
      console.error("[sophia-acoes] material não enviado:", (e as Error).message);
    }
  }
  return enviados;
}

/**
 * Executa as ações, na ordem. Nunca lança: uma ação que falha vira linha de
 * erro no histórico e as demais seguem. Devolve as linhas "⚙" gravadas.
 */
export async function executarAcoes(
  supabase: SupabaseClient,
  ctx: ContextoAcoes,
  acoes: AcaoPendente[],
): Promise<string[]> {
  const feitas: string[] = [];
  for (const acao of acoes) {
    try {
      const d = acao.dados;
      switch (acao.tipo) {
        case "registrar_dados": {
          const patch = d.patch as Record<string, string>;
          if (patch && Object.keys(patch).length) {
            await supabase.from("leads").update(patch).eq("id", ctx.leadId);
          }
          break;
        }
        case "qualificar": {
          const { data: lead } = await supabase
            .from("leads")
            .select(
              "id, nome, telefone, cidade, objetivo, metragem_interesse, status_crm, vendedor_id, is_teste",
            )
            .eq("id", ctx.leadId)
            .maybeSingle();
          if (!lead) break;
          if (ctx.instancia) {
            await handleLeadQualification(supabase, lead as never, ctx.instancia, ctx.openaiKey);
          } else if (["novo", "nutricao", "perdido"].includes(lead.status_crm ?? "novo")) {
            await supabase.from("leads").update({ status_crm: "qualificado" }).eq("id", ctx.leadId);
          }
          break;
        }
        case "registrar_recusa":
          await registrarRecusa(supabase, ctx.leadId, d.tipo === "sem_interesse");
          break;
        case "agendar_visita":
          await agendar(supabase, ctx, d);
          break;
        case "transferir":
          await pauseAI(supabase, ctx.sessionId, ctx.agentId, "transferencia");
          await avisarConsultor(supabase, ctx, {
            tipo: "handoff",
            titulo: "Lead quer falar com o consultor",
            corpo: `${String(d.motivo ?? "Pediu atendimento humano")}. A IA pausou nesta conversa; responda pelo CRM ou pelo WhatsApp.`,
          });
          break;
        case "bloquear": {
          const { data: lead } = await supabase
            .from("leads")
            .select("status_crm")
            .eq("id", ctx.leadId)
            .maybeSingle();
          const patch: Record<string, unknown> = {
            contato_bloqueado: true,
            sem_interesse_em: new Date().toISOString(),
          };
          if (ETAPAS_QUE_A_IA_PODE_REBAIXAR.has(lead?.status_crm ?? "novo"))
            patch.status_crm = "perdido";
          await supabase.from("leads").update(patch).eq("id", ctx.leadId);
          break;
        }
        case "enviar_midia": {
          const enviados = await enviarMateriais(supabase, ctx, (d.ids as string[]) ?? []);
          if (!enviados.length) throw new Error("nenhum material saiu");
          break;
        }
      }
      const texto = `${acao.resumo}${ctx.instancia ? "" : " (teste)"}`;
      await linha(supabase, ctx.leadId, texto);
      feitas.push(texto);
    } catch (e) {
      const texto = `FALHOU: ${acao.resumo} — ${(e as Error)?.message ?? e}`.slice(0, 500);
      console.error("[sophia-acoes]", texto);
      await linha(supabase, ctx.leadId, texto);
      feitas.push(texto);
    }
  }
  return feitas;
}

export { nomeDoConsultor };
