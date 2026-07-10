// Supabase Edge Function — team management (invite / update role / deactivate).
// Only callers whose profile has role='admin' may invoke any action.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) throw new Error("missing authorization token");

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) throw new Error("invalid session");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.role !== "admin") throw new Error("forbidden: admin role required");
}

async function nextRoundRobinPosicao(): Promise<number> {
  const { data } = await supabase
    .from("vendedores")
    .select("posicao_round_robin")
    .order("posicao_round_robin", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.posicao_round_robin ?? 0) + 1;
}

async function inviteMember(body: {
  nome: string;
  email: string;
  role: "admin" | "gestor" | "vendedor";
  vendedor_id?: string | null;
  novo_vendedor_nome?: string | null;
}) {
  const { nome, email, role } = body;
  let vendedorId = body.vendedor_id ?? null;

  if (!vendedorId && body.novo_vendedor_nome) {
    const { data: vendedor, error: vendedorError } = await supabase
      .from("vendedores")
      .insert({ nome: body.novo_vendedor_nome, email })
      .select()
      .single();
    if (vendedorError) throw vendedorError;
    vendedorId = vendedor.id;
  }

  // A "vendedor" login must have a corresponding salesperson record to be
  // eligible for round-robin assignment. If the admin didn't link an
  // existing one (or ask to create one via novo_vendedor_nome above), create
  // it here, placed at the back of the round-robin queue.
  if (role === "vendedor" && !vendedorId) {
    const posicao = await nextRoundRobinPosicao();
    const { data: vendedor, error: vendedorError } = await supabase
      .from("vendedores")
      .insert({ nome, email, ativo: true, posicao_round_robin: posicao })
      .select()
      .single();
    if (vendedorError) throw vendedorError;
    vendedorId = vendedor.id;
  }

  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);
  if (inviteError) throw inviteError;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      id: invited.user.id,
      nome,
      email,
      role,
      vendedor_id: vendedorId,
    })
    .select()
    .single();
  if (profileError) throw profileError;

  if (role === "vendedor" && vendedorId) {
    const { error: linkError } = await supabase
      .from("vendedores")
      .update({ profile_id: invited.user.id })
      .eq("id", vendedorId);
    if (linkError) throw linkError;
  }

  return profile;
}

async function updateRole(body: {
  profile_id: string;
  role: "admin" | "gestor" | "vendedor";
  vendedor_id?: string | null;
}) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ role: body.role, vendedor_id: body.vendedor_id ?? null })
    .eq("id", body.profile_id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deactivateMember(body: { profile_id: string }) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ ativo: false })
    .eq("id", body.profile_id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await requireAdmin(req);

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    let result;
    if (action === "invite") {
      result = await inviteMember(body);
    } else if (action === "update_role") {
      result = await updateRole(body);
    } else if (action === "deactivate") {
      result = await deactivateMember(body);
    } else {
      return new Response(JSON.stringify({ error: "unknown action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("manage-team error", error);
    const message = String(error);
    const status = message.includes("forbidden") || message.includes("invalid session") ? 403 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
