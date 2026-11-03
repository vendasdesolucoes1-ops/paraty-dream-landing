// Supabase Edge Function — Sophia pelo painel (Configurações → Agente IA).
//
// O cérebro mora em _shared/sophia.ts e o caminho completo de uma resposta em
// _shared/resposta-ia.ts (o mesmo que o webhook usa). Aqui ficam só as ações
// do painel:
//   testar         — "Testar agente": grava a mensagem no lead de teste e roda
//                    o caminho de produção (decisão, histórico, pausa, opt-out,
//                    ferramentas, ações), sem WhatsApp e sem debounce.
//   simular_equipe — grava uma mensagem "da equipe pelo celular" no lead de
//                    teste e pausa a IA, como o webhook faz.
//   ultimo_prompt  — o que foi de fato enviado ao modelo na última chamada.
//   preview_prompt — o prompt que seria montado agora para um lead.
//   (sem ação)     — compatibilidade com o painel antigo: responde sem gravar.
//
// Só gestão (admin/gestor), service_role ou o segredo ai_agent_chat_secret.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { exigirChamador, PAPEIS_GESTAO } from "../_shared/auth.ts";
import { pauseAI } from "../_shared/ai-takeover.ts";
import { bloquearPorPedidoDeParada, ehPedidoDeParada } from "../_shared/contato-bloqueado.ts";
import { jidDoTelefone } from "../_shared/envio-registrado.ts";
import { responderLead } from "../_shared/resposta-ia.ts";
import {
  carregarContexto,
  carregarHistorico,
  gerarRespostaSophia,
  montarPromptSistema,
} from "../_shared/sophia.ts";
import { resolverConhecimento } from "../_shared/rag.ts";
import { lerConsultor, type Consultor, type MensagemModelo } from "../_shared/sophia-regras.ts";
import { temTexto } from "../_shared/mensagem-entrada.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = (Deno.env.get("OPENAI_API_KEY") ?? "")
  .trim()
  .replace(/[\r\n\t]/g, "")
  .replace(/[^\x20-\x7E]/g, "");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface PerfilTeste {
  nome?: string | null;
  cidade?: string | null;
  finalidade?: string | null;
  prazo_compra?: string | null;
  quer_visitar?: string | null;
  campanha_nome?: string | null;
}

