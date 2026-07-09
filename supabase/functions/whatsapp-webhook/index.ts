// Supabase Edge Function — Evolution API webhook receiver for WhatsApp.
// Handles messages.upsert, messages.update, connection.update, qrcode.updated.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const AI_RESPONSE_DELAY_MS = 30_000;

function normalizePhone(remoteJid: string): string {
  const digitsOnly = remoteJid.replace(/@s\.whatsapp\.net|@g\.us/g, "").replace(/\D/g, "");
  if (digitsOnly.startsWith("55")) return digitsOnly;
  return `55${digitsOnly}`;
}

function extractMessageText(message: Record<string, unknown> | undefined): string {
  if (!message) return "";
  const m = message as Record<string, any>;
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    ""
  );
}

async function findInstance(instanceName: string) {
  const { data } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("instance_name", instanceName)
    .maybeSingle();
  return data;
}

async function findOrCreateLead(phone: string, name: string | null) {
  const { data: existingLead } = await supabase
    .from("leads")
    .select("*")
    .eq("telefone", phone)
    .maybeSingle();

  if (existingLead) return existingLead;

  const { data: vendedorId } = await supabase.rpc("get_next_round_robin_salesperson");

  const { data: newLead, error } = await supabase
    .from("leads")
    .insert({
      nome: name || phone,
      telefone: phone,
      origem: "whatsapp",
      status_crm: "novo",
      vendedor_id: vendedorId ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return newLead;
}

async function findOrCreateContact(phone: string, name: string | null, remoteJid: string) {
  const { data: existingContact } = await supabase
    .from("whatsapp_contacts")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (existingContact) {
    const { data: updated } = await supabase
      .from("whatsapp_contacts")
      .update({
        name: name ?? existingContact.name,
        remote_jid: remoteJid,
        last_message_at: new Date().toISOString(),
        unread_count: (existingContact.unread_count ?? 0) + 1,
      })
      .eq("id", existingContact.id)
      .select()
      .single();
    return updated ?? existingContact;
  }

  const { data: created, error } = await supabase
    .from("whatsapp_contacts")
    .insert({
      phone,
      name,
      remote_jid: remoteJid,
      last_message_at: new Date().toISOString(),
      unread_count: 1,
    })
    .select()
    .single();

  if (error) throw error;
  return created;
}

async function isHumanTakeoverActive(sessionId: string) {
  const { data: conversation } = await supabase
    .from("ai_agent_conversations")
    .select("id")
    .eq("session_id", sessionId)
    .eq("status", "active")
    .maybeSingle();

  if (!conversation) return false;

  const { data: takeover } = await supabase
    .from("ai_agent_human_takeover")
    .select("id")
    .eq("conversation_id", conversation.id)
    .is("resolved_at", null)
    .maybeSingle();

  return Boolean(takeover);
}

async function pauseAIForHumanTakeover(agentId: string | null, sessionId: string) {
  let { data: conversation } = await supabase
    .from("ai_agent_conversations")
    .select("id")
    .eq("session_id", sessionId)
    .eq("status", "active")
    .maybeSingle();

  if (!conversation && agentId) {
    const { data: created } = await supabase
      .from("ai_agent_conversations")
      .insert({ agent_id: agentId, session_id: sessionId, status: "active" })
      .select("id")
      .single();
    conversation = created;
  }

  if (!conversation) return;

  await supabase.from("ai_agent_human_takeover").insert({
    conversation_id: conversation.id,
    human_takeover_at: new Date().toISOString(),
  });
}

async function sendPresence(
  apiUrl: string,
  apiKey: string,
  instanceName: string,
  remoteJid: string,
) {
  try {
    await fetch(`${apiUrl}/chat/sendPresence/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: remoteJid, presence: "composing" }),
    });
  } catch (error) {
    // presence indicator is a UX nicety — log but don't fail the webhook
    console.error("=== ERROR ===", (error as Error)?.message, (error as Error)?.stack);
  }
}

async function sendWhatsAppText(
  apiUrl: string,
  apiKey: string,
  instanceName: string,
  remoteJid: string,
  text: string,
) {
  const response = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number: remoteJid, text }),
  });
  return response.json().catch(() => null);
}

async function handleIncomingMessage(instance: Record<string, any>, data: Record<string, any>) {
  const messageId: string = data.key?.id;
  const remoteJid: string = data.key?.remoteJid;
  if (!messageId || !remoteJid) return;

  // 2. Deduplication
  const { data: existingMessage } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("message_id", messageId)
    .maybeSingle();
  if (existingMessage) return;

  // 3. Normalize phone
  const phone = normalizePhone(remoteJid);
  const pushName: string | null = data.pushName ?? null;
  const text = extractMessageText(data.message);

  console.log(
    "=== MESSAGE DATA ===",
    JSON.stringify({
      fromMe: data.key?.fromMe,
      messageType: data.messageType,
      remoteJid,
      content: text?.substring(0, 100),
    }),
  );

  // 4. Find or create lead (round robin)
  const lead = await findOrCreateLead(phone, pushName);

  // Contact bookkeeping
  const contact = await findOrCreateContact(phone, pushName, remoteJid);
  if (contact.lead_id !== lead.id) {
    await supabase.from("whatsapp_contacts").update({ lead_id: lead.id }).eq("id", contact.id);
  }

  // 5. Save incoming message
  await supabase.from("whatsapp_messages").insert({
    instance_id: instance.id,
    contact_id: contact.id,
    lead_id: lead.id,
    remote_jid: remoteJid,
    message_id: messageId,
    from_me: false,
    message_type: data.messageType ?? "text",
    content: text,
    status: "received",
  });

  const sessionId = phone;

  console.log("=== CHECKING HUMAN TAKEOVER ===", { leadId: lead.id });

  // 6. Human takeover check
  if (await isHumanTakeoverActive(sessionId)) return;

  // Active agent for this instance
  const { data: agent } = await supabase
    .from("ai_agents")
    .select("*")
    .eq("instance_id", instance.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!agent) return;

  const receivedAt = new Date().toISOString();

  console.log("=== CALLING AI AGENT ===", { agentId: agent.id, leadId: lead.id, sessionId });

  // 7. Call ai-agent-chat
  const aiResponse = await fetch(`${SUPABASE_URL}/functions/v1/ai-agent-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      agent_id: agent.id,
      message: text,
      contact_phone: phone,
      contact_name: pushName,
      lead_id: lead.id,
      session_id: sessionId,
    }),
  });

  if (!aiResponse.ok) return;
  const aiResult = await aiResponse.json();
  console.log("=== AI RESPONSE ===", JSON.stringify(aiResult).substring(0, 300));

  const messages: string[] = aiResult.messages ?? [];
  if (messages.length === 0) return;

  // 8. Humanized delay with composing presence
  await sendPresence(instance.api_url, instance.api_key, instance.instance_name, remoteJid);
  await new Promise((resolve) => setTimeout(resolve, AI_RESPONSE_DELAY_MS));

  // 9. Debounce — abort if a newer inbound message arrived meanwhile
  const { data: newerMessages } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("contact_id", contact.id)
    .eq("from_me", false)
    .gt("created_at", receivedAt)
    .neq("message_id", messageId);

  if (newerMessages && newerMessages.length > 0) return;

  console.log("=== SENDING TO EVOLUTION ===", { phone, messageCount: messages.length });

  // 10 & 11. Send response(s) and persist them
  for (const messageText of messages) {
    const sendResult = await sendWhatsAppText(
      instance.api_url,
      instance.api_key,
      instance.instance_name,
      remoteJid,
      messageText,
    );

    await supabase.from("whatsapp_messages").insert({
      instance_id: instance.id,
      contact_id: contact.id,
      lead_id: lead.id,
      remote_jid: remoteJid,
      message_id: sendResult?.key?.id ?? crypto.randomUUID(),
      from_me: true,
      message_type: "text",
      content: messageText,
      status: "sent",
    });
  }
}

