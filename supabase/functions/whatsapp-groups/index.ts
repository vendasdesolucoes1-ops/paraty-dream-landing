// Supabase Edge Function — lists WhatsApp groups and their participants via the Evolution API.
// Actions: { action: "list", instance_name } | { action: "participants", instance_name, group_jid }
//
// Toda ação exige aparelho conectado: sem isso a Evolution devolveria dado
// remanescente do celular anterior — ver _shared/evolution-instance.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { assertConnected, getEvolutionSession } from "../_shared/evolution-instance.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getConnectedInstance(instanceName: string) {
  const { data: instance, error } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("instance_name", instanceName)
    .single();
  if (error || !instance) throw new Error("instance not found");
  assertConnected(await getEvolutionSession(instance));
  return instance;
}

async function listGroups(instanceName: string) {
  const instance = await getConnectedInstance(instanceName);

  const response = await fetch(
    `${instance.api_url}/group/fetchAllGroups/${instanceName}?getParticipants=false`,
    { method: "GET", headers: { apikey: instance.api_key } },
  );

  if (!response.ok) throw new Error(`Evolution API fetchAllGroups error: ${await response.text()}`);

  const result = await response.json();
  const groups = Array.isArray(result) ? result : (result.groups ?? []);

  return groups.map((g: Record<string, any>) => ({
    id: g.id ?? g.jid,
    subject: g.subject ?? g.name ?? "Grupo sem nome",
    picture_url: g.pictureUrl ?? g.profilePicUrl ?? null,
    participants_count: g.size ?? g.participants?.length ?? null,
  }));
}

async function listParticipants(instanceName: string, groupJid: string) {
  const instance = await getConnectedInstance(instanceName);

  const response = await fetch(
    `${instance.api_url}/group/participants/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`,
    { method: "GET", headers: { apikey: instance.api_key } },
  );
  if (!response.ok) throw new Error(`Evolution API participants error: ${await response.text()}`);

  const result = await response.json();
  const participants = Array.isArray(result) ? result : (result.participants ?? []);

  return participants.map((p: Record<string, any>) => {
    const jid: string = p.id ?? p.jid ?? "";
    const number = jid.replace(/@s\.whatsapp\.net$/, "").replace(/\D/g, "");
    return {
      number,
      name: p.name ?? p.pushName ?? number,
      is_admin: p.admin === "admin" || p.admin === "superadmin" || Boolean(p.isAdmin),
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, instance_name, group_jid } = body;

    let result;
    if (action === "list") {
      result = await listGroups(instance_name);
    } else if (action === "participants") {
      if (!group_jid) throw new Error("group_jid is required");
      result = await listParticipants(instance_name, group_jid);
    } else {
      throw new Error("unknown action");
    }

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
