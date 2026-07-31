// Supabase Edge Function — AI sales agent chat completion (OpenAI gpt-4o-mini).
// Qualifies leads and drives toward scheduling a site visit, never closing the sale in-chat.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = (Deno.env.get("OPENAI_API_KEY") ?? "")
  .trim()
  .replace(/[\r\n\t]/g, "")
  .replace(/[^\x20-\x7E]/g, "");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const OPENAI_MODEL = "gpt-4o-mini";
const VISITA_AGENDADA_TAG = "[VISITA_AGENDADA]";
const TRANSFERIR_HUMANO_TAG = "[TRANSFERIR_HUMANO]";
// Mesma marca que whatsapp-webhook.ts procura para disparar a atribuição por
// round-robin (LEAD_QUALIFICADO_MARKER). Precisa bater exatamente — esse
// prompt padrão só citava [VISITA_AGENDADA]/[TRANSFERIR_HUMANO] antes, então
// se o agente ativo estivesse sem system_prompt customizado no banco, o
// round-robin nunca disparava.
const LEAD_QUALIFICADO_TAG = "[LEAD_QUALIFICADO]";

function buildSystemPrompt(knowledgeBase: string): string {
  return `Você é uma pessoa da equipe de vendas do Moradas de Paraty (Loteamento Residencial Sophia Saíde) conversando no WhatsApp. Seu objetivo é entender o que o lead procura e AGENDAR UMA VISITA ao terreno — nunca fechar venda pelo chat.

BASE DE CONHECIMENTO DO EMPREENDIMENTO:
${knowledgeBase}

COMO ESCREVER:
- Português do Brasil, direto e natural — como alguém da equipe escrevendo no WhatsApp, não um script de atendimento.
- Use contrações e frases curtas. Evite repetir saudação ("Estou muito bem, obrigada...") a cada mensagem.
- NUNCA pergunte de novo algo que o lead já respondeu nesta conversa — releia o histórico acima antes de perguntar qualquer coisa. Se não tiver certeza se algo já foi dito, prossiga sem perguntar de novo em vez de arriscar repetir.
- Intercale as perguntas de qualificação com uma reação curta ao que a pessoa acabou de dizer — não dispare pergunta atrás de pergunta como formulário.
- Quebre respostas mais longas em 2-3 mensagens curtas separadas por ||, como alguém digitando em partes.

O QUE DESCOBRIR AO LONGO DA CONVERSA (sem parecer interrogatório):
nome, cidade, objetivo (moradia/investimento/temporada), metragem de interesse, forma de pagamento preferida.

REGRAS:
- Nunca invente valor ou condição que não esteja na base de conhecimento — se perguntarem algo fora dela, diga que vai confirmar com a equipe.
- Depois de entender o que a pessoa procura, proponha agendar a visita.
- Assim que tiver nome + cidade + objetivo coletados, responda com ${LEAD_QUALIFICADO_TAG} no início da mensagem (isso não aparece pro lead, é um sinal interno).
- Quando o lead confirmar visita, responda com ${VISITA_AGENDADA_TAG} no início da mensagem.
- Quando o lead quiser falar com humano, responda com ${TRANSFERIR_HUMANO_TAG}.`;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  agent_id: string;
  message: string;
  contact_phone: string;
  contact_name?: string | null;
  lead_id: string | null;
  session_id: string;
  // Histórico explícito, opcional — usado pelo painel "Testar Agente", que
  // não tem um lead_id real pra buscar no banco. Quando ausente, cai no
  // fallback de buscar em whatsapp_messages por lead_id (fluxo real do
  // WhatsApp).
  history?: ChatMessage[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ChatRequestBody = await req.json();
    const { agent_id, message, lead_id, session_id, history: explicitHistory } = body;

    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const { data: agent, error: agentError } = await supabase
      .from("ai_agents")
      .select("*")
      .eq("id", agent_id)
      .single();
    if (agentError || !agent) {
      return new Response(JSON.stringify({ error: "agent not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: ragConfig } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", "rag_conhecimento")
      .maybeSingle();
    const knowledgeBase = ragConfig?.valor ?? "Nenhuma informação cadastrada ainda.";

    // lead_id=null (painel de teste) faz .eq("lead_id", null) não casar NADA
    // no Postgres — NULL nunca é igual a NULL. Sem lead_id, a busca no banco
    // é pulada e usamos o histórico explícito mandado no corpo da requisição.
    let history: ChatMessage[];
    if (explicitHistory) {
      history = explicitHistory;
    } else if (lead_id) {
      const { data: historyRows } = await supabase
        .from("whatsapp_messages")
        .select("content, from_me, created_at")
        .eq("lead_id", lead_id)
        .order("created_at", { ascending: false })
        .limit(10);

      history = (historyRows ?? [])
        .slice()
        .reverse()
        .map((row) => ({
          role: row.from_me ? "assistant" : ("user" as const),
          content: row.content ?? "",
        }));

      // O whatsapp-webhook grava a mensagem recebida no banco ANTES de
      // chamar esta function, então ela já vem dentro dos "últimos 10" acima
      // — sem isto, ela seria enviada duplicada (uma vez do histórico, outra
      // já embaixo como a mensagem atual).
      const last = history[history.length - 1];
      if (last && last.role === "user" && last.content === message) {
        history = history.slice(0, -1);
      }
    } else {
      history = [];
    }

    const systemPrompt = agent.system_prompt || buildSystemPrompt(knowledgeBase);

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: new Headers([
        ["Content-Type", "application/json"],
        ["Authorization", `Bearer ${OPENAI_API_KEY}`],
      ]),
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: 1000,
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: message },
        ],
      }),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${errText}`);
    }

    const openaiResult = await openaiResponse.json();
    const rawText: string = openaiResult.choices?.[0]?.message?.content ?? "";

    const hasVisitaAgendada = rawText.includes(VISITA_AGENDADA_TAG);
    const hasTransferirHumano = rawText.includes(TRANSFERIR_HUMANO_TAG);

    const cleanedText = rawText
      .replace(VISITA_AGENDADA_TAG, "")
      .replace(TRANSFERIR_HUMANO_TAG, "")
      .trim();

    const messages = cleanedText
      .split("||")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    // Conversation bookkeeping
    let { data: conversation } = await supabase
      .from("ai_agent_conversations")
      .select("id")
      .eq("session_id", session_id)
      .eq("status", "active")
      .maybeSingle();

    if (!conversation) {
      const { data: created } = await supabase
        .from("ai_agent_conversations")
        .insert({ agent_id, session_id, status: "active" })
        .select("id")
        .single();
      conversation = created;
    }

    if (hasVisitaAgendada) {
      await supabase.from("leads").update({ status_crm: "agendado" }).eq("id", lead_id);
    }

    if (hasTransferirHumano && conversation) {
      await supabase.from("ai_agent_human_takeover").insert({
        conversation_id: conversation.id,
        human_takeover_at: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify({ messages, session_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ai-agent-chat error", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
