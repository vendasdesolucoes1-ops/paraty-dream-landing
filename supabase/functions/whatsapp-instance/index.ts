// Supabase Edge Function — manages Evolution API WhatsApp instances.
// Routes: POST /create, POST /connect, POST /status, DELETE /delete

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function createInstance(body: { instance_name: string; api_url: string; api_key: string }) {
  const { instance_name, api_url, api_key } = body;

  const evolutionResponse = await fetch(`${api_url}/instance/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: api_key },
    body: JSON.stringify({
      instanceName: instance_name,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });

  if (!evolutionResponse.ok) {
    const errText = await evolutionResponse.text();
    throw new Error(`Evolution API create error: ${errText}`);
  }

  const { data, error } = await supabase
    .from("whatsapp_instances")
    .insert({
      instance_name,
      api_url,
      api_key,
      status: "connecting",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function connectInstance(body: { instance_name: string }) {
  const { instance_name } = body;

  const { data: instance, error } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("instance_name", instance_name)
    .single();
  if (error || !instance) throw new Error("instance not found");

  const evolutionResponse = await fetch(`${instance.api_url}/instance/connect/${instance_name}`, {
    method: "GET",
    headers: { apikey: instance.api_key },
  });

  if (!evolutionResponse.ok) {
    const errText = await evolutionResponse.text();
    throw new Error(`Evolution API connect error: ${errText}`);
  }

  const result = await evolutionResponse.json();
  const qrCode = result.base64 ?? result.qrcode?.base64 ?? null;

  const { data: updated } = await supabase
    .from("whatsapp_instances")
    .update({
      qr_code: qrCode,
      qr_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
      status: "connecting",
    })
    .eq("id", instance.id)
    .select()
    .single();

  return updated;
}

async function checkStatus(body: { instance_name: string }) {
  const { instance_name } = body;

  const { data: instance, error } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("instance_name", instance_name)
    .single();
  if (error || !instance) throw new Error("instance not found");

  const evolutionResponse = await fetch(
    `${instance.api_url}/instance/connectionState/${instance_name}`,
    { method: "GET", headers: { apikey: instance.api_key } },
  );

  if (!evolutionResponse.ok) {
    const errText = await evolutionResponse.text();
    throw new Error(`Evolution API status error: ${errText}`);
  }

  const result = await evolutionResponse.json();
  const status = result.instance?.state ?? result.state ?? "unknown";

  const { data: updated } = await supabase
    .from("whatsapp_instances")
    .update({ status })
    .eq("id", instance.id)
    .select()
    .single();

  return updated;
}

async function logoutInstance(body: { instance_name: string }) {
  const { instance_name } = body;

  const { data: instance, error } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("instance_name", instance_name)
    .single();
  if (error || !instance) throw new Error("instance not found");

  const evolutionResponse = await fetch(`${instance.api_url}/instance/logout/${instance_name}`, {
    method: "DELETE",
    headers: { apikey: instance.api_key },
  });

  if (!evolutionResponse.ok) {
    const errText = await evolutionResponse.text();
    throw new Error(`Evolution API logout error: ${errText}`);
  }

  const { data: updated } = await supabase
    .from("whatsapp_instances")
    .update({ status: "disconnected", qr_code: null, qr_code_expires_at: null })
    .eq("id", instance.id)
    .select()
    .single();

  return updated;
}

async function fetchProfile(body: { instance_name: string }) {
  const { instance_name } = body;

  const { data: instance, error } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("instance_name", instance_name)
    .single();
  if (error || !instance) throw new Error("instance not found");

  const evolutionResponse = await fetch(
    `${instance.api_url}/instance/fetchInstances?instanceName=${encodeURIComponent(instance_name)}`,
    { method: "GET", headers: { apikey: instance.api_key } },
  );

  if (!evolutionResponse.ok) {
    const errText = await evolutionResponse.text();
    throw new Error(`Evolution API fetchInstances error: ${errText}`);
  }

  const result = await evolutionResponse.json();
  // fetchInstances returns an array (v2) or { instance } objects (v1) — normalize both
  const raw = Array.isArray(result)
    ? (result.find(
        (item: Record<string, any>) =>
          item.name === instance_name || item.instance?.instanceName === instance_name,
      ) ?? result[0])
    : result;
  const info = raw?.instance ?? raw ?? {};

  return {
    profile_name: info.profileName ?? info.profile_name ?? null,
    profile_pic_url: info.profilePicUrl ?? info.profile_pic_url ?? null,
    number: info.ownerJid?.replace(/@s\.whatsapp\.net$/, "") ?? info.owner ?? info.number ?? null,
    status: info.connectionStatus ?? info.state ?? instance.status,
  };
}

async function deleteInstance(body: { instance_name: string }) {
  const { instance_name } = body;

  const { data: instance, error } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("instance_name", instance_name)
    .single();
  if (error || !instance) throw new Error("instance not found");

  await fetch(`${instance.api_url}/instance/delete/${instance_name}`, {
    method: "DELETE",
    headers: { apikey: instance.api_key },
  }).catch(() => null);

  await supabase.from("whatsapp_instances").delete().eq("id", instance.id);

  return { deleted: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const route = url.pathname.split("/").filter(Boolean).pop();
    const body = req.method !== "GET" ? await req.json().catch(() => ({})) : {};

    // GET variants read instance_name from the query string.
    const getBody = { instance_name: url.searchParams.get("instance_name") ?? "" };

    let result;
    if (req.method === "POST" && route === "create") {
      result = await createInstance(body);
    } else if (route === "connect" || route === "qrcode") {
      result = await connectInstance(req.method === "GET" ? getBody : body);
    } else if (route === "status") {
      result = await checkStatus(req.method === "GET" ? getBody : body);
    } else if (route === "logout" || route === "disconnect") {
      result = await logoutInstance(req.method === "GET" ? getBody : body);
    } else if (route === "profile") {
      result = await fetchProfile(req.method === "GET" ? getBody : body);
    } else if (req.method === "DELETE" && route === "delete") {
      result = await deleteInstance(body);
    } else {
      return new Response(JSON.stringify({ error: "unknown route" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("whatsapp-instance error", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