async function handleOutgoingMessage(instance: Record<string, any>, data: Record<string, any>) {
  const messageId: string = data.key?.id;
  const remoteJid: string = data.key?.remoteJid;
  if (!messageId || !remoteJid) return;

  // 1. If it already exists, it was sent by the AI agent — nothing to do
  const { data: existingMessage } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("message_id", messageId)
    .maybeSingle();
  if (existingMessage) return;

  // 2. Manual message sent by a human salesperson
  const phone = normalizePhone(remoteJid);
  const text = extractMessageText(data.message);

  const lead = await findOrCreateLead(phone, data.pushName ?? null);
  const contact = await findOrCreateContact(phone, data.pushName ?? null, remoteJid);

  await supabase.from("whatsapp_messages").insert({
    instance_id: instance.id,
    contact_id: contact.id,
    lead_id: lead.id,
    remote_jid: remoteJid,
    message_id: messageId,
    from_me: true,
    message_type: data.messageType ?? "text",
    content: text,
    status: "sent",
  });

  const { data: agent } = await supabase
    .from("ai_agents")
    .select("id")
    .eq("instance_id", instance.id)
    .maybeSingle();

  await pauseAIForHumanTakeover(agent?.id ?? null, phone);
}

async function handleConnectionUpdate(instance: Record<string, any>, data: Record<string, any>) {
  await supabase
    .from("whatsapp_instances")
    .update({ status: data.state ?? data.status ?? "unknown" })
    .eq("id", instance.id);
}

