// Supabase Edge Function — team management (invite / update role / deactivate).
// Only callers whose profile has role='admin' may invoke any action.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type Role = "admin" | "gestor" | "vendedor";

interface Caller {
  id: string;
  role: Role;
}

// Erros de regra de negócio: a mensagem é exibida ao usuário como está.
class BusinessError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "BusinessError";
    this.status = status;
  }
}

async function getCaller(req: Request): Promise<Caller> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) throw new Error("missing authorization token");

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) throw new Error("invalid session");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new Error("forbidden: no profile");
  if (!profile.ativo) throw new Error("forbidden: inactive account");

  return { id: userData.user.id, role: profile.role as Role };
}

async function getTargetProfile(profileId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nome, email, role, ativo")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new BusinessError("Membro não encontrado.", 404);
  return data as { id: string; nome: string | null; email: string | null; role: Role; ativo: boolean };
}

async function countActiveAdmins(): Promise<number> {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("ativo", true);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Se este membro é o último admin ativo, removê-lo (rebaixar ou desativar)
 * deixaria o sistema sem ninguém capaz de gerenciar a equipe.
 */
async function assertNotLastAdmin(target: { role: Role; ativo: boolean }) {
  if (target.role !== "admin" || !target.ativo) return;
  if ((await countActiveAdmins()) <= 1) {
    throw new BusinessError("Não é possível remover o último administrador ativo.", 409);
  }
}

/** Senha, status e qualquer ação sobre um admin são exclusivas de admin. */
function assertCanManageAccount(caller: Caller, target: { id: string; role: Role }) {
  if (caller.role !== "admin") {
    throw new BusinessError("Apenas administradores podem alterar senha ou status.", 403);
  }
  if (caller.id === target.id) {
    throw new BusinessError("Você não pode alterar o status da própria conta.", 403);
  }
}

// Senha temporária gerada no servidor: garante pelo menos uma maiúscula, uma
// minúscula e um dígito, e usa crypto.getRandomValues (não Math.random) porque
// é a credencial inicial de acesso ao painel.
function generateTemporaryPassword(length = 14): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sem I/O, que confundem na leitura
  const lower = "abcdefghijkmnopqrstuvwxyz"; // sem l
  const digits = "23456789"; // sem 0/1
  const all = upper + lower + digits;

  const pick = (charset: string) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return charset[buf[0] % charset.length];
  };

  const chars = [pick(upper), pick(lower), pick(digits)];
  while (chars.length < length) chars.push(pick(all));

  // Embaralha para os caracteres obrigatórios não ficarem sempre nas 3 primeiras
  // posições (Fisher-Yates com bytes aleatórios).
  for (let i = chars.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function isDuplicateEmailError(error: { code?: string; message?: string; status?: number }) {
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  return (
    code === "email_exists" ||
    code === "user_already_exists" ||
    message.includes("already been registered") ||
    message.includes("already registered") ||
    message.includes("already exists")
  );
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

  // O usuário do Auth é criado primeiro: assim um e-mail duplicado falha antes
  // de deixar um registro de vendedor órfão para trás.
  const senhaTemporaria = generateTemporaryPassword();
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password: senhaTemporaria,
    // O admin está cadastrando manualmente alguém que ele conhece, então não há
    // por que exigir a confirmação por e-mail.
    email_confirm: true,
  });
  if (createError) {
    if (isDuplicateEmailError(createError)) throw new Error("email_ja_cadastrado");
    throw createError;
  }

  const userId = created.user.id;

  // A partir daqui qualquer falha desfaz o usuário recém-criado, senão sobraria
  // um login sem profile — que passa pelo /login mas não resolve papel nenhum.
  try {
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

    const { error: profileError } = await supabase.from("profiles").insert({
      id: userId,
      nome,
      email,
      role,
      vendedor_id: vendedorId,
    });
    if (profileError) throw profileError;

    if (role === "vendedor" && vendedorId) {
      const { error: linkError } = await supabase
        .from("vendedores")
        .update({ profile_id: userId })
        .eq("id", vendedorId);
      if (linkError) throw linkError;
    }
  } catch (err) {
    await supabase.auth.admin.deleteUser(userId).catch(() => {});
    throw err;
  }

  // A senha só existe aqui e na tela do admin — nunca é gravada em tabela.
  return { success: true, email, senha_temporaria: senhaTemporaria };
}

