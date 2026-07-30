// Supabase Edge Function — lists all saved/chatted contacts of a WhatsApp
// instance via the Evolution API (the phone's own contact list, NOT group
// members — see whatsapp-groups for that).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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

  const response = await fetch(`${instance.api_url}/chat/findContacts/${instanceName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: instance.api_key },
    body: JSON.stringify({}),
  });
  if (!response.ok) throw new Error(`Evolution API findContacts error: ${await response.text()}`);

  const result = await response.json();
  const contacts = Array.isArray(result) ? result : (result.contacts ?? []);

  return contacts
    .map((c: Record<string, unknown>) => {
      const jid = String(c.id ?? c.jid ?? c.remoteJid ?? "");
      // Grupos, broadcast lists e LIDs (identificador interno do WhatsApp
      // multi-device) também aparecem em findContacts; nenhum dos três é um
      // telefone de pessoa disparável. .includes() em vez de .endsWith() por
      // segurança — algumas respostas da Evolution trazem sufixo de device
      // (":12@g.us") antes do domínio.
      if (jid.includes("@g.us") || jid.includes("@broadcast") || jid.includes("@lid")) return null;
      const number = jid.replace(/@s\.whatsapp\.net$/, "").replace(/\D/g, "");
      // Rede de segurança independente do formato do JID: um telefone real
      // (com DDI) tem entre 10 e 15 dígitos. Um grupo cujo campo de
      // identificação não bateu com os sufixos acima ainda cai fora aqui —
      // foi assim que grupos como "Fut dos amigos" vazaram como números de
      // 7-9 dígitos no incidente que motivou este filtro.
      if (number.length < 10 || number.length > 15) return null;
      return {
        number,
        // pushName vem vazio para parte dos contatos (bug conhecido da
        // Evolution API); cai pro próprio número, igual ao extrator de grupos.
        name: String(c.pushName || c.name || number),
      };
    })
    .filter((c: unknown): c is { number: string; name: string } => c !== null);
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
