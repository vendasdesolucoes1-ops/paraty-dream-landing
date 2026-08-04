// Supabase Edge Function — lists all saved/chatted contacts of a WhatsApp
// instance via the Evolution API (the phone's own contact list, NOT group
// members — see whatsapp-groups for that).
//
// A agenda vem do banco da Evolution, que NÃO é limpo quando o QR é lido por
// outro aparelho. Por isso filtramos tudo que foi gravado antes do início da
// sessão atual — ver _shared/evolution-instance.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  assertConnected,
  getEvolutionSession,
  isFromPreviousSession,
} from "../_shared/evolution-instance.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getInstance(instanceName: string) {
  const { data: instance, error } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("instance_name", instanceName)
    .single();
  if (error || !instance) throw new Error("instance not found");
  return instance;
}

function extractPhoneJid(value: unknown): string | null {
  if (typeof value !== "string" || !value.includes("@s.whatsapp.net")) return null;
  const number = value.split("@")[0].split(":")[0].replace(/\D/g, "");
  return number.length >= 10 && number.length <= 15 ? number : null;
}

function findPhoneInRecord(record: Record<string, unknown>): string | null {
  const directFields = [
    record.phoneNumber,
    record.phone_number,
    record.pnJid,
    record.pn,
    record.remoteJidAlt,
    record.participantAlt,
  ];

  for (const value of directFields) {
    const number = extractPhoneJid(value);
    if (number) return number;
  }

  for (const nestedKey of ["key", "lastMessage", "message", "contact"]) {
    const nested = record[nestedKey];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    const number = findPhoneInRecord(nested as Record<string, unknown>);
    if (number) return number;
  }

  return null;
}

function extractLid(record: Record<string, unknown>): string | null {
  const candidates = [
    record.remoteJid,
    record.jid,
    record.id,
    record.remoteJidAlt,
    record.participant,
  ];
  return candidates.find((value): value is string => typeof value === "string" && value.includes("@lid")) ?? null;
}

async function getCurrentSessionLidMap(
  instance: { api_url: string; api_key: string; instance_name: string },
  session: Awaited<ReturnType<typeof getEvolutionSession>>,
) {
  const response = await fetch(
    `${instance.api_url.replace(/\/$/, "")}/chat/findChats/${encodeURIComponent(instance.instance_name)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: instance.api_key },
      body: JSON.stringify({}),
    },
  );
  if (!response.ok) return new Map<string, string>();

  const result = await response.json();
  const chats = Array.isArray(result) ? result : (result.chats ?? []);
  const map = new Map<string, string>();

  for (const chat of chats) {
    if (!chat || typeof chat !== "object" || isFromPreviousSession(session, chat)) continue;
    const record = chat as Record<string, unknown>;
    const lid = extractLid(record);
    const number = findPhoneInRecord(record);
    if (lid && number && number !== session.ownerNumber) map.set(lid, number);
  }

  return map;
}

async function resolveLidsFromCurrentMessages(
  instance: { api_url: string; api_key: string; instance_name: string },
  session: Awaited<ReturnType<typeof getEvolutionSession>>,
  lids: string[],
) {
  const resolved = new Map<string, string>();
  const wanted = new Set(lids);
  if (wanted.size === 0) return resolved;

  const response = await fetch(
    `${instance.api_url.replace(/\/$/, "")}/chat/findMessages/${encodeURIComponent(instance.instance_name)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: instance.api_key },
      body: JSON.stringify({ page: 1, offset: 200 }),
    },
  );
  if (!response.ok) return resolved;

  const result = await response.json();
  const messages = Array.isArray(result)
    ? result
    : (result.messages?.records ?? result.messages ?? result.records ?? []);

  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const record = message as Record<string, unknown>;
    const lid = extractLid(record);
    if (!lid || !wanted.has(lid)) continue;
    const timestamp = Number(record.messageTimestamp ?? record.timestamp);
    if (
      session.sessionSince &&
      Number.isFinite(timestamp) &&
      timestamp * (timestamp < 10_000_000_000 ? 1000 : 1) < session.sessionSince.getTime()
    ) continue;
    const number = findPhoneInRecord(record);
    if (number && number !== session.ownerNumber) resolved.set(lid, number);
  }

  return resolved;
}

