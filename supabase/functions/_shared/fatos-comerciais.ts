// Fatos comerciais aprovados (auditoria R-20). Fonte: public.fatos_comerciais.
//
// O Imagery só cita condição comercial que esteja APROVADA na tabela, e a
// publicação é bloqueada se a legenda trouxer parcela, percentual ou valor
// que não bata com ela.

// Tipo mínimo: as funções do Imagery usam outra versão do supabase-js.
// deno-lint-ignore no-explicit-any
type ClienteSupabase = { from: (tabela: string) => any };

export type Fatos = Record<string, string>;

export async function carregarFatosAprovados(supabase: ClienteSupabase): Promise<Fatos> {
  const { data, error } = await supabase
    .from("fatos_comerciais")
    .select("chave, valor")
    .eq("status", "aprovado");
  if (error) {
    console.error("[fatos-comerciais] leitura falhou:", error.message);
    return {};
  }
  return Object.fromEntries(
    ((data ?? []) as { chave: string; valor: string }[]).map((f) => [f.chave, f.valor]),
  );
}

/** Linha de condição comercial para o prompt do Imagery. */
export function linhaCondicao(fatos: Fatos): string {
  if (fatos.entrada_percentual && fatos.parcelas_max) {
    return `- Entrada de ${fatos.entrada_percentual}% + saldo em até ${fatos.parcelas_max}x, direto com a loteadora — sem banco, sem burocracia.`;
  }
  return "- Condição de pagamento: NÃO CITE (ainda não aprovada pela gestão).";
}

/**
 * Condições citadas no texto que não batem com os fatos aprovados. Vazio =
 * texto ok. Valores em reais nunca são aceitos em peça automática.
 */
export function violacoesComerciais(texto: string, fatos: Fatos): string[] {
  const violacoes: string[] = [];
  if (/R\$\s?\d/.test(texto)) violacoes.push("valor em reais");
  for (const m of texto.matchAll(/(\d{1,3})\s?x\b/gi)) {
    if (m[1] !== fatos.parcelas_max) violacoes.push(`${m[1]}x`);
  }
  for (const m of texto.matchAll(/(\d{1,3})\s?%/g)) {
    if (m[1] !== fatos.entrada_percentual) violacoes.push(`${m[1]}%`);
  }
  return [...new Set(violacoes)];
}
