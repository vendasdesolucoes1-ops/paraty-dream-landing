// Registro de mensagens que NÓS enviamos, à prova de corrida com o eco.
//
// O problema: a Evolution emite `messages.upsert` com fromMe=true assim que a
// mensagem sai. O webhook usa esse evento para descobrir se um vendedor digitou
// no celular — e a única prova de que a mensagem é nossa era encontrar o
// message_id em whatsapp_messages. Só que o código gravava DEPOIS de enviar:
//
//   await sendWhatsAppText(...)   // a Evolution já disparou o eco aqui
//   await supabase.insert(...)    // nossa linha só passa a existir aqui
//
// Na janela entre as duas linhas o eco chega, não encontra nada, e o webhook
// conclui "humano assumiu" — abrindo um ai_agent_human_takeover que pausa a IA
// para sempre, porque nada fecha takeover automaticamente. Em produção isso
// deixou 35 leads mudos, com rajadas de 4 takeovers em 50s: uma resposta
// quebrada em 4 partes = 4 ecos = 4 corridas perdidas.
//
// A correção não é diminuir a janela, é eliminá-la: a linha é gravada ANTES do
// envio, com um message_id provisório, e atualizada com o id real depois. O eco
// sempre encontra a linha, porque ela é anterior ao envio que o produziu.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Prefixo do id provisório. `message_id` é unique, então precisa ser único. */
const PREFIXO_PENDENTE = "pendente:";

/** Eco que demora mais que isso não é mais casável com segurança. */
const JANELA_ECO_MS = 5 * 60 * 1000;

export interface EnvioRegistrado {
  id: string;
  instance_id: string;
  contact_id?: string | null;
  lead_id?: string | null;
  remote_jid: string;
  message_type?: string;
  content: string;
}

/**
 * Grava a mensagem ANTES do envio, com id provisório e status 'pending'.
 * Devolve o id da linha, para confirmar ou descartar depois.
 */
export async function registrarEnvio(
  supabase: SupabaseClient,
  dados: Omit<EnvioRegistrado, "id">,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .insert({
      instance_id: dados.instance_id,
      contact_id: dados.contact_id ?? null,
      lead_id: dados.lead_id ?? null,
      remote_jid: dados.remote_jid,
      message_id: `${PREFIXO_PENDENTE}${crypto.randomUUID()}`,
      from_me: true,
      message_type: dados.message_type ?? "text",
      content: dados.content,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    // Não impede o envio: pior do que uma bolha sem registro é o lead ficar
    // sem resposta. O eco vai cair no caminho antigo (dedupe por message_id).
    console.error("[envio-registrado] falhou ao registrar envio:", error.message);
    return null;
  }
  return data?.id ?? null;
}

/** Envio confirmado: grava o message_id real devolvido pela Evolution. */
export async function confirmarEnvio(
  supabase: SupabaseClient,
  rowId: string | null,
  messageIdReal: string | null | undefined,
): Promise<void> {
  if (!rowId) return;
  const update: Record<string, unknown> = { status: "sent" };
  // Sem id real o provisório fica: serve de chave única e o eco ainda casa
  // por conteúdo.
  if (messageIdReal) update.message_id = messageIdReal;
  await supabase.from("whatsapp_messages").update(update).eq("id", rowId);
}

/**
 * Envio falhou: remove a linha provisória. Deixá-la viraria uma bolha no CRM
 * de uma mensagem que o lead nunca recebeu — pior que não registrar nada.
 */
export async function descartarEnvio(
  supabase: SupabaseClient,
  rowId: string | null,
): Promise<void> {
  if (!rowId) return;
  await supabase.from("whatsapp_messages").delete().eq("id", rowId);
}

/**
 * O eco recebido corresponde a um envio nosso ainda com id provisório?
 *
 * Casamento por (remote_jid, conteúdo, janela de tempo) em vez de message_id:
 * é o que sobra quando o id real ainda não voltou da Evolution. Se casar,
 * adota o id real na linha — a partir daí o dedupe normal por message_id
 * funciona, inclusive para os acks de entrega/leitura.
 *
 * Devolve true se a mensagem é nossa (e portanto NÃO é intervenção humana).
 */
export async function reconciliarEco(
  supabase: SupabaseClient,
  params: { remoteJid: string; content: string; messageIdReal: string },
): Promise<boolean> {
  const conteudo = String(params.content ?? "");
  // Sem conteúdo não há como casar (mídia, por exemplo). Na dúvida, deixa o
  // fluxo antigo decidir: tratar como humana é o lado seguro do erro.
  if (!conteudo.trim()) return false;

  const desde = new Date(Date.now() - JANELA_ECO_MS).toISOString();

  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("remote_jid", params.remoteJid)
    .eq("from_me", true)
    .eq("content", conteudo)
    .like("message_id", `${PREFIXO_PENDENTE}%`)
    .gte("created_at", desde)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("[envio-registrado] reconciliação falhou:", error.message);
    return false;
  }

  const linha = data?.[0];
  if (!linha) return false;

  await supabase
    .from("whatsapp_messages")
    .update({ message_id: params.messageIdReal, status: "sent" })
    .eq("id", linha.id);

  return true;
}
