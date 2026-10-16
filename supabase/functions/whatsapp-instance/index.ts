// Supabase Edge Function — manages Evolution API WhatsApp instances.
// Routes: POST /create, POST /connect, POST /status, DELETE /delete

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { exigirChamador, PAPEIS_GESTAO, recusar } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Hosts aceitos para a Evolution, separados por vírgula. Vazio = qualquer host
// HTTPS público (o create continua restrito a admin).
const HOSTS_PERMITIDOS = (Deno.env.get("EVOLUTION_ALLOWED_HOSTS") ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

// A api_key da Evolution controla o número inteiro: nunca sai desta função.
function semSegredos<T extends Record<string, unknown> | null>(linha: T): T {
  if (!linha) return linha;
  const { api_key: _k, api_url: _u, ...resto } = linha as Record<string, unknown>;
  return resto as T;
}

function validarApiUrl(bruta: string): string {
  let url: URL;
  try {
    url = new URL(bruta);
  } catch {
    throw new Error("api_url inválida");
  }
  if (url.protocol !== "https:") throw new Error("api_url precisa ser https");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(host) ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    throw new Error("api_url aponta para rede interna");
  }
  if (HOSTS_PERMITIDOS.length && !HOSTS_PERMITIDOS.includes(host)) {
    throw new Error("api_url fora da lista EVOLUTION_ALLOWED_HOSTS");
  }
  return url.origin + url.pathname.replace(/\/$/, "");
}

async function createInstance(body: { instance_name: string; api_url: string; api_key: string }) {
  const { instance_name, api_key } = body;
  const api_url = validarApiUrl(body.api_url);
  if (!/^[\w.-]{1,64}$/.test(instance_name ?? "")) throw new Error("instance_name inválido");

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

  // A agenda do aparelho só é enviada pelo Baileys durante a sincronização de
  // histórico. Sem esta configuração, uma leitura de QR pode conectar e enviar
  // mensagens normalmente, mas `findContacts` fica vazio ou contém apenas LIDs.
  const settingsResponse = await fetch(
    `${instance.api_url.replace(/\/$/, "")}/settings/set/${encodeURIComponent(instance_name)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: instance.api_key },
      body: JSON.stringify({
        rejectCall: false,
        groupsIgnore: false,
        alwaysOnline: false,
        readMessages: false,
        readStatus: false,
        syncFullHistory: true,
      }),
    },
  );
  if (!settingsResponse.ok) {
    console.warn(
      "Evolution API não aceitou syncFullHistory:",
      settingsResponse.status,
      await settingsResponse.text(),
    );
  }

  const evolutionResponse = await fetch(
    `${instance.api_url.replace(/\/$/, "")}/instance/connect/${encodeURIComponent(instance_name)}`,
    { method: "GET", headers: { apikey: instance.api_key } },
  );

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

  const chamador = await exigirChamador(req, { papeis: PAPEIS_GESTAO });
  if (chamador instanceof Response) return chamador;

  try {
    const url = new URL(req.url);
    const route = url.pathname.split("/").filter(Boolean).pop();
    const body = req.method !== "GET" ? await req.json().catch(() => ({})) : {};

    // GET variants read instance_name from the query string.
    const getBody = { instance_name: url.searchParams.get("instance_name") ?? "" };

    // Criar e apagar instância trocam o número da empresa: só admin.
    const soAdmin = route === "create" || route === "delete";
    if (soAdmin && chamador.tipo === "usuario" && chamador.papel !== "admin") {
      return recusar(403, "Forbidden: apenas admin");
    }

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

    return new Response(JSON.stringify(semSegredos(result as Record<string, unknown>)), {
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
