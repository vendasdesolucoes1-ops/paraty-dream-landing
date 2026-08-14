// Leitura tolerante do registro do lead.
//
// Motivo: migrations deste projeto são aplicadas à mão, então há sempre uma
// janela em que o código já cita uma coluna que o banco ainda não tem. O
// PostgREST responde `column leads.X does not exist` (SQLSTATE 42703) e o
// select inteiro falha — não devolve as outras colunas, devolve erro.
//
// Isso já derrubou a captação de leads: um select da enrich-lead citando
// `canal_origem` (migration 20260807000000, ainda não aplicada) fazia a função
// morrer com 500 antes de gravar a interação, antes de enfileirar a abordagem
// da Sophia e antes de qualificar o lead. Uma coluna opcional ausente parando
// a captação inteira é desproporcional: o lead vale mais que o campo.
//
// Aqui o select opcional é tentado uma vez; se o banco reclamar de coluna
// inexistente, cai para o conjunto que sempre existiu e segue com os campos
// que faltam como undefined.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Colunas presentes desde o schema inicial — este select nunca falha por 42703. */
export const COLUNAS_BASE = "id, nome, telefone, cidade, metragem_interesse, status_crm, vendedor_id";

/** Tudo que o CRM usa hoje, incluindo colunas de migrations recentes. */
export const COLUNAS_COMPLETAS =
  `${COLUNAS_BASE}, objetivo, forma_pagamento, canal_origem, is_teste, ` +
  `recusou_visita_em, recusas_visita, sem_interesse_em, contato_bloqueado`;

/** PostgreSQL: undefined_column. É o erro que sinaliza migration pendente. */
const UNDEFINED_COLUMN = "42703";

function ehColunaInexistente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === UNDEFINED_COLUMN) return true;
  // O PostgREST nem sempre repassa o SQLSTATE puro.
  return /does not exist/i.test(error.message ?? "");
}

/**
 * Lê o lead com todas as colunas; se alguma não existir no banco, refaz a
 * consulta só com as garantidas.
 *
 * Devolve null apenas quando o lead realmente não existe — nunca por causa de
 * uma migration pendente.
 */
export async function carregarLead(
  supabase: SupabaseClient,
  leadId: string,
): Promise<Record<string, unknown> | null> {
  const completo = await supabase
    .from("leads")
    .select(COLUNAS_COMPLETAS)
    .eq("id", leadId)
    .maybeSingle();

  if (!completo.error) return (completo.data as Record<string, unknown> | null) ?? null;

  if (!ehColunaInexistente(completo.error)) {
    console.error("[lead-record] leitura do lead falhou:", completo.error.message);
    return null;
  }

  // Alto de propósito: é uma migration pendente, e o sintoma (campos vazios no
  // resumo do vendedor, Sophia sem contexto) não se explica sozinho no log.
  console.error(
    "[lead-record] MIGRATION PENDENTE — coluna ausente em leads, seguindo com os campos básicos:",
    completo.error.message,
  );

  const basico = await supabase
    .from("leads")
    .select(COLUNAS_BASE)
    .eq("id", leadId)
    .maybeSingle();

  if (basico.error) {
    console.error("[lead-record] leitura básica também falhou:", basico.error.message);
    return null;
  }
  return (basico.data as Record<string, unknown> | null) ?? null;
}

/**
 * Mesma tolerância, buscando pelo telefone — usado pela enrich-lead quando o
 * formulário não devolveu lead_id.
 */
export async function carregarLeadPorTelefone(
  supabase: SupabaseClient,
  telefone: string,
): Promise<Record<string, unknown> | null> {
  const consulta = (colunas: string) =>
    supabase
      .from("leads")
      .select(colunas)
      .eq("telefone", telefone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  const completo = await consulta(COLUNAS_COMPLETAS);
  if (!completo.error) return (completo.data as Record<string, unknown> | null) ?? null;

  if (!ehColunaInexistente(completo.error)) {
    console.error("[lead-record] busca por telefone falhou:", completo.error.message);
    return null;
  }

  console.error(
    "[lead-record] MIGRATION PENDENTE — coluna ausente em leads, seguindo com os campos básicos:",
    completo.error.message,
  );

  const basico = await consulta(COLUNAS_BASE);
  if (basico.error) {
    console.error("[lead-record] busca básica também falhou:", basico.error.message);
    return null;
  }
  return (basico.data as Record<string, unknown> | null) ?? null;
}
