// Envelope de execução dos jobs da integração Meta.
//
// Todo job passa por `executarJob`: abre um registro em meta_sync_execucoes,
// roda o trabalho e fecha o registro com status, contagem e erro. Assim o
// histórico mostra o que rodou, quanto gravou e por que falhou.
import { MetaApiError, MetaRateLimitError, MetaTokenInvalidoError } from "./meta-graph.ts";
import type { Armazem } from "./meta-armazem.ts";

export interface SaidaJob {
  registros: number;
  detalhes?: Record<string, unknown>;
  /** true quando parte do trabalho ficou para a próxima execução. */
  parcial?: boolean;
}

export interface OpcoesExecucao {
  /** Chamado quando a Meta devolve 190: ponto de ligação do alerta (etapa 5). */
  aoTokenInvalido?: (erro: MetaTokenInvalidoError) => Promise<void> | void;
}

export type RelatorioExecucao =
  | { ok: true; execucaoId: string; status: "sucesso" | "parcial"; registros: number; detalhes: Record<string, unknown> }
  | { ok: false; execucaoId: string; status: "erro"; erro: string; codigoErro: number | null; tokenInvalido: boolean };

/**
 * Nunca lança por falha do job: devolve o relatório, para a Edge Function
 * responder com o resultado. Só lança se nem o registro da execução abrir.
 */
export async function executarJob(
  armazem: Armazem,
  job: string,
  trabalho: () => Promise<SaidaJob>,
  opcoes: OpcoesExecucao = {},
): Promise<RelatorioExecucao> {
  const execucaoId = await armazem.iniciarExecucao(job);
  try {
    const saida = await trabalho();
    const status = saida.parcial ? "parcial" : "sucesso";
    await armazem.finalizarExecucao(execucaoId, {
      status,
      registros: saida.registros,
      detalhes: saida.detalhes,
    });
    return { ok: true, execucaoId, status, registros: saida.registros, detalhes: saida.detalhes ?? {} };
  } catch (e) {
    const erro = e as Error;
    const tokenInvalido = e instanceof MetaTokenInvalidoError;
    const codigoErro = e instanceof MetaApiError ? e.code : null;
    const detalhes: Record<string, unknown> = {};
    if (e instanceof MetaRateLimitError && e.retryAfterMs != null) detalhes.retryAfterMs = e.retryAfterMs;
    if (e instanceof MetaApiError && e.fbtraceId) detalhes.fbtraceId = e.fbtraceId;
    await armazem.finalizarExecucao(execucaoId, {
      status: "erro",
      registros: 0,
      erro: erro.message,
      codigoErro,
      detalhes,
    });
    if (e instanceof MetaTokenInvalidoError) {
      try {
        await opcoes.aoTokenInvalido?.(e);
      } catch (alertaErro) {
        console.error("[meta] falha ao emitir alerta de token:", (alertaErro as Error).message);
      }
    }
    return { ok: false, execucaoId, status: "erro", erro: erro.message, codigoErro, tokenInvalido };
  }
}
