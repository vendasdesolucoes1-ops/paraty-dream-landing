// Supabase Edge Function — Evolution API webhook receiver for WhatsApp.
// Handles messages.upsert, messages.update, connection.update, qrcode.updated.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { exigirChamador } from "../_shared/auth.ts";
import {
  isHumanTakeoverActive as takeoverAtivo,
  pauseAI as pausarIA,
} from "../_shared/ai-takeover.ts";
import { enviarTextoRegistrado, reconciliarEco } from "../_shared/envio-registrado.ts";
import { sendWhatsAppText } from "../_shared/evolution-send.ts";
import { notificarResponsaveis } from "../_shared/notificar.ts";
import {
  base64NoPayload,
  classificarMensagem,
  descreverMidia,
  extrairTexto,
  resolverRemetente,
  temTexto,
} from "../_shared/mensagem-entrada.ts";
import { transcreverAudio } from "../_shared/transcricao.ts";
import {
  enfileirarResposta,
  responderLead,
  type InstanciaWhatsapp,
} from "../_shared/resposta-ia.ts";
import { chaveTelefone } from "../_shared/contato-bloqueado.ts";
import { classificarRespostaFollowUp } from "../_shared/classificar-resposta.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Global do runtime das Edge Functions do Supabase (não tem tipo no Deno puro).
declare const EdgeRuntime: { waitUntil(promessa: Promise<unknown>): void };

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Telefone e texto da mensagem: ver _shared/mensagem-entrada.ts. Contatos @lid
// só são descartados quando a Evolution não manda nenhum telefone alternativo
// (remoteJidAlt/senderPn) — transformar os dígitos do LID em telefone criaria
// leads falsos no CRM.

const MENSAGEM_PEDIDO_TEXTO =
  "Não consegui ouvir seu áudio por aqui 😅 Pode me mandar a mensagem por escrito, por favor?";

async function findInstance(instanceName: string) {
  const { data } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("instance_name", instanceName)
    .maybeSingle();
  return data;
}

