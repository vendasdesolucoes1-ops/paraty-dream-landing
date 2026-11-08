// Quem recebe a visita deste lead.
//
// Uma pessoa só, usada em três lugares que antes divergiam: o nome que a
// Sophia cita ("o Fulano vai te receber"), a agenda conferida para conflito de
// horário e o vendedor gravado na visita. Antes o texto usava sempre o
// consultor fixo do painel, enquanto a agenda e a visita usavam o vendedor do
// lead (que vem do rodízio): dois leads de vendedores diferentes podiam ouvir o
// mesmo nome e cair no mesmo horário.
//
// Regra: o vendedor do lead, quando ele existe e está ativo; senão o consultor
// responsável cadastrado no painel (plano B).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Consultor } from "./sophia-regras.ts";

export async function responsavelDoLead(
  supabase: SupabaseClient,
  vendedorId: string | null | undefined,
  planoB: Consultor | null,
): Promise<Consultor | null> {
  if (!vendedorId) return planoB;
  const { data, error } = await supabase
    .from("vendedores")
    .select("id, nome, telefone, ativo")
    .eq("id", vendedorId)
    .maybeSingle();
  if (error || !data || data.ativo === false || !String(data.nome ?? "").trim()) return planoB;
  return {
    vendedor_id: data.id as string,
    nome: String(data.nome).trim(),
    telefone: data.telefone ? String(data.telefone).replace(/\D/g, "") : null,
  };
}
