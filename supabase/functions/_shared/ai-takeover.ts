// Pausa/retomada do agente de IA quando um humano assume a conversa.
//
// A fonte da verdade é `ai_agent_human_takeover` (takeover aberto = linha com
// resolved_at nulo), ligada à conversa pelo `session_id`, que é sempre o
// telefone normalizado do lead. Não existe (nem deve existir) uma flag
// paralela em `leads`: dois estados para a mesma coisa divergem na primeira
// falha parcial.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Conversa ativa da sessão, criada sob demanda quando há um agente. */
async function getOrCreateConversation(
  supabase: SupabaseClient,
  sessionId: string,
  agentId: string | null,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("ai_agent_conversations")
    .select("id")
    .eq("session_id", sessionId)
    .eq("status", "active")
    .limit(1);

  if (existing && existing.length > 0) return existing[0].id as string;
  if (!agentId) return null;

  const { data: created } = await supabase
    .from("ai_agent_conversations")
    .insert({ agent_id: agentId, session_id: sessionId, status: "active" })
    .select("id")
    .single();

  return (created?.id as string) ?? null;
}

/**
 * true = um humano assumiu e a IA não deve responder.
 *
 * Usa limit(1) em vez de maybeSingle(): o PostgREST devolve erro quando
 * maybeSingle() encontra mais de uma linha, e o resultado nulo era
 * interpretado como "não pausado" — ou seja, a segunda intervenção manual
 * fazia a IA voltar a responder sozinha, justamente o contrário do esperado.
 */
export async function isHumanTakeoverActive(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<boolean> {
  const { data: conversations } = await supabase
    .from("ai_agent_conversations")
    .select("id")
    .eq("session_id", sessionId)
    .eq("status", "active")
    .limit(1);

  const conversationId = conversations?.[0]?.id;
  if (!conversationId) return false;

  const { data: takeovers } = await supabase
    .from("ai_agent_human_takeover")
    .select("id")
    .eq("conversation_id", conversationId)
    .is("resolved_at", null)
    .limit(1);

  return Boolean(takeovers && takeovers.length > 0);
}

/**
 * Marca que um humano assumiu. Idempotente: com um takeover já aberto não
 * insere outro — do contrário cada mensagem manual empilharia uma linha nova.
 */
export async function pauseAI(
  supabase: SupabaseClient,
  sessionId: string,
  agentId: string | null,
): Promise<void> {
  const conversationId = await getOrCreateConversation(supabase, sessionId, agentId);
  if (!conversationId) return;

  const { data: abertos } = await supabase
    .from("ai_agent_human_takeover")
    .select("id")
    .eq("conversation_id", conversationId)
    .is("resolved_at", null)
    .limit(1);

  if (abertos && abertos.length > 0) return;

  await supabase.from("ai_agent_human_takeover").insert({
    conversation_id: conversationId,
    human_takeover_at: new Date().toISOString(),
  });
}

/** Devolve a conversa para a IA fechando todos os takeovers em aberto. */
export async function resumeAI(supabase: SupabaseClient, sessionId: string): Promise<void> {
  const { data: conversations } = await supabase
    .from("ai_agent_conversations")
    .select("id")
    .eq("session_id", sessionId)
    .eq("status", "active")
    .limit(1);

  const conversationId = conversations?.[0]?.id;
  if (!conversationId) return;

  await supabase
    .from("ai_agent_human_takeover")
    .update({ resolved_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .is("resolved_at", null);
}