/** Lead de teste novo, com telefone fictício único (não existe no WhatsApp). */
async function criarLeadDeTeste(perfil: PerfilTeste | null): Promise<string> {
  const telefone = `5500${String(Date.now()).slice(-9)}`;
  const deFormulario = Boolean(perfil?.prazo_compra || perfil?.quer_visitar);
  const { data, error } = await supabase
    .from("leads")
    .insert({
      nome: perfil?.nome?.trim() || "Lead de Teste (painel)",
      telefone,
      cidade: perfil?.cidade ?? null,
      origem: deFormulario ? "formulario_meta" : "whatsapp",
      status_crm: deFormulario ? "qualificado" : "novo",
      is_teste: true,
      finalidade: perfil?.finalidade ?? null,
      prazo_compra: perfil?.prazo_compra ?? null,
      quer_visitar: perfil?.quer_visitar ?? null,
      campanha_nome: perfil?.campanha_nome ?? null,
      formulario_nome: deFormulario ? "Formulário de teste" : null,
      leadgen_id: deFormulario ? `teste-${crypto.randomUUID()}` : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function leadDeTeste(leadId: string | null, perfil: PerfilTeste | null) {
  if (leadId) {
    const { data } = await supabase
      .from("leads")
      .select("id, telefone, is_teste")
      .eq("id", leadId)
      .maybeSingle();
    if (!data?.is_teste) throw new Error("o teste só roda em lead de teste");
    return { id: data.id as string, telefone: String(data.telefone) };
  }
  const id = await criarLeadDeTeste(perfil);
  const { data } = await supabase.from("leads").select("telefone").eq("id", id).single();
  return { id, telefone: String(data!.telefone) };
}

async function linhasDeAcao(leadId: string, desde: string): Promise<string[]> {
  const { data } = await supabase
    .from("interacoes")
    .select("conteudo")
    .eq("lead_id", leadId)
    .eq("canal", "sophia_acao")
    .gte("created_at", desde)
    .order("created_at");
  return (data ?? []).map((r) => String(r.conteudo));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Gestão pelo painel, service_role, ou o segredo interno (bancada de testes).
  const chamador = await exigirChamador(req, {
    papeis: PAPEIS_GESTAO,
    segredos: ["ai_agent_chat_secret"],
  });
  if (chamador instanceof Response) return chamador;

  try {
    const body = await req.json();
    const acao = String(body.action ?? "");
    const agentId = String(body.agent_id ?? "");
    if (!agentId) return json({ error: "agent_id obrigatório" }, 400);

    if (acao === "ultimo_prompt") {
      const { data } = await supabase
        .from("ai_chamadas")
        .select(
          "criado_em, canal, modelo, temperatura, lead_id, prompt, mensagens, resposta, ferramentas, tokens_entrada, tokens_saida, custo_usd, latencia_ms, erro",
        )
        .eq("funcao", "sophia")
        .not("prompt", "is", null)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      return json({ ok: true, chamada: data ?? null });
    }

    if (acao === "preview_prompt") {
      const leadId = (body.lead_id as string | null) ?? null;
      const mensagem = String(body.message ?? "");
      const ctx = await carregarContexto(supabase, agentId, leadId);
      const historico = leadId ? await carregarHistorico(supabase, leadId, mensagem) : [];
      const conhecimento = await resolverConhecimento(supabase, OPENAI_API_KEY, {
        baseCompleta: ctx.baseConhecimento,
        modoConfigurado: ctx.ragModo,
        message: mensagem,
        history: historico.filter((m) => m.role !== "system") as never,
      });
      return json({
        ok: true,
        prompt: montarPromptSistema(ctx, conhecimento, new Date()),
        usa_prompt_customizado: Boolean(String(ctx.agent.system_prompt ?? "").trim()),
        lotes_disponiveis: ctx.lotes.length,
        rag: { modo: conhecimento.modo, motivo_recuo: conhecimento.motivoRecuo },
      });
    }

    if (acao === "simular_equipe") {
      const lead = await leadDeTeste(body.lead_id ?? null, body.perfil ?? null);
      const texto = String(body.message ?? "").trim();
      if (!temTexto(texto)) return json({ error: "mensagem vazia" }, 400);
      await supabase.from("whatsapp_messages").insert({
        lead_id: lead.id,
        remote_jid: jidDoTelefone(lead.telefone),
        message_id: `teste:${crypto.randomUUID()}`,
        from_me: true,
        autor: "equipe_celular",
        message_type: "text",
        content: texto,
        status: "sent",
      });
      await pauseAI(supabase, lead.telefone, agentId, "equipe_celular");
      return json({ ok: true, lead_id: lead.id, pausada: true });
    }

    if (acao === "testar") {
      const texto = String(body.message ?? "").trim();
      if (!temTexto(texto)) return json({ error: "mensagem vazia" }, 400);
      const lead = await leadDeTeste(body.lead_id ?? null, body.perfil ?? null);
      const inicio = new Date().toISOString();

      // Mesmo que o webhook: a mensagem do lead é gravada primeiro.
      await supabase.from("whatsapp_messages").insert({
        lead_id: lead.id,
        remote_jid: jidDoTelefone(lead.telefone),
        message_id: `teste:${crypto.randomUUID()}`,
        from_me: false,
        autor: "lead",
        message_type: "text",
        content: texto,
        status: "received",
      });
      if (ehPedidoDeParada(texto)) await bloquearPorPedidoDeParada(supabase, lead.id);

      const consultor: Consultor | null = lerConsultor(body.consultor_teste ?? null);
      const detalhe = await responderLead(supabase, null, lead.id, {
        teste: { agentId, consultor, modelo: (body.modelo as string | null) ?? null },
      });
      return json({
        ok: true,
        lead_id: lead.id,
        resultado: detalhe.resultado,
        motivo: detalhe.motivo ?? null,
        messages: detalhe.mensagens,
        acoes: await linhasDeAcao(lead.id, inicio),
        leituras: detalhe.leituras,
        modelo: detalhe.turno?.modelo ?? null,
        atalho: detalhe.turno?.atalho ?? null,
      });
    }

    // Compatibilidade: painel antigo manda {message, history} e espera {messages}.
    const mensagem = String(body.message ?? "").trim();
    if (!temTexto(mensagem)) return json({ error: "mensagem sem texto" }, 400);
    const historico = ((body.history ?? []) as MensagemModelo[]).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? ""),
    })) as MensagemModelo[];
    const turno = await gerarRespostaSophia(supabase, OPENAI_API_KEY, {
      agentId,
      leadId: null,
      sessionId: String(body.session_id ?? "painel"),
      mensagem,
      canal: "teste",
      historicoExplicito: historico,
    });
    return json({
      messages: turno.mensagens,
      session_id: body.session_id ?? null,
      acoes: [
        ...turno.leituras,
        ...turno.acoes.map((a) => ({ ferramenta: a.tipo, resumo: a.resumo })),
      ],
    });
  } catch (error) {
    console.error("ai-agent-chat error", error);
    return json({ error: String((error as Error)?.message ?? error) }, 500);
  }
});
