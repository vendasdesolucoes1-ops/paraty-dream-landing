// Jobs da integração Meta, prontos para as Edge Functions chamarem.
//
// Aqui fica tudo o que decide o que roda e como o resultado vira resposta HTTP,
// sem depender do Deno: as Edge Functions (meta-sync-*, meta-backfill) são só
// "casca" (autenticação + ambiente) em volta destas funções, que os testes
// exercitam em Node.
//
//   rodarSyncAds        diário: estrutura + métricas dos últimos 28 dias
//   rodarSyncInstagram  diário: conta, insights, demografia e posts de 30 dias
//   rodarSyncStories    horário: stories no ar (24 h)
//   rodarCargaInicial   manual: 37 meses de Ads (repetir até concluir) ou acervo do Instagram
import { sincronizarEstruturaAds } from "./meta-ads-estrutura.ts";
import { carregarHistorico, sincronizarIncremental } from "./meta-ads-insights.ts";
import type { Armazem } from "./meta-armazem.ts";
import { MetaRateLimitError, MetaTokenInvalidoError, type MetaGraphClient } from "./meta-graph.ts";
import { sincronizarInstagramDiario, sincronizarStories } from "./meta-instagram.ts";
import { executarJob, type SaidaJob } from "./meta-sync-run.ts";

export interface DepsJob {
  armazem: Armazem;
  /** Lê o ambiente e monta o cliente. Lança Error com mensagem clara se faltar variável. */
  criarCliente: () => MetaGraphClient;
  /** Verificação de boot (uma vez por instância da função). Opcional. */
  boot?: (cliente: MetaGraphClient) => Promise<void>;
  // Injetáveis nos testes:
  data?: Date;
  agora?: () => number;
  dormir?: (ms: number) => Promise<void>;
}

export interface ResultadoHttp {
  status: number;
  corpo: Record<string, unknown>;
}

/** Orçamento de tempo de uma execução (a Edge Function tem ~150 s de relógio). */
export const ORCAMENTO_MS = 110_000;
/** Sucesso nas últimas 20 h = trabalho do dia feito: as retomadas do cron só pulam. */
export const GUARDA_DIARIA_HORAS = 20;

async function bootTolerante(deps: DepsJob, cliente: MetaGraphClient): Promise<void> {
  if (!deps.boot) return;
  try {
    await deps.boot(cliente);
  } catch (e) {
    // Token inválido e rate limit param o job; qualquer outra falha do boot é
    // diagnóstico (já logado) e não deve impedir o sync.
    if (e instanceof MetaTokenInvalidoError || e instanceof MetaRateLimitError) throw e;
    console.warn(JSON.stringify({ origem: "meta-jobs", evento: "boot_falhou", erro: (e as Error).message }));
  }
}

interface OpcoesExecucao {
  /** Se informado, pula quando já houve sucesso do job nessa janela (em horas). */
  guardaHoras?: number;
  forcar?: boolean;
}

async function executarComoHttp(
  deps: DepsJob,
  job: string,
  opcoes: OpcoesExecucao,
  trabalho: (cliente: MetaGraphClient) => Promise<SaidaJob>,
): Promise<ResultadoHttp> {
  if (opcoes.guardaHoras && !opcoes.forcar && (await deps.armazem.execucaoRecente(job, opcoes.guardaHoras))) {
    return {
      status: 200,
      corpo: { ok: true, job, pulado: true, motivo: `já concluído nas últimas ${opcoes.guardaHoras} h` },
    };
  }

  let cliente: MetaGraphClient;
  try {
    cliente = deps.criarCliente();
  } catch (e) {
    return { status: 503, corpo: { ok: false, job, erro: (e as Error).message } };
  }

  const r = await executarJob(
    deps.armazem,
    job,
    async () => {
      await bootTolerante(deps, cliente);
      return trabalho(cliente);
    },
    { aoTokenInvalido: (e) => deps.armazem.alertarTokenInvalido(e.message) },
  );

  if (r.ok) {
    return {
      status: 200,
      corpo: { ok: true, job, status: r.status, registros: r.registros, detalhes: r.detalhes, execucaoId: r.execucaoId },
    };
  }
  return {
    status: 502,
    corpo: { ok: false, job, erro: r.erro, codigoErro: r.codigoErro, tokenInvalido: r.tokenInvalido, execucaoId: r.execucaoId },
  };
}

