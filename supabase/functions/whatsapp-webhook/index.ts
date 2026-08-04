// Supabase Edge Function — Evolution API webhook receiver for WhatsApp.
// Handles messages.upsert, messages.update, connection.update, qrcode.updated.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  isHumanTakeoverActive as takeoverAtivo,
  pauseAI as pausarIA,
} from "../_shared/ai-takeover.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Mesma higienização usada em ai-agent-chat: a chave copiada do painel costuma
// vir com quebra de linha invisível, que faz o header Authorization falhar.
const OPENAI_API_KEY = (Deno.env.get("OPENAI_API_KEY") ?? "")
  .trim()
  .replace(/[\r\n\t]/g, "")
  .replace(/[^\x20-\x7E]/g, "");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Extração é tarefa curta e mecânica — o modelo pequeno basta e mantém o custo
// por lead qualificado irrelevante.
const EXTRACTION_MODEL = "gpt-4o-mini";

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

// Extração estruturada da qualificação (Opção A): uma segunda chamada à
// OpenAI, separada da conversa, em JSON mode — o schema é rígido e a sintaxe é
// garantida pelo response_format, então ajustes futuros no tom do agente de
// vendas não quebram a extração.
//
// NUNCA lança: a extração é complemento. Se falhar (sem chave, timeout, quota,
// resposta estranha), devolve null e o fluxo principal — atribuir + notificar —
// segue com "não informado" nos campos que faltarem.
async function extrairDadosQualificacao(leadId: string): Promise<Record<string, unknown> | null> {
  try {
    if (!OPENAI_API_KEY) {
      console.warn("=== EXTRACAO IGNORADA === OPENAI_API_KEY ausente no whatsapp-webhook");
      return null;
    }

    const { data: mensagens } = await supabase
      .from("whatsapp_messages")
      .select("from_me, content")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(40);

    const transcricao = (mensagens ?? [])
      .reverse()
      .map(
        (m: Record<string, unknown>) =>
          `${m.from_me ? "Vendedor" : "Lead"}: ${String(m.content ?? "")}`,
      )
      .join("\n")
      .slice(0, 8000);

    if (!transcricao.trim()) return null;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Extraia os dados de qualificação da conversa abaixo. Responda APENAS com um objeto JSON com as chaves: "cidade" (string), "objetivo" (exatamente um de: "moradia", "investimento", "temporada"), "metragem_interesse" (número em m², sem unidade), "forma_pagamento" (string curta, ex: "à vista", "financiado", "FGTS"). Use null em qualquer campo que o lead não tenha informado de forma clara. Nunca invente ou deduza um valor que o lead não disse.',
          },
          { role: "user", content: transcricao },
        ],
      }),
    });

    if (!response.ok) {
      console.error("=== EXTRACAO FALHOU ===", response.status, await response.text());
      return null;
    }

    const result = await response.json();
    const conteudo = result?.choices?.[0]?.message?.content;
    if (!conteudo) return null;
    return JSON.parse(conteudo);
  } catch (error) {
    console.error("=== EXTRACAO FALHOU ===", (error as Error)?.message);
    return null;
  }
}

// Só grava o que veio preenchido e ainda não existe no lead — a extração nunca
// sobrescreve dado já confirmado (ex: cidade corrigida à mão no CRM).
function camposParaAtualizar(
  lead: Record<string, unknown>,
  extraido: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!extraido) return {};
  const updates: Record<string, unknown> = {};

  const cidade = typeof extraido.cidade === "string" ? extraido.cidade.trim() : "";
  if (cidade && !lead.cidade) updates.cidade = cidade;

  const objetivo = typeof extraido.objetivo === "string" ? extraido.objetivo.trim() : "";
  // A coluna tem CHECK constraint: um valor fora da lista derrubaria o UPDATE
  // inteiro e levaria junto os outros campos válidos.
  if (["moradia", "investimento", "temporada"].includes(objetivo) && !lead.objetivo) {
    updates.objetivo = objetivo;
  }

  const metragem = Number(extraido.metragem_interesse);
  if (Number.isFinite(metragem) && metragem > 0 && !lead.metragem_interesse) {
    updates.metragem_interesse = metragem;
  }

  const pagamento =
    typeof extraido.forma_pagamento === "string" ? extraido.forma_pagamento.trim() : "";
  if (pagamento && !lead.forma_pagamento) updates.forma_pagamento = pagamento;

  return updates;
}

// Resumo por TEMPLATE puro: monta a partir das colunas do lead, nunca de texto
// livre devolvido pela IA. Campo ausente vira "não informado" em vez de sumir,
// pra o vendedor saber o que ainda falta perguntar.
function montarResumoQualificacao(lead: Record<string, unknown>): string {
  const ou = (valor: unknown) => {
    const texto = valor === null || valor === undefined ? "" : String(valor).trim();
    return texto.length > 0 ? texto : "não informado";
  };
  const metragem = lead.metragem_interesse
    ? `${String(lead.metragem_interesse)} m²`
    : "não informado";

  return [
    "*Novo lead qualificado* 🎯",
    "",
    `*Nome:* ${ou(lead.nome)}`,
    `*Telefone:* ${ou(lead.telefone)}`,
    `*Cidade:* ${ou(lead.cidade)}`,
    `*Objetivo:* ${ou(lead.objetivo)}`,
    `*Metragem de interesse:* ${metragem}`,
    `*Forma de pagamento:* ${ou(lead.forma_pagamento)}`,
    "",
    "Lead atribuído a você pela fila de rodízio. O histórico completo está no CRM.",
  ].join("\n");
}