async function listContacts(instanceName: string) {
  const instance = await getInstance(instanceName);
  const session = await getEvolutionSession(instance);
  assertConnected(session);
  const lidToPhone = await getCurrentSessionLidMap(instance, session);

  const response = await fetch(`${instance.api_url}/chat/findContacts/${instanceName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: instance.api_key },
    body: JSON.stringify({}),
  });
  if (!response.ok) throw new Error(`Evolution API findContacts error: ${await response.text()}`);

  const result = await response.json();
  const contacts = Array.isArray(result) ? result : (result.contacts ?? []);

  // Corte só por createdAt (ver evolution-instance.ts): descarta contato
  // criado no cache da Evolution antes da conexão atual, sem exigir troca de
  // mensagem — a lista deve trazer toda a agenda do aparelho conectado
  // (salvos ou não, ativos ou não no WhatsApp), não só quem já conversou
  // depois da reconexão.
  const doAparelhoAtual = contacts.filter(
    (c: Record<string, unknown>) => !isFromPreviousSession(session, c),
  );
  const descartadosPorSessaoAnterior = contacts.length - doAparelhoAtual.length;
  const unresolvedLids = doAparelhoAtual
    .map((contact: Record<string, unknown>) => extractLid(contact))
    .filter((lid: string | null): lid is string => Boolean(lid) && !lidToPhone.has(lid as string));
  const messageLidMap = await resolveLidsFromCurrentMessages(
    instance,
    session,
    Array.from(new Set(unresolvedLids)),
  );

  const parsed = doAparelhoAtual

    .map((c: Record<string, unknown>) => {
      // ATENÇÃO: nesta versão da Evolution, `c.id` é o id interno do banco
      // dela (cuid tipo "cmrxu4c5h2z3fpe4q3i2iyblh"). Remover os não-dígitos
      // dele produzia "números" inventados (45298422409, 2004946450...) —
      // exatamente o bug relatado. O JID de verdade está em `remoteJid`.
      const jid = String(c.remoteJid ?? c.jid ?? "");
      if (!jid.includes("@")) return null;

      // Grupos e broadcast lists não são telefone de pessoa disparável.
      // .includes() em vez de .endsWith() por segurança — algumas respostas
      // da Evolution trazem sufixo de device (":12@g.us") antes do domínio.
      if (c.isGroup === true || c.type === "group") return null;
      if (jid.includes("@g.us") || jid.includes("@broadcast") || jid.includes("@newsletter"))
        return null;

      const name = String(c.pushName || c.name || jid);

      // WhatsApp LID (issue conhecida EvolutionAPI/Baileys #1872): parte dos
      // contatos (majoritariamente Android) tem o id como um identificador
      // interno "@lid" em vez do telefone real. O Baileys expõe um campo
      // phoneNumber separado nesse caso, mas ele só vem preenchido se a
      // configuração de privacidade do contato permitir — não é garantido, e
      // não sabemos com certeza o nome exato do campo que a Evolution repassa
      // (a issue trata justamente da tradução @lid→telefone ser inconsistente
      // entre versões). Por isso tentamos os nomes plausíveis e, se nenhum
      // vier com um telefone de verdade, marcamos como indisponível em vez de
      // importar o LID como se fosse número — foi isso que vazou como
      // "números" de 7-9 dígitos no incidente anterior.
      if (jid.includes("@lid")) {
        const numeroReal = findPhoneInRecord(c) ?? lidToPhone.get(jid) ?? messageLidMap.get(jid) ?? null;
        if (numeroReal) {
          return { number: numeroReal, name, numeroIndisponivel: false };
        }
        return { number: null, name, numeroIndisponivel: true };
      }

      // Só aceita o JID de usuário real; qualquer outro domínio não é telefone.
      if (!jid.includes("@s.whatsapp.net")) return null;
      // Remove o domínio e um eventual sufixo de device (":12") antes dele.
      const number = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
      // Rede de segurança: um telefone real (com DDI) tem 10 a 15 dígitos.
      if (number.length < 10 || number.length > 15) return null;
      // O próprio número do aparelho conectado não é lead.
      if (session.ownerNumber && number === session.ownerNumber) return null;
      return { number, name, numeroIndisponivel: false };
    })
    .filter(
      (c: unknown): c is { number: string | null; name: string; numeroIndisponivel: boolean } =>
        c !== null,
    );

  return {
    contacts: parsed,
    owner: { number: session.ownerNumber, name: session.profileName },
    // Front usa isso pra avisar "lista curta é esperado" em vez de deixar o
    // usuário achar que quebrou de novo logo após uma troca de aparelho.
    session: {
      since: session.sessionSince ? session.sessionSince.toISOString() : null,
      discardedFromPreviousSession: descartadosPorSessaoAnterior,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instance_name } = await req.json();
    if (!instance_name) throw new Error("instance_name is required");

    const { contacts, owner, session } = await listContacts(instance_name);

    return new Response(JSON.stringify({ ok: true, data: contacts, owner, session }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
