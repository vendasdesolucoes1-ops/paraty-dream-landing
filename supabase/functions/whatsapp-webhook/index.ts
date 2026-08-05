// Supabase Edge Function — Evolution API webhook receiver for WhatsApp.
// Handles messages.upsert, messages.update, connection.update, qrcode.updated.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  isHumanTakeoverActive as takeoverAtivo,
  pauseAI as pausarIA,
} from "../_shared/ai-takeover.ts";
import { sendWhatsAppText } from "../_shared/evolution-send.ts";
import { handleLeadQualification as posQualificacao } from "../_shared/lead-qualification.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Mesma higienização usada em ai-agent-chat: a chave copiada do painel costuma
// vir com quebra de linha invisível, que faz o header Authorization falhar.
const OPENAI_API_KEY = (Deno.env.get("OPENAI_API_KEY") ?? "")
  .trim()
  .replace(/[\r\n\t]/g, "")
  .replace(/[^\x20-\x7E]/g, "");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const AI_RESPONSE_DELAY_MS = 30_000;
// Intervalo entre as mensagens quebradas de uma mesma resposta (separadas por
// ||), pra parecer alguém digitando em partes em vez de um bot disparando
// tudo de uma vez. Proporcional ao tamanho do texto, com piso e teto.
const INTER_MESSAGE_DELAY_MIN_MS = 1000;
const INTER_MESSAGE_DELAY_MAX_MS = 3000;
const INTER_MESSAGE_DELAY_MS_PER_CHAR = 35;

function humanizedDelay(text: string): number {
  const estimated = text.length * INTER_MESSAGE_DELAY_MS_PER_CHAR;
  return Math.min(INTER_MESSAGE_DELAY_MAX_MS, Math.max(INTER_MESSAGE_DELAY_MIN_MS, estimated));
}

function normalizePhone(remoteJid: string): string | null {
  // @lid é um identificador interno do WhatsApp, não um telefone. Quando a
  // Evolution ainda não resolveu remoteJidAlt após um novo QR, transformar os
  // dígitos do LID em telefone criaria leads falsos no CRM.
  if (remoteJid.includes("@lid")) return null;
  const digitsOnly = remoteJid.replace(/@s\.whatsapp\.net|@g\.us/g, "").replace(/\D/g, "");
  if (digitsOnly.length < 10 || digitsOnly.length > 15) return null;
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

// Wrappers finos sobre _shared/ai-takeover.ts: a mesma lógica é usada pela
// crm-send-whatsapp-message quando o vendedor responde pelo modal do CRM.
// Antes as duas versões viviam só aqui e a checagem usava maybeSingle(), que
// dá erro com mais de um takeover aberto — o resultado nulo era lido como
// "não pausado" e a IA voltava a responder sozinha.
const isHumanTakeoverActive = (sessionId: string) => takeoverAtivo(supabase, sessionId);

const pauseAIForHumanTakeover = (agentId: string | null, sessionId: string) =>
  pausarIA(supabase, sessionId, agentId);

async function sendPresence(apiUrl: string, apiKey: string, instanceName: string, number: string) {
  try {
    await fetch(`${apiUrl}/chat/sendPresence/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number, presence: "composing" }),
    });
  } catch (error) {
    // presence indicator is a UX nicety — log but don't fail the webhook
    console.error("=== ERROR ===", (error as Error)?.message, (error as Error)?.stack);
  }
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
  if (!phone) {
    console.warn("=== UNRESOLVED WHATSAPP JID ===", {
      remoteJid,
      remoteJidAlt: data.key?.remoteJidAlt ?? null,
    });
    return;
  }
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

  // ai-agent-chat já detecta e remove a marca do texto antes de devolver —
  // ela nunca chega aqui dentro de `messages` (isso também corrige o painel
  // "Testar Agente", que consome a mesma function direto e antes vazava a
  // marca crua na tela). Só o sinal booleano chega.
  if (aiResult.lead_qualificado) {
    try {
      await posQualificacao(supabase, lead, instance, OPENAI_API_KEY);
    } catch (error) {
      console.error(
        "=== LEAD QUALIFICATION ERROR ===",
        (error as Error)?.message,
        (error as Error)?.stack,
      );
    }
  }

  const cleanMessages = messages.map((m) => m.trim()).filter((m) => m.length > 0);

  if (cleanMessages.length === 0) return;

  // 8. Humanized delay with composing presence
  await sendPresence(instance.api_url, instance.api_key, instance.instance_name, phone);
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

  console.log("=== SENDING TO EVOLUTION ===", { phone, messageCount: cleanMessages.length });

  // 10 & 11. Send response(s) and persist them
  for (const [index, messageText] of cleanMessages.entries()) {
    // Antes da primeira mensagem já rolou o delay + presence lá em cima; a
    // partir da segunda, cada parte espera um pouco — como alguém digitando
    // em blocos, não um bot cuspindo tudo de uma vez.
    if (index > 0) {
      await sendPresence(instance.api_url, instance.api_key, instance.instance_name, phone);
      await new Promise((resolve) => setTimeout(resolve, humanizedDelay(messageText)));
    }

    const sendResult = await sendWhatsAppText(
      instance.api_url,
      instance.api_key,
      instance.instance_name,
      phone,
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
  if (!phone) {
    console.warn("=== UNRESOLVED OUTGOING WHATSAPP JID ===", {
      remoteJid,
      remoteJidAlt: data.key?.remoteJidAlt ?? null,
    });
    return;
  }
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

// Confirmações de entrega/leitura, usadas pelos ticks do modal de conversas.
// O Baileys expõe o ack como string ou como número (a Evolution repassa os
// dois formatos dependendo da origem do evento), por isso os dois são
// mapeados aqui.
const STATUS_POR_ACK: Record<string, string> = {
  ERROR: "failed",
  PENDING: "pending",
  SERVER_ACK: "sent",
  DELIVERY_ACK: "delivered",
  READ: "read",
  PLAYED: "read",
  "0": "failed",
  "1": "pending",
  "2": "sent",
  "3": "delivered",
  "4": "read",
  "5": "read",
};

// Um ack atrasado não pode rebaixar o status: o WhatsApp reentrega eventos
// fora de ordem e "entregue" chegando depois de "lido" apagaria o tique azul.
const PESO_STATUS: Record<string, number> = {
  failed: 0,
  pending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
};

async function handleMessageUpdate(data: Record<string, any>) {
  const messageId: string | undefined = data.key?.id ?? data.keyId ?? data.messageId;
  const ackBruto = data.status ?? data.update?.status ?? data.ack;
  if (!messageId || ackBruto === undefined || ackBruto === null) return;

  const novoStatus = STATUS_POR_ACK[String(ackBruto).toUpperCase()];
  if (!novoStatus) return;

  const { data: existente } = await supabase
    .from("whatsapp_messages")
    .select("id, status")
    .eq("message_id", messageId)
    .maybeSingle();
  if (!existente) return;

  const pesoAtual = PESO_STATUS[existente.status as string] ?? -1;
  if ((PESO_STATUS[novoStatus] ?? -1) <= pesoAtual) return;

  await supabase.from("whatsapp_messages").update({ status: novoStatus }).eq("id", existente.id);
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
        await handleMessageUpdate(data);
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
