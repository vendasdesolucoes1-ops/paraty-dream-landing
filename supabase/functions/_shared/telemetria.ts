// Registro de cada chamada de IA em `ai_chamadas` (auditoria R-24).
//
// A tabela de preço por 1M de tokens fica em modelos.ts, junto dos IDs.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PRECO_POR_MILHAO } from "./modelos.ts";

export interface ChamadaIA {
  funcao: string;
  modelo: string;
  leadId?: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  latenciaMs?: number;
  erro?: string | null;
  versaoPrompt?: string | null;
}

export function custoEstimado(modelo: string, entrada = 0, saida = 0): number | null {
  const preco = PRECO_POR_MILHAO[modelo];
  if (!preco) return null;
  return (entrada * preco.entrada + saida * preco.saida) / 1_000_000;
}

/** Nunca lança: telemetria não pode derrubar a resposta ao lead. */
export async function registrarChamadaIA(supabase: SupabaseClient, c: ChamadaIA): Promise<void> {
  try {
    const entrada = c.usage?.prompt_tokens ?? null;
    const saida = c.usage?.completion_tokens ?? null;
    await supabase.from("ai_chamadas").insert({
      funcao: c.funcao,
      modelo: c.modelo,
      lead_id: c.leadId ?? null,
      tokens_entrada: entrada,
      tokens_saida: saida,
      custo_usd: custoEstimado(c.modelo, entrada ?? 0, saida ?? 0),
      latencia_ms: c.latenciaMs ?? null,
      erro: c.erro ? c.erro.slice(0, 500) : null,
      versao_prompt: c.versaoPrompt ?? null,
    });
  } catch (e) {
    console.error("[telemetria] falhou:", (e as Error)?.message);
  }
}