// Triggered when the AI agent's response contains the [LEAD_QUALIFICADO]
// marker. Marca o lead como qualificado, garante a atribuição por round-robin
// e manda o resumo por WhatsApp pro vendedor da vez. Uma tabela de vendedores
// vazia é esperada e não é erro — o lead só fica sem dono.
async function handleLeadQualification(lead: Record<string, any>, instance: Record<string, any>) {
  // A marca pode reaparecer em mensagens seguintes da mesma conversa; sem esta
  // guarda o vendedor receberia o mesmo resumo várias vezes. Só a transição
  // de "novo" para "qualificado" dispara notificação.
  const primeiraQualificacao = lead.status_crm === "novo";

  const { error: statusError } = await supabase
    .from("leads")
    .update({ status_crm: "qualificado" })
    .eq("id", lead.id);
  if (statusError) throw statusError;

  if (!primeiraQualificacao) return;

  // Best-effort: falha aqui não pode impedir atribuição nem notificação.
  const extraido = await extrairDadosQualificacao(lead.id);
  const updates = camposParaAtualizar(lead, extraido);
  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await supabase.from("leads").update(updates).eq("id", lead.id);
    if (updateError) {
      console.error("=== EXTRACAO NAO GRAVADA ===", updateError.message);
    }
  }

  // Reaproveita a MESMA rotação usada para atribuir o lead: se ele já tem dono,
  // quem recebe o resumo é o dono, não o próximo da fila.
  let vendedorId = lead.vendedor_id ?? null;
  if (!vendedorId) {
    const { data: proximo } = await supabase.rpc("get_next_round_robin_salesperson");
    vendedorId = proximo ?? null;
    if (vendedorId) {
      const { error: assignError } = await supabase
        .from("leads")
        .update({ vendedor_id: vendedorId })
        .eq("id", lead.id);
      if (assignError) throw assignError;
    }
  }

  if (!vendedorId) {
    console.warn("=== SEM VENDEDOR NA FILA ===", { leadId: lead.id });
    return;
  }

  const { data: vendedor } = await supabase
    .from("vendedores")
    .select("nome, telefone, profile_id")
    .eq("id", vendedorId)
    .maybeSingle();

  if (vendedor?.profile_id) {
    await supabase.from("notifications").insert({
      user_id: vendedor.profile_id,
      type: "lead_atribuido",
      title: "Novo lead atribuído",
      body: `O lead ${lead.nome} foi qualificado e atribuído a você via round-robin.`,
      link: `/dashboard/crm?lead=${lead.id}`,
    });
  }

  await supabase.from("interacoes").insert({
    lead_id: lead.id,
    tipo: "sistema",
    canal: "sistema",
    conteudo: `Lead atribuído automaticamente a ${vendedor?.nome ?? "vendedor"} via round-robin.`,
  });

  // O resumo sai das colunas do lead já atualizadas, não do objeto em memória.
  const { data: leadAtual } = await supabase
    .from("leads")
    .select("nome, telefone, cidade, objetivo, metragem_interesse, forma_pagamento")
    .eq("id", lead.id)
    .maybeSingle();

  const resumo = montarResumoQualificacao(leadAtual ?? { ...lead, ...updates });

  // Vendedor sem telefone não pode falhar em silêncio: fica registrado no log,
  // na timeline do lead e como alerta in-app pra quem administra o painel.
  if (!vendedor?.telefone) {
    const aviso = `Lead qualificado, mas o vendedor ${vendedor?.nome ?? "da vez"} não tem telefone cadastrado — resumo não enviado por WhatsApp. Cadastre o telefone em Configurações → Equipe.`;
    console.error("=== VENDEDOR SEM TELEFONE ===", { leadId: lead.id, vendedorId });

    await supabase.from("interacoes").insert({
      lead_id: lead.id,
      tipo: "sistema",
      canal: "sistema",
      conteudo: aviso,
    });

    const { data: admins } = await supabase
      .from("profiles")
      .select("id")
      .in("role", ["admin", "gestor"])
      .is("deletado_em", null);

    for (const admin of admins ?? []) {
      await supabase.from("notifications").insert({
        user_id: admin.id,
        type: "vendedor_sem_telefone",
        title: "Resumo do lead não enviado",
        body: aviso,
        link: `/dashboard/crm?lead=${lead.id}`,
      });
    }
    return;
  }

  try {
    await sendWhatsAppText(
      instance.api_url,
      instance.api_key,
      instance.instance_name,
      vendedor.telefone,
      resumo,
    );
    await supabase.from("interacoes").insert({
      lead_id: lead.id,
      tipo: "sistema",
      canal: "sistema",
      conteudo: `Resumo da qualificação enviado por WhatsApp para ${vendedor.nome ?? "o vendedor"} (${vendedor.telefone}).`,
    });
  } catch (error) {
    // Envio falhou (instância caiu, número inválido): registra visível em vez
    // de perder a informação — a atribuição no CRM já está feita de todo jeito.
    const msg = (error as Error)?.message ?? String(error);
    console.error("=== FALHA AO ENVIAR RESUMO ===", msg);
    await supabase.from("interacoes").insert({
      lead_id: lead.id,
      tipo: "sistema",
      canal: "sistema",
      conteudo: `Falha ao enviar o resumo da qualificação por WhatsApp para ${vendedor.nome ?? "o vendedor"}: ${msg.slice(0, 300)}`,
    });
  }
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

async function sendWhatsAppText(
  apiUrl: string,
  apiKey: string,
  instanceName: string,
  number: string,
  text: string,
) {
  const response = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number, text }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Evolution sendText error: ${response.status} ${JSON.stringify(result)}`);
  }
  return result;
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
      await handleLeadQualification(lead, instance);
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
