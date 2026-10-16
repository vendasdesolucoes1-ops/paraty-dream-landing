// O PostgREST devolve no máximo 1.000 linhas por consulta e corta o resto sem
// avisar. Para listas que precisam vir inteiras (os contatos de um disparo),
// a leitura é feita em lotes com `.range()` até o banco não ter mais nada.

/** Tamanho de cada lote: o teto padrão de linhas do PostgREST. */
export const LOTE_POSTGREST = 1000;

/** Quantos ids vão em cada `.in("id", …)`: mais que isso estoura o tamanho da URL. */
export const LOTE_IDS = 150;

type RespostaLote<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/**
 * Lê todas as linhas, lote a lote. `pagina(de, ate)` monta a consulta com
 * `.range(de, ate)` e uma ordenação estável (com o id desempatando), senão
 * linhas podem se repetir ou sumir entre um lote e outro.
 *
 * Só para quando um lote vem vazio, e não quando vem "menor que o pedido": se
 * o servidor estiver com um teto menor que 1.000, parar no primeiro lote curto
 * voltaria a cortar a lista em silêncio. Custa uma consulta a mais no fim.
 */
export async function buscarEmLotes<T>(
  pagina: (de: number, ate: number) => RespostaLote<T>,
  opcoes: { limite?: number; aoProgredir?: (carregados: number) => void } = {},
): Promise<T[]> {
  const limite = opcoes.limite ?? Number.POSITIVE_INFINITY;
  const linhas: T[] = [];
  while (linhas.length < limite) {
    const de = linhas.length;
    const ate = Math.min(de + LOTE_POSTGREST, limite) - 1;
    const { data, error } = await pagina(de, ate);
    if (error) throw error;
    if (!data || data.length === 0) break;
    linhas.push(...data);
    opcoes.aoProgredir?.(linhas.length);
  }
  return linhas;
}

/** Busca por uma lista de ids em pedaços, para não montar uma URL gigante. */
export async function buscarPorIds<T>(
  ids: string[],
  consulta: (pedaco: string[]) => RespostaLote<T>,
): Promise<T[]> {
  const linhas: T[] = [];
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const { data, error } = await consulta(ids.slice(i, i + LOTE_IDS));
    if (error) throw error;
    linhas.push(...(data ?? []));
  }
  return linhas;
}