async function handleQrCodeUpdate(instance: Record<string, any>, data: Record<string, any>) {
  const qrCode = data.qrcode?.base64 ?? data.qrcode ?? data.base64 ?? null;
  await supabase
    .from("whatsapp_instances")
    .update({
      qr_code: qrCode,
      qr_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
      status: "connecting",
    })
    .eq("id", instance.id);
}

// All the actual webhook handling runs here, in the background via
// EdgeRuntime.waitUntil() below — the AI agent flow alone takes 30s+
// (humanized delay), far longer than Evolution API's webhook timeout, so
// the handler must return 200 immediately and let this promise keep running.
async function processWebhook(payload: Record<string, any>) {
  try {
    console.log("=== BODY ===", JSON.stringify(payload).substring(0, 500));

    const event: string = payload.event;
    const instanceName: string = payload.instance;
    const data = payload.data ?? {};

    console.log("=== EVENT ===", event, "INSTANCE ===", instanceName);

    const instance = await findInstance(instanceName);
    if (!instance) {
      console.log("=== DONE ===");
      return;
    }

    switch (event) {
      case "messages.upsert": {
        if (data.key?.fromMe) {
          await handleOutgoingMessage(instance, data);
        } else {
          await handleIncomingMessage(instance, data);
        }
        break;
      }
      case "messages.update": {
        // Delivery/read status updates — not required for the current flow.
        break;
      }
      case "connection.update": {
        await handleConnectionUpdate(instance, data);
        break;
      }
      case "qrcode.updated": {
        await handleQrCodeUpdate(instance, data);
        break;
      }
      default:
        break;
    }

    console.log("=== DONE ===");
  } catch (error) {
    console.error("=== PROCESSING ERROR ===", (error as Error)?.message, (error as Error)?.stack);
  }
}

Deno.serve(async (req) => {
  console.log("=== WEBHOOK RECEIVED ===", JSON.stringify({ method: req.method, url: req.url }));

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();

    // Fire and forget: don't await this, so the response below returns
    // immediately while processing keeps running in the background.
    const processingPromise = processWebhook(payload);
    EdgeRuntime.waitUntil(processingPromise);

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("=== ERROR ===", (error as Error)?.message, (error as Error)?.stack);
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
