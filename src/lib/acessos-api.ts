import { supabase } from "@/lib/supabase";

// definir_acessos é nova e ainda não está nos tipos gerados do Supabase.
type RpcSolta = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcSolta;

/** Grava os acessos do vendedor (só administradores podem). */
export async function salvarAcessos(profileId: string, acessos: string[]) {
  const { error } = await rpc("definir_acessos", { p_profile_id: profileId, p_acessos: acessos });
  if (error) throw new Error(error.message);
}
