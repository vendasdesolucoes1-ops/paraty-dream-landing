// Supabase Edge Function — envio de mensagem pelo modal de conversas do CRM.
//
// Existe separada do mass-dispatcher porque aqui o envio é 1:1 dentro de uma
// conversa: além de mandar o texto, grava a mensagem no histórico e pausa o
// agente de IA (um humano acabou de assumir a conversa).
//
// Também concentra a leitura/retomada do estado de pausa: as tabelas
// ai_agent_* só têm policy de service_role, então o cliente autenticado do
// painel não consegue lê-las direto — passa por aqui.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { assertConnected, getEvolutionSession } from "../_shared/evolution-instance.ts";
import { isHumanTakeoverActive, pauseAI, resumeAI } from "../_shared/ai-takeover.ts";
import { confirmarEnvio, descartarEnvio, registrarEnvio } from "../_shared/envio-registrado.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/** Mesma normalização do webhook: só dígitos, com DDI. */
function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

async function getLead(leadId: string) {
  const { data, error } = await supabase
    .from("leads")
    .select("id, nome, telefone")
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Lead não encontrado.");
  return data;
}

/**
 * Instância que atende esse lead. Prioriza a que já trocou mensagem com ele
 * (o histórico prova qual número está do outro lado); só então cai na
 * primeira instância cadastrada, para leads que nunca conversaram.
 */
async function resolveInstance(leadId: string) {
  const { data: ultima } = await supabase
    .from("whatsapp_messages")
    .select("instance_id")
    .eq("lead_id", leadId)
    .not("instance_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  const instanceId = ultima?.[0]?.instance_id;
  if (instanceId) {
    const { data } = await supabase
      .from("whatsapp_instances")
      .select("*")
      .eq("id", instanceId)
      .maybeSingle();
    if (data) return data;
  }

  const { data: qualquer } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1);

  if (!qualquer || qualquer.length === 0) {
    throw new Error("Nenhuma instância de WhatsApp cadastrada.");
  }
  return qualquer[0];
}

async function sendText(leadId: string, texto: string) {
  const conteudo = String(texto ?? "").trim();
  if (!conteudo) throw new Error("Mensagem vazia.");

  const lead = await getLead(leadId);
  const phone = normalizePhone(lead.telefone);
  if (!phone) throw new Error("Este lead não tem um telefone válido cadastrado.");

  const instance = await resolveInstance(leadId);
  // Instância desconectada aceitaria a chamada e a mensagem sumiria — melhor
  // erro claro na tela do que uma bolha que nunca chegou ao destinatário.
  assertConnected(await getEvolutionSession(instance));

  const { data: contato } = await supabase
    .from("whatsapp_contacts")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  // Gravada ANTES do envio. Aqui o takeover é intencional (um humano está
  // digitando), mas o eco chegando antes do insert criaria uma SEGUNDA linha
  // no histórico — a mesma mensagem em duas bolhas no modal do CRM.
  const rowId = await registrarEnvio(supabase, {
    instance_id: instance.id,
    contact_id: contato?.id ?? null,
    lead_id: lead.id,
    remote_jid: `${phone}@s.whatsapp.net`,
    content: conteudo,
  });

  const response = await fetch(
    `${instance.api_url}/message/sendText/${encodeURIComponent(instance.instance_name)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: instance.api_key },
      body: JSON.stringify({ number: phone, text: conteudo }),
    },
  );

  const resultado = await response.json().catch(() => null);
  if (!response.ok) {
    await descartarEnvio(supabase, rowId);
    throw new Error(`Evolution sendText: ${response.status} ${JSON.stringify(resultado)}`);
  }

  await confirmarEnvio(supabase, rowId, resultado?.key?.id);

  const { data: gravada } = await supabase
    .from("whatsapp_messages")
    .select()
    .eq("id", rowId!)
    .maybeSingle();

  // Humano assumiu: a IA para de responder este lead até alguém reativar.
  const { data: agent } = await supabase
    .from("ai_agents")
    .select("id")
    .eq("instance_id", instance.id)
    .maybeSingle();
  await pauseAI(supabase, phone, agent?.id ?? null);

  return { message: gravada, ia_pausada: true };
}

async function getStatus(leadId: string) {
  const lead = await getLead(leadId);
  const phone = normalizePhone(lead.telefone);
  if (!phone) return { ia_pausada: false };
  return { ia_pausada: await isHumanTakeoverActive(supabase, phone) };
}

async function retomarIA(leadId: string) {
  const lead = await getLead(leadId);
  const phone = normalizePhone(lead.telefone);
  if (!phone) throw new Error("Este lead não tem um telefone válido cadastrado.");
  await resumeAI(supabase, phone);
  return { ia_pausada: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Exige sessão: sem isso a função viraria um endpoint aberto capaz de
    // disparar WhatsApp em nome da imobiliária.
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) throw new Error("Não autenticado.");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Sessão inválida.");

    const { action, lead_id, text } = await req.json();
    if (!lead_id) throw new Error("lead_id é obrigatório.");

    let result;
    if (!action || action === "send_text") {
      result = await sendText(lead_id, text);
    } else if (action === "status") {
      result = await getStatus(lead_id);
    } else if (action === "resume_ai") {
      result = await retomarIA(lead_id);
    } else {
      throw new Error(`Ação desconhecida: ${action}`);
    }

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("crm-send-whatsapp-message:", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
