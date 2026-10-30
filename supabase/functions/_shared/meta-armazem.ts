// Acesso a dados da integração Meta.
//
// Os syncs falam com a interface `Armazem`, não com o Supabase direto: nos
// testes entra um dublê em memória; em produção, `armazemSupabase`.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Linha = Record<string, unknown>;

export type StatusExecucao = "executando" | "sucesso" | "parcial" | "erro";

export interface ResultadoExecucao {
  status: Exclude<StatusExecucao, "executando">;
  registros: number;
  erro?: string | null;
  codigoErro?: number | null;
  detalhes?: Record<string, unknown>;
}

export interface Armazem {
  /**
   * Insere ou atualiza as linhas pela(s) coluna(s) de conflito e devolve quantas
   * linhas foram gravadas. Idempotente: repetir a chamada não duplica nada.
   */
  upsert(tabela: string, linhas: Linha[], conflito: string): Promise<number>;
  iniciarExecucao(job: string): Promise<string>;
  finalizarExecucao(id: string, resultado: ResultadoExecucao): Promise<void>;
  /** Estado persistido de um job (cursor da carga inicial, relatório em andamento). */
  lerEstado(chave: string): Promise<Record<string, unknown> | null>;
  salvarEstado(chave: string, valor: Record<string, unknown>): Promise<void>;
}

/** Tamanho do lote por requisição ao PostgREST. */
export const TAMANHO_LOTE = 500;

/**
 * Remove linhas repetidas pela chave de conflito (a última vence). Sem isso o
 * Postgres recusa o lote: "ON CONFLICT DO UPDATE command cannot affect row a
 * second time" — a paginação da Meta pode repetir um item entre páginas.
 */
export function deduplicar(linhas: Linha[], conflito: string): Linha[] {
  const colunas = conflito.split(",").map((c) => c.trim());
  const mapa = new Map<string, Linha>();
  for (const l of linhas) mapa.set(colunas.map((c) => String(l[c])).join("\u0000"), l);
  return [...mapa.values()];
}

export function emLotes<T>(itens: T[], tamanho = TAMANHO_LOTE): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

export function armazemSupabase(supabase: SupabaseClient): Armazem {
  return {
    async upsert(tabela, linhas, conflito) {
      let gravadas = 0;
      for (const lote of emLotes(deduplicar(linhas, conflito))) {
        const { error } = await supabase.from(tabela).upsert(lote, { onConflict: conflito });
        if (error) throw new Error(`upsert em ${tabela} falhou: ${error.message}`);
        gravadas += lote.length;
      }
      return gravadas;
    },

    async lerEstado(chave) {
      const { data, error } = await supabase
        .from("meta_sync_estado")
        .select("valor")
        .eq("chave", chave)
        .maybeSingle();
      if (error) throw new Error(`não foi possível ler o estado ${chave}: ${error.message}`);
      return (data?.valor as Record<string, unknown> | undefined) ?? null;
    },

    async salvarEstado(chave, valor) {
      const { error } = await supabase
        .from("meta_sync_estado")
        .upsert({ chave, valor, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
      if (error) throw new Error(`não foi possível salvar o estado ${chave}: ${error.message}`);
    },

    async iniciarExecucao(job) {
      const { data, error } = await supabase
        .from("meta_sync_execucoes")
        .insert({ job })
        .select("id")
        .single();
      if (error || !data) throw new Error(`não foi possível registrar a execução: ${error?.message}`);
      return data.id as string;
    },

    async finalizarExecucao(id, r) {
      const { error } = await supabase
        .from("meta_sync_execucoes")
        .update({
          finalizado_em: new Date().toISOString(),
          status: r.status,
          registros: r.registros,
          erro: r.erro ? r.erro.slice(0, 1000) : null,
          codigo_erro: r.codigoErro ?? null,
          detalhes: r.detalhes ?? {},
        })
        .eq("id", id);
      // Falha ao fechar o registro não deve mascarar o resultado do job.
      if (error) console.error("[meta] falha ao finalizar execução:", error.message);
    },
  };
}