// --- jobs -----------------------------------------------------------------------------

export function rodarSyncAds(deps: DepsJob, opcoes: { forcar?: boolean } = {}): Promise<ResultadoHttp> {
  return executarComoHttp(
    deps, "ads_diario", { guardaHoras: GUARDA_DIARIA_HORAS, forcar: opcoes.forcar },
    async (cliente) => {
      const agora = deps.agora ?? Date.now;
      const inicio = agora();
      const estrutura = await sincronizarEstruturaAds(cliente, deps.armazem);
      // O que sobrar do tempo vai para as métricas; se não terminar, o estado
      // fica salvo e a próxima chamada do cron retoma.
      const restante = Math.max(20_000, ORCAMENTO_MS - (agora() - inicio));
      const incremental = await sincronizarIncremental(cliente, deps.armazem, {
        data: deps.data, orcamentoMs: restante, agora: deps.agora, dormir: deps.dormir,
      });
      return {
        registros: estrutura.campanhas + estrutura.conjuntos + estrutura.anuncios + incremental.registros,
        parcial: !incremental.concluido,
        detalhes: { estrutura, incremental: { concluido: incremental.concluido, janela: incremental.janela, ...incremental.detalhes } },
      };
    },
  );
}

export function rodarSyncInstagram(deps: DepsJob, opcoes: { forcar?: boolean } = {}): Promise<ResultadoHttp> {
  return executarComoHttp(
    deps, "ig_diario", { guardaHoras: GUARDA_DIARIA_HORAS, forcar: opcoes.forcar },
    async (cliente) => {
      const r = await sincronizarInstagramDiario(cliente, deps.armazem, { data: deps.data });
      return { registros: r.registros, parcial: r.parcial, detalhes: r.detalhes as unknown as Record<string, unknown> };
    },
  );
}

export function rodarSyncStories(deps: DepsJob): Promise<ResultadoHttp> {
  return executarComoHttp(deps, "ig_stories", {}, async (cliente) => {
    const r = await sincronizarStories(cliente, deps.armazem, { data: deps.data });
    return { registros: r.registros, detalhes: { stories: r.stories, ...r.detalhes } };
  });
}

export interface OpcoesCargaInicial {
  escopo?: "ads" | "instagram";
  /** Recomeça do zero (ignora o cursor salvo). */
  reiniciar?: boolean;
  /** Janela de Ads em meses (padrão e máximo da Meta: 37). */
  meses?: number;
  /** Instagram: dias de insights de conta a puxar (padrão 30). */
  dias?: number;
}

/**
 * Carga inicial. Ads: cada chamada avança o quanto o tempo permite; repita até
 * `detalhes.concluido` ser true. Instagram: uma chamada só (acervo + 30 dias).
 */
export function rodarCargaInicial(deps: DepsJob, opcoes: OpcoesCargaInicial = {}): Promise<ResultadoHttp> {
  if (opcoes.escopo === "instagram") {
    return executarComoHttp(deps, "ig_carga_inicial", {}, async (cliente) => {
      const r = await sincronizarInstagramDiario(cliente, deps.armazem, {
        data: deps.data, todasMidias: true, diasConta: opcoes.dias ?? 30,
      });
      return {
        registros: r.registros,
        parcial: r.parcial,
        detalhes: { concluido: true, ...(r.detalhes as unknown as Record<string, unknown>) },
      };
    });
  }
  return executarComoHttp(deps, "ads_carga_inicial", {}, async (cliente) => {
    const estado = await deps.armazem.lerEstado("ads_historico");
    // A estrutura vem primeiro: os insights apontam para anúncios que precisam existir.
    const estrutura = !estado || opcoes.reiniciar ? await sincronizarEstruturaAds(cliente, deps.armazem) : null;
    const r = await carregarHistorico(cliente, deps.armazem, {
      data: deps.data, agora: deps.agora, dormir: deps.dormir,
      meses: opcoes.meses, reiniciar: opcoes.reiniciar, orcamentoMs: ORCAMENTO_MS,
    });
    return {
      registros: r.registros,
      parcial: !r.concluido,
      detalhes: {
        concluido: r.concluido,
        janelasConcluidas: r.janelasConcluidas,
        proximoAte: r.proximoAte,
        ...(estrutura ? { estrutura } : {}),
      },
    };
  });
}