async function updateRole(
  caller: Caller,
  body: { profile_id: string; role: Role; vendedor_id?: string | null },
) {
  const target = await getTargetProfile(body.profile_id);

  // Gestor administra a operação, não os administradores: não edita um admin
  // nem promove ninguém a admin.
  if (caller.role !== "admin") {
    if (caller.role !== "gestor") {
      throw new BusinessError("Você não tem permissão para editar membros.", 403);
    }
    if (target.role === "admin") {
      throw new BusinessError("Gestores não podem editar administradores.", 403);
    }
    if (body.role === "admin") {
      throw new BusinessError("Apenas administradores podem promover alguém a administrador.", 403);
    }
  }

  if (body.role !== "admin") await assertNotLastAdmin(target);

  const { data, error } = await supabase
    .from("profiles")
    .update({ role: body.role, vendedor_id: body.vendedor_id ?? null })
    .eq("id", body.profile_id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Desativar precisa bloquear o login de fato: só marcar profiles.ativo=false
// deixava a sessão do Auth continuar funcionando normalmente.
const BAN_FOREVER = "876000h"; // 100 anos

async function deactivateMember(caller: Caller, body: { profile_id: string }) {
  const target = await getTargetProfile(body.profile_id);
  assertCanManageAccount(caller, target);
  await assertNotLastAdmin(target);

  const { error: banError } = await supabase.auth.admin.updateUserById(body.profile_id, {
    ban_duration: BAN_FOREVER,
  });
  if (banError) throw banError;

  // O profile e todo o histórico de atribuições continuam intactos.
  const { data, error } = await supabase
    .from("profiles")
    .update({ ativo: false })
    .eq("id", body.profile_id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function reactivateMember(caller: Caller, body: { profile_id: string }) {
  const target = await getTargetProfile(body.profile_id);
  assertCanManageAccount(caller, target);

  const { error: unbanError } = await supabase.auth.admin.updateUserById(body.profile_id, {
    ban_duration: "none",
  });
  if (unbanError) throw unbanError;

  const { data, error } = await supabase
    .from("profiles")
    .update({ ativo: true })
    .eq("id", body.profile_id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function resetPassword(caller: Caller, body: { profile_id: string }) {
  const target = await getTargetProfile(body.profile_id);
  assertCanManageAccount(caller, target);

  const senhaTemporaria = generateTemporaryPassword();
  const { error } = await supabase.auth.admin.updateUserById(body.profile_id, {
    password: senhaTemporaria,
  });
  if (error) throw error;

  // Mesma regra da criação: a senha só existe aqui e na tela do admin.
  return { success: true, email: target.email, senha_temporaria: senhaTemporaria };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const caller = await getCaller(req);

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    let result;
    if (action === "invite") {
      if (caller.role !== "admin") {
        throw new BusinessError("Apenas administradores podem criar membros.", 403);
      }
      result = await inviteMember(body);
    } else if (action === "update_role") {
      result = await updateRole(caller, body);
    } else if (action === "deactivate") {
      result = await deactivateMember(caller, body);
    } else if (action === "reactivate") {
      result = await reactivateMember(caller, body);
    } else if (action === "reset_password") {
      result = await resetPassword(caller, body);
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
    // Regras de negócio carregam mensagem própria, já pronta para a tela.
    if (error instanceof BusinessError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Erros do PostgREST são objetos simples: String(err) viraria "[object Object]".
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null
          ? ((error as { message?: string }).message ?? JSON.stringify(error))
          : String(error);

    if (message.includes("email_ja_cadastrado")) {
      return new Response(
        JSON.stringify({ error: "Este e-mail já está cadastrado." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const status = message.includes("forbidden") || message.includes("invalid session") ? 403 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
