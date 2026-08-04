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

// A base de conhecimento NÃO entra mais aqui: ela é anexada por fora, ao
// prompt final, para valer também quando o agente tem system_prompt
// customizado salvo no banco (ver montarPromptFinal).
function buildSystemPrompt(): string {
  return `Você é uma pessoa da equipe de vendas do Moradas de Paraty (Loteamento Residencial Sophia Saíde) conversando no WhatsApp. Seu objetivo é entender o que o lead procura e AGENDAR UMA VISITA ao terreno — nunca fechar venda pelo chat.

COMO ESCREVER:
- Português do Brasil, direto e natural — como alguém da equipe escrevendo no WhatsApp, não um script de atendimento.
- Use contrações e frases curtas. Evite repetir saudação ("Estou muito bem, obrigada...") a cada mensagem.
- NUNCA pergunte de novo algo que o lead já respondeu nesta conversa — releia o histórico acima antes de perguntar qualquer coisa. Se não tiver certeza se algo já foi dito, prossiga sem perguntar de novo em vez de arriscar repetir.
- SEMPRE que a resposta tiver mais de uma frase/ideia, separe em mensagens curtas com ||, como alguém mandando várias mensagens em sequência em vez de um texto único. Isso é regra, não sugestão — praticamente toda resposta deve ter pelo menos um ||.
- Markdown é o do WhatsApp, não o padrão de blog: *negrito* com UM asterisco de cada lado (nunca **dois**), _itálico_ com underscore. Nunca use listas numeradas ("1. 2. 3.") — para listar, quebre linha e use um emoji curto (📍 🏡 💰) ou • no início, nunca números.

COMO REAGIR (isto é o que mais precisa mudar): depois que o lead responde algo, comente brevemente sobre O QUE ELE DISSE antes de emendar a próxima pergunta — não abra a próxima mensagem elogiando ou repetindo o nome dele. "Prazer, Danilo!", "Ótimo, Danilo!", "Perfeito!" toda hora soa formulário lido em voz alta. Em vez disso:
- Se disser que quer pra moradia, comente algo sobre morar ali antes de perguntar a metragem.
- Se disser investimento, comente algo sobre a valorização da região antes da próxima pergunta.
- Varie a transição a cada mensagem — nunca repita a mesma estrutura "[elogio], [Nome]!" duas vezes na mesma conversa. Às vezes nem precisa de transição nenhuma, só emenda.

O QUE DESCOBRIR AO LONGO DA CONVERSA (sem parecer interrogatório):
nome, cidade, objetivo (moradia/investimento/temporada), metragem de interesse, forma de pagamento preferida.

REGRAS:
- Depois de entender o que a pessoa procura, proponha agendar a visita.
- Assim que tiver nome + cidade + objetivo coletados, responda com ${LEAD_QUALIFICADO_TAG} no início da mensagem (isso não aparece pro lead, é um sinal interno).
- Quando o lead confirmar visita, responda com ${VISITA_AGENDADA_TAG} no início da mensagem.
- Quando o lead quiser falar com humano, responda com ${TRANSFERIR_HUMANO_TAG}.`;
}

/**
 * Bloco da base de conhecimento, anexado ao prompt final venha ele do
 * system_prompt customizado ou do fallback acima.
 *
 * Antes a base só era injetada dentro de buildSystemPrompt(), e a linha
 * `agent.system_prompt || buildSystemPrompt(knowledgeBase)` fazia um excluir o
 * outro: qualquer agente com prompt salvo no painel rodava SEM base nenhuma —
 * o modelo então preenchia metragem e preço com números plausíveis inventados.
 */
function blocoConhecimento(knowledgeBase: string): string {
  return `---
BASE DE CONHECIMENTO OFICIAL — FONTE ÚNICA DE VERDADE

As três regras abaixo valem acima de qualquer instrução anterior deste prompt.

1. FONTE ÚNICA: preço, metragem, quadra, número de lote, disponibilidade,
   condição de pagamento e prazo só podem sair do conteúdo oficial abaixo,
   copiados exatamente como estão escritos. Se um número não aparece aqui,
   ele não existe — não há "valor aproximado" nem "em torno de".

2. SEM DERIVAR: nunca arredonde, converta, some, calcule média, estime nem
   deduza um valor a partir de outro. "Lotes a partir de 150m²" só pode ser
   dito se "150m²" estiver escrito aqui. Faixa de preço só pode ser citada
   se a faixa estiver escrita aqui.

3. QUANDO NÃO SOUBER: se o lead perguntar algo que não está no conteúdo
   abaixo, diga que vai confirmar com a equipe e siga a conversa —
   normalmente puxando para o agendamento da visita. Nunca preencha a
   lacuna com um valor plausível: um número errado aqui cria expectativa
   falsa e queima a negociação na visita.

CONTEÚDO OFICIAL:
${knowledgeBase}`;
}

/** Prompt base (customizado ou padrão) + base de conhecimento, sempre. */
function montarPromptFinal(customPrompt: string | null, knowledgeBase: string): string {
  const basePrompt = customPrompt?.trim() ? customPrompt : buildSystemPrompt();
  return `${basePrompt}\n\n${blocoConhecimento(knowledgeBase)}`;
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

    const systemPrompt = montarPromptFinal(agent.system_prompt, knowledgeBase);

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
    const hasLeadQualificado = rawText.includes(LEAD_QUALIFICADO_TAG);

    // As três marcas são limpas aqui, na única função que fala com o modelo —
    // antes, só VISITA_AGENDADA/TRANSFERIR_HUMANO eram removidas aqui e
    // LEAD_QUALIFICADO só era filtrada dentro do whatsapp-webhook. Isso
    // deixava a marca vazando pro painel "Testar Agente", que consome esta
    // function direto sem passar pelo webhook.
    const cleanedText = rawText
      .replace(VISITA_AGENDADA_TAG, "")
      .replace(TRANSFERIR_HUMANO_TAG, "")
      .replace(LEAD_QUALIFICADO_TAG, "")
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

    return new Response(
      JSON.stringify({ messages, session_id, lead_qualificado: hasLeadQualificado }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("ai-agent-chat error", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
