import { supabase } from "@/lib/supabase";

export interface ProcessoFieldValue {
  processoId: string; // "" = nenhum
  processoLabel: string;
  createNew: boolean;
  novoTitulo: string;
  novoCategoria: string;
}

export const EMPTY_PROCESSO_VALUE: ProcessoFieldValue = {
  processoId: "",
  processoLabel: "",
  createNew: false,
  novoTitulo: "",
  novoCategoria: "",
};

// Resolves the field state into a processo_id at save time, creating the new
// processo first when the inline form was used. Returns null for "nenhum".
export async function resolveProcessoId(value: ProcessoFieldValue): Promise<string | null> {
  if (value.createNew) {
    if (!value.novoTitulo.trim()) throw new Error("Informe o título do novo processo.");
    const { data, error } = await supabase
      .from("processos")
      .insert({
        titulo: value.novoTitulo.trim(),
        categoria: value.novoCategoria.trim() || "outro",
      })
      .select()
      .single();
    if (error) throw error;
    return data.id;
  }
  return value.processoId || null;
}
