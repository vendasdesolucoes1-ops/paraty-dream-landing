// Guard de autenticação compartilhado pelas Edge Functions.
//
// Toda função que roda com a service_role precisa decidir QUEM está chamando.
// A chave `anon` vai no bundle do site, então "ter um Authorization" não prova
// nada: é preciso validar o JWT do usuário e o papel dele, ou um segredo de
// máquina guardado no Vault.
//
// Três formas de chamada são aceitas:
//   1. Usuário logado, com perfil ativo e papel permitido (painel).
//   2. Segredo de máquina (cron, webhook da Evolution, chamadas entre funções),
//      conferido pelo próprio banco via `segredo_interno_valido` — a função não
//      conhece o valor, só pergunta se confere.
//   3. A própria service_role (chamadas internas antigas, scripts de operação).
//
// Falha fechada: qualquer erro de validação vira 401/403.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

let adminClient: SupabaseClient | null = null;
function admin(): SupabaseClient {
  adminClient ??= createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return adminClient;
}

export type Papel = "admin" | "gestor" | "vendedor";

export const PAPEIS_GESTAO: Papel[] = ["admin", "gestor"];
export const TODOS_OS_PAPEIS: Papel[] = ["admin", "gestor", "vendedor"];

/** Nomes de segredo aceitos por `segredo_interno_valido` (ver a migration). */
export type NomeSegredo = "cron_fila_secret" | "evolution_webhook_secret" | "ai_agent_chat_secret";

export const HEADER_SEGREDO = "x-internal-secret";

export type Chamador =
  | { tipo: "usuario"; id: string; papel: Papel }
  | { tipo: "maquina"; segredo: NomeSegredo }
  | { tipo: "service_role" };

// Comparação em tempo constante: a latência não revela o prefixo acertado.
export function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function recusar(status: 401 | 403, motivo: string): Response {
  return new Response(JSON.stringify({ error: motivo }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bearer(req: Request): string {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

export function ehServiceRole(req: Request): boolean {
  const token = bearer(req);
  return !!token && !!SUPABASE_SERVICE_ROLE_KEY && iguais(token, SUPABASE_SERVICE_ROLE_KEY);
}

/** Pergunta ao banco se o segredo confere com o guardado no Vault. */
export async function segredoValido(nome: NomeSegredo, valor: string | null): Promise<boolean> {
  if (!valor) return false;
  const { data, error } = await admin().rpc("segredo_interno_valido", {
    p_nome: nome,
    p_segredo: valor,
  });
  if (error) {
    console.error("auth: segredo_interno_valido falhou", error.message);
    return false;
  }
  return data === true;
}

/** Valida o JWT do usuário e devolve o papel, ou null quando não serve. */
export async function usuarioDoPedido(req: Request): Promise<{ id: string; papel: Papel } | null> {
  const token = bearer(req);
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) return null;

  const { data: perfil } = await admin()
    .from("profiles")
    .select("role, ativo, deletado_em")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!perfil || !perfil.ativo || perfil.deletado_em) return null;
  if (!TODOS_OS_PAPEIS.includes(perfil.role as Papel)) return null;
  return { id: data.user.id, papel: perfil.role as Papel };
}

interface OpcoesGuard {
  /** Papéis de usuário aceitos. Vazio = nenhum usuário do painel. */
  papeis?: Papel[];
  /** Segredos de máquina aceitos (lidos de HEADER_SEGREDO ou `?token=`). */
  segredos?: NomeSegredo[];
  /** Aceita a service_role como Bearer. Padrão: true. */
  serviceRole?: boolean;
}

/**
 * Decide se a chamada pode seguir. Devolve o chamador, ou uma Response de
 * recusa que a função deve retornar imediatamente.
 */
export async function exigirChamador(
  req: Request,
  opcoes: OpcoesGuard,
): Promise<Chamador | Response> {
  const { papeis = [], segredos = [], serviceRole = true } = opcoes;

  if (segredos.length) {
    const url = new URL(req.url);
    const valor = req.headers.get(HEADER_SEGREDO) ?? url.searchParams.get("token");
    if (valor) {
      for (const nome of segredos) {
        if (await segredoValido(nome, valor)) return { tipo: "maquina", segredo: nome };
      }
      return recusar(401, "Unauthorized");
    }
  }

  if (serviceRole && ehServiceRole(req)) return { tipo: "service_role" };

  if (papeis.length) {
    const usuario = await usuarioDoPedido(req);
    if (!usuario) return recusar(401, "Unauthorized");
    if (!papeis.includes(usuario.papel)) return recusar(403, "Forbidden");
    return { tipo: "usuario", ...usuario };
  }

  return recusar(401, "Unauthorized");
}
