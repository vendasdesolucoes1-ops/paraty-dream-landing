// Supabase Edge Function — AI sales agent chat completion (Claude Haiku).
// Qualifies leads and drives toward scheduling a site visit, never closing the sale in-chat.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CLAUDE_MODEL = "claude-haiku-4-5";
const VISITA_AGENDADA_TAG = "[VISITA_AGENDADA]";
const TRANSFERIR_HUMANO_TAG = "[TRANSFERIR_HUMANO]";

function buildSystemPrompt(knowledgeBase: string): string {
  return `Você é um assistente comercial do Loteamento Residencial Sophia Saíde (Moradas de Paraty). Seu objetivo ÚNICO é qualificar o lead e AGENDAR UMA VISITA ao terreno. Não feche vendas na conversa — conduza sempre para o agendamento da visita.

BASE DE CONHECIMENTO DO EMPREENDIMENTO:
${knowledgeBase}

REGRAS:
- Responda sempre em português brasileiro, tom cordial e profissional
- Colete: nome, cidade, objetivo (moradia/investimento/temporada), metragem de interesse, forma de pagamento preferida
- Após coletar essas informações, proponha agendamento de visita
- Nunca invente valores ou condições que não estejam na base de conhecimento
- Se perguntarem sobre algo que não está na base, diga que vai verificar com a equipe
- Quando o lead confirmar visita, responda com [VISITA_AGENDADA] no início da mensagem
- Quando o lead quiser falar com humano, responda com [TRANSFERIR_HUMANO]
- Quebre respostas longas em 2-3 mensagens curtas separadas por ||`;
}

interface ChatRequestBody {
  agent_id: string;
  message: string;
  contact_phone: string;
  contact_name?: string | null;
  lead_id: string;
  session_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ChatRequestBody = await req.json();
    const { agent_id, message, lead_id, session_id } = body;

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

    const { data: historyRows } = await supabase
      .from("whatsapp_messages")
      .select("content, from_me, created_at")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const history = (historyRows ?? [])
      .slice()
      .reverse()
      .map((row) => ({
        role: row.from_me ? "assistant" : "user",
        content: row.content ?? "",
      }));

    const systemPrompt = agent.system_prompt || buildSystemPrompt(knowledgeBase);

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [...history, { role: "user", content: message }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      throw new Error(`Anthropic API error: ${errText}`);
    }

    const anthropicResult = await anthropicResponse.json();
    const rawText: string = (anthropicResult.content ?? [])
      .map((block: { text?: string }) => block.text ?? "")
      .join("");

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
