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

async function listContacts(instanceName: string) {
  const instance = await getInstance(instanceName);
  const session = await getEvolutionSession(instance);
  assertConnected(session);

  const response = await fetch(`${instance.api_url}/chat/findContacts/${instanceName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: instance.api_key },
    body: JSON.stringify({}),
  });
  if (!response.ok) throw new Error(`Evolution API findContacts error: ${await response.text()}`);

  const result = await response.json();
  const contacts = Array.isArray(result) ? result : (result.contacts ?? []);

  const doAparelhoAtual = contacts.filter(
    (c: Record<string, unknown>) => !isFromPreviousSession(session, c),
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
        const candidato = String(
          c.phoneNumber ?? c.phone_number ?? c.pnJid ?? c.pn ?? c.remoteJidAlt ?? "",
        );
        const numeroReal = candidato.replace(/@s\.whatsapp\.net$/, "").replace(/\D/g, "");
        if (numeroReal.length >= 10 && numeroReal.length <= 15) {
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
      return { number, name, numeroIndisponivel: false };

    })
    .filter(
      (c: unknown): c is { number: string | null; name: string; numeroIndisponivel: boolean } =>
        c !== null,
    );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instance_name } = await req.json();
    if (!instance_name) throw new Error("instance_name is required");

    const result = await listContacts(instance_name);

    return new Response(JSON.stringify({ ok: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
