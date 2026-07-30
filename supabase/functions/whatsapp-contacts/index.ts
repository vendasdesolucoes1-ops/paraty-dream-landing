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
    .map((c: Record<string, any>) => {
      const jid: string = c.id ?? c.jid ?? "";
      // Grupos e broadcast lists também aparecem em findContacts; não são
      // contatos de pessoa e não têm telefone para disparo.
      if (jid.endsWith("@g.us") || jid.endsWith("@broadcast")) return null;
      const number = jid.replace(/@s\.whatsapp\.net$/, "").replace(/\D/g, "");
      if (!number) return null;
      return {
        number,
        // pushName vem vazio para parte dos contatos (bug conhecido da
        // Evolution API); cai pro próprio número, igual ao extrator de grupos.
        name: c.pushName || c.name || number,
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