async function findOrCreateLead(phone: string, name: string | null) {
  // Pela chave canônica: o WhatsApp pode mandar o número sem o 9 que o
  // formulário gravou, e sem isso nascia um lead duplicado com outro vendedor.
  const chave = chaveTelefone(phone);
  const porChave = chave
    ? await supabase
        .from("leads")
        .select("*")
        .eq("telefone_chave", chave)
        .is("deletado_em", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null, error: null };
  // Coluna ainda inexistente (migration pendente): cai na busca exata antiga.
  const existingLead =
    porChave.data ??
    (await supabase.from("leads").select("*").eq("telefone", phone).maybeSingle()).data;

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

async function handleIncomingMessage(instance: Record<string, any>, data: Record<string, any>) {
  const messageId: string = data.key?.id;
  if (!messageId || !data.key?.remoteJid) return;

  // 2. Deduplication
  const { data: existingMessage } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("message_id", messageId)
    .maybeSingle();
  if (existingMessage) return;

  // 3. Normalize phone (@lid usa remoteJidAlt/senderPn quando houver)
  const remetente = resolverRemetente(data);
  if (!remetente) {
    // Sem JID no log (LGPD): só se havia alternativa.
    console.warn("=== UNRESOLVED WHATSAPP JID ===", {
      lid: String(data.key?.remoteJid).includes("@lid"),
      temAlternativo: Boolean(
        data.key?.remoteJidAlt ?? data.remoteJidAlt ?? data.key?.senderPn ?? data.senderPn,
      ),
    });
    return;
  }
  const phone = remetente.telefone;
  const remoteJid = remetente.jid;
  const pushName: string | null = data.pushName ?? null;
  const tipoEntrada = classificarMensagem(data.message, data.messageType);
  let text = extrairTexto(data.message);

  // Sem telefone nem texto no log (LGPD): só o tipo e o tamanho.
  console.log(
    "=== MESSAGE DATA ===",
    JSON.stringify({
      messageType: data.messageType,
      tipoEntrada,
      viaAlternativo: remetente.viaAlternativo,
      tamanho: text?.length ?? 0,
    }),
  );

  // Vendedor respondendo um resumo de lead não é lead: sem isso a Sophia
  // abria conversa de venda com a própria equipe.
  if (await ehTelefoneDeVendedor(phone)) {
    console.log("=== MENSAGEM DE VENDEDOR IGNORADA ===");
    return;
  }

  // 4. Find or create lead (round robin)
  const lead = await findOrCreateLead(phone, pushName);

  // Contact bookkeeping
  const contact = await findOrCreateContact(phone, pushName, remoteJid);
  if (contact.lead_id !== lead.id) {
    await supabase.from("whatsapp_contacts").update({ lead_id: lead.id }).eq("id", contact.id);
  }

  // O lead escrever NÃO desfaz um opt-out: a Sophia responde quem escreveu,
  // mas o envio ativo (fila, campanhas) continua barrado até um desbloqueio
  // manual no painel. Antes o bloqueio caía sozinho a cada mensagem.

  // Áudio: a transcrição vira o conteúdo da mensagem — é o que a Sophia lê e o
  // que o vendedor vê no CRM. Falhou ou não há chave: segue sem texto.
  let audioSemTranscricao = false;
  if (tipoEntrada === "audio") {
    const transcricao = await transcreverAudio(
      instance as InstanciaWhatsapp,
      data,
      base64NoPayload(data),
    );
    if (temTexto(transcricao)) text = transcricao!;
    else audioSemTranscricao = true;
  }

  // 5. Save incoming message
  const { data: recebida } = await supabase
    .from("whatsapp_messages")
    .insert({
      instance_id: instance.id,
      contact_id: contact.id,
      lead_id: lead.id,
      remote_jid: remoteJid,
      message_id: messageId,
      from_me: false,
      message_type: data.messageType ?? "text",
      content: text,
      status: "received",
    })
    .select("created_at")
    .maybeSingle();

  const sessionId = phone;

  // Resposta a follow-up: classifica em segundo plano, sem atrasar a Sophia
  // (vale também com humano no atendimento: o sinal fica no CRM).
  if (temTexto(text)) {
    EdgeRuntime.waitUntil(classificarRespostaFollowUp(supabase, lead.id, text));
  }

  // 6. Atendimento humano em curso ou IA desligada: a Sophia não responde.
  if (await isHumanTakeoverActive(sessionId)) return;
  const { data: agent } = await supabase
    .from("ai_agents")
    .select("id")
    .eq("instance_id", instance.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!agent) return;

  // 7. Sem texto para o modelo: nunca chama a Sophia com mensagem vazia.
  if (audioSemTranscricao) {
    await pedirTextoAoLead(instance, lead.id, contact.id, phone);
    return;
  }
  if (tipoEntrada === "midia_sem_legenda") {
    await avisarMidiaSemLegenda(instance, lead.id, descreverMidia(data.message, data.messageType));
    return;
  }
  if (!temTexto(text)) return;

  // 8. Resposta durável: a linha na fila garante que, se este isolate morrer
  // durante o debounce, o cron responde. O caminho rápido abaixo responde em
  // ~30 s quando tudo corre bem (ver _shared/resposta-ia.ts).
  await enfileirarResposta(supabase, lead.id, phone, instance.id);
  const resultado = await responderLead(supabase, instance as InstanciaWhatsapp, lead.id, {
    aguardarDebounce: true,
    recebidaEm: (recebida?.created_at as string | undefined) ?? new Date().toISOString(),
  });
  console.log("=== RESPOSTA ===", { leadId: lead.id, resultado });
}

/** Áudio não transcrito: a Sophia pede o texto e o vendedor fica sabendo. */
async function pedirTextoAoLead(
  instance: Record<string, any>,
  leadId: string,
  contactId: string | null,
  phone: string,
) {
  await enviarTextoRegistrado(
    supabase,
    (i, tel, txt) => sendWhatsAppText(i.api_url, i.api_key, i.instance_name, tel, txt),
    instance as InstanciaWhatsapp,
    phone,
    MENSAGEM_PEDIDO_TEXTO,
    { lead_id: leadId, contact_id: contactId },
  ).catch((e) => console.error("[webhook] pedido de texto não enviado:", (e as Error).message));
  await supabase.from("interacoes").insert({
    lead_id: leadId,
    tipo: "sistema",
    canal: "whatsapp",
    conteudo:
      "Lead mandou um áudio que não pôde ser transcrito. A Sophia pediu que ele escrevesse a mensagem.",
  });
  await notificarResponsaveis(
    supabase,
    leadId,
    {
      tipo: "audio_nao_transcrito",
      titulo: "Lead mandou áudio",
      corpo: "Não foi possível transcrever o áudio. Ouça pelo WhatsApp se o lead não escrever.",
    },
    instance as InstanciaWhatsapp,
  );
}

/** Mídia sem legenda: a Sophia não tem o que ler; quem decide é o vendedor. */
async function avisarMidiaSemLegenda(instance: Record<string, any>, leadId: string, midia: string) {
  await supabase.from("interacoes").insert({
    lead_id: leadId,
    tipo: "sistema",
    canal: "whatsapp",
    conteudo: `Lead mandou ${midia} sem legenda. A IA não respondeu; o vendedor foi avisado.`,
  });
  await notificarResponsaveis(
    supabase,
    leadId,
    {
      tipo: "midia_sem_legenda",
      titulo: "Lead mandou mídia",
      corpo: `O lead enviou ${midia} sem texto. Veja no WhatsApp e responda se precisar.`,
    },
    instance as InstanciaWhatsapp,
  );
}

/** O telefone é de alguém da equipe de vendas (mesma chave de 10 dígitos)? */
async function ehTelefoneDeVendedor(phone: string): Promise<boolean> {
  const chave = chaveTelefone(phone);
  if (!chave) return false;
  const { data } = await supabase
    .from("vendedores")
    .select("telefone")
    .not("telefone", "is", null)
    .ilike("telefone", `%${chave.slice(-4)}`);
  return (data ?? []).some((v) => chaveTelefone(v.telefone) === chave);
}

async function handleOutgoingMessage(instance: Record<string, any>, data: Record<string, any>) {
  const messageId: string = data.key?.id;
  if (!messageId || !data.key?.remoteJid) return;

  // 1. If it already exists, it was sent by the AI agent — nothing to do
  const { data: existingMessage } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("message_id", messageId)
    .maybeSingle();
  if (existingMessage) return;

  // 2. Manual message sent by a human salesperson
  const remetente = resolverRemetente(data);
  if (!remetente) {
    console.warn("=== UNRESOLVED OUTGOING WHATSAPP JID ===", {
      lid: String(data.key?.remoteJid).includes("@lid"),
    });
    return;
  }
  const phone = remetente.telefone;
  const remoteJid = remetente.jid;
  const text = extrairTexto(data.message);

  // Segunda checagem, imune a timing: pode ser um envio NOSSO cujo message_id
  // real ainda não voltou da Evolution. Casa por conteúdo com a linha gravada
  // antes do envio e adota o id real. Sem isso, cada parte de uma resposta
  // quebrada com || virava um takeover e a IA emudecia para sempre.
  if (await reconciliarEco(supabase, { remoteJid, content: text, messageIdReal: messageId })) {
    console.log("=== ECO RECONCILIADO ===", { messageId });
    return;
  }

  // Mensagem do número da empresa para um VENDEDOR (resumo de lead, aviso) não
  // é atendimento: não abre takeover nem cria lead com o telefone do vendedor.
  if (await ehTelefoneDeVendedor(phone)) {
    console.log("=== ECO PARA VENDEDOR IGNORADO ===", { messageId });
    return;
  }

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
  // Só o método: a URL carrega o segredo do webhook em `?token=`.
  console.log("=== WEBHOOK RECEIVED ===", req.method);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const chamador = await exigirChamador(req, { segredos: ["evolution_webhook_secret"] });
  if (chamador instanceof Response) return chamador;

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
