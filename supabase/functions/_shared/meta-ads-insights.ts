// Meta Ads — métricas (/insights, level=ad, diário) e breakdowns.
//
// Tudo passa por relatórios ASSÍNCRONOS (POST /insights → polling do
// report_run_id → leitura paginada do resultado): é o caminho que a Meta
// recomenda para períodos longos e ele não estoura o tempo da Edge Function,
// porque o relatório roda do lado da Meta.
//
// Como a execução pode acabar antes do relatório, o estado (janela e IDs dos
// relatórios já pedidos) é gravado em meta_sync_estado: a próxima chamada
// retoma de onde parou em vez de pedir tudo de novo.
//
// Dois modos de uso:
//   - sincronizarIncremental: reprocessa os últimos 28 dias (a atribuição da
//     Meta altera métricas retroativamente), todo dia;
//   - carregarHistorico: carga inicial de 37 meses (limite da Meta), mês a mês,
//     do mais recente para o mais antigo, retomável.
import {
  extrairPrincipais,
  inteiroDe,
  numeroOuNulo,
  totalDeVideo,
} from "./meta-actions.ts";
import type { Armazem, Linha } from "./meta-armazem.ts";
import { sincronizarConta } from "./meta-ads-estrutura.ts";
import { exigirAtivo, MetaApiError, type MetaGraphClient } from "./meta-graph.ts";

// --- campos ------------------------------------------------------------------

export const CAMPOS_INSIGHTS = [
  "ad_id", "adset_id", "campaign_id", "date_start", "date_stop",
  "spend", "impressions", "reach", "frequency", "clicks", "unique_clicks",
  "ctr", "cpc", "cpm", "inline_link_clicks",
  "actions", "action_values", "cost_per_action_type",
  "video_p25_watched_actions", "video_p50_watched_actions",
  "video_p75_watched_actions", "video_p100_watched_actions",
  "conversions",
].join(",");

/** Breakdowns aceitam menos métricas; pedimos só as que guardamos. */
export const CAMPOS_BREAKDOWN =
  "ad_id,adset_id,campaign_id,date_start,spend,impressions,reach,clicks,inline_link_clicks,actions";

export type TipoRelatorio = "principal" | "idade_genero" | "plataforma_posicao" | "regiao";

export const TIPOS_BREAKDOWN: Exclude<TipoRelatorio, "principal">[] = [
  "idade_genero",
  "plataforma_posicao",
  "regiao",
];

const BREAKDOWN_DA_META: Record<Exclude<TipoRelatorio, "principal">, string> = {
  idade_genero: "age,gender",
  plataforma_posicao: "publisher_platform,platform_position",
  regiao: "region",
};

const DIMENSOES: Record<Exclude<TipoRelatorio, "principal">, [string, string | null]> = {
  idade_genero: ["age", "gender"],
  plataforma_posicao: ["publisher_platform", "platform_position"],
  regiao: ["region", null],
};

/** Limite de histórico do /insights da Meta. */
export const MESES_HISTORICO = 37;
export const DIAS_REPROCESSO = 28;

// --- datas (strings YYYY-MM-DD, sempre em UTC para não depender do servidor) --

const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function somarDias(data: string, dias: number): string {
  const d = toDate(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return fmt(d);
}

/** Soma meses preservando o dia quando possível (31/mar − 1 mês = 28/fev). */
export function somarMeses(data: string, meses: number): string {
  const d = toDate(data);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return fmt(d);
}

export const inicioDoMes = (data: string) => `${data.slice(0, 7)}-01`;

/** "Hoje" no fuso da conta de anúncios (as datas do /insights seguem esse fuso). */
export function hojeNoFuso(fuso: string | null | undefined, agora: Date): string {
  try {
    // en-CA formata como YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", { timeZone: fuso || "UTC" }).format(agora);
  } catch {
    return fmt(agora);
  }
}

/** Dia mais antigo que a Meta aceita: 37 meses atrás, mais um dia de folga. */
export function limiteHistorico(hoje: string, meses = MESES_HISTORICO): string {
  return somarDias(somarMeses(hoje, -meses), 1);
}

// --- mapeamento --------------------------------------------------------------

export function mapearInsight(
  item: Record<string, unknown>,
  contaId: string,
  moeda: string | null,
  agora = new Date(),
): Linha | null {
  const data = typeof item.date_start === "string" ? item.date_start : null;
  if (!item.ad_id || !data) return null;
  const principais = extrairPrincipais(item.actions, item.action_values);
  return {
    ad_id: item.ad_id,
    data,
    adset_id: item.adset_id ?? null,
    campaign_id: item.campaign_id ?? null,
    conta_id: contaId,
    moeda,
    spend: numeroOuNulo(item.spend),
    impressions: inteiroDe(item.impressions),
    reach: inteiroDe(item.reach),
    frequency: numeroOuNulo(item.frequency),
    clicks: inteiroDe(item.clicks),
    unique_clicks: inteiroDe(item.unique_clicks),
    ctr: numeroOuNulo(item.ctr),
    cpc: numeroOuNulo(item.cpc),
    cpm: numeroOuNulo(item.cpm),
    inline_link_clicks: inteiroDe(item.inline_link_clicks),
    video_p25: totalDeVideo(item.video_p25_watched_actions),
    video_p50: totalDeVideo(item.video_p50_watched_actions),
    video_p75: totalDeVideo(item.video_p75_watched_actions),
    video_p100: totalDeVideo(item.video_p100_watched_actions),
    leads: principais.leads,
    mensagens_iniciadas: principais.mensagens_iniciadas,
    cliques_link: principais.cliques_link,
    compras: principais.compras,
    valor_compras: principais.valor_compras,
    reservas: principais.reservas,
    actions: item.actions ?? null,
    action_values: item.action_values ?? null,
    cost_per_action_type: item.cost_per_action_type ?? null,
    conversions: item.conversions ?? null,
    sincronizado_em: agora.toISOString(),
  };
}

export function mapearBreakdown(
  item: Record<string, unknown>,
  tipo: Exclude<TipoRelatorio, "principal">,
  contaId: string,
  agora = new Date(),
): Linha | null {
  const data = typeof item.date_start === "string" ? item.date_start : null;
  if (!item.ad_id || !data) return null;
  const [d1, d2] = DIMENSOES[tipo];
  const principais = extrairPrincipais(item.actions, null);
  return {
    ad_id: item.ad_id,
    data,
    tipo,
    dim1: String(item[d1] ?? ""),
    dim2: d2 ? String(item[d2] ?? "") : "",
    adset_id: item.adset_id ?? null,
    campaign_id: item.campaign_id ?? null,
    conta_id: contaId,
    spend: numeroOuNulo(item.spend),
    impressions: inteiroDe(item.impressions),
    reach: inteiroDe(item.reach),
    clicks: inteiroDe(item.clicks),
    inline_link_clicks: inteiroDe(item.inline_link_clicks),
    leads: principais.leads,
    mensagens_iniciadas: principais.mensagens_iniciadas,
    actions: item.actions ?? null,
    sincronizado_em: agora.toISOString(),
  };
}

// --- relatório assíncrono de uma janela --------------------------------------

export interface EstadoJanela {
  since: string;
  until: string;
  /** IDs dos relatórios já pedidos à Meta, por tipo. */
  relatorios: Partial<Record<TipoRelatorio, string>>;
  /** Tipos já lidos e gravados. */
  concluidos: TipoRelatorio[];
  /** Quantas vezes um relatório teve de ser pedido de novo (trava contra loop). */
  recriacoes?: number;
}

export interface ContaInsights {
  id: string;
  moeda: string | null;
  fuso: string | null;
}

export interface OpcoesProcessamento {
  /** Tipos a baixar na janela. Padrão: principal + os três breakdowns. */
  tipos?: TipoRelatorio[];
  /** Tempo máximo desta chamada, em ms. */
  orcamentoMs: number;
  /** Relógio em ms (injetável nos testes). */
  agora?: () => number;
  dormir?: (ms: number) => Promise<void>;
  intervaloPollMs?: number;
  /** Chamado a cada mudança de estado para o chamador persistir. */
  persistir: (estado: EstadoJanela) => Promise<void>;
}

const STATUS_FALHA = new Set(["Job Failed", "Job Skipped"]);
const MAX_RECRIACOES = 3;
export const TIPOS_PADRAO: TipoRelatorio[] = ["principal", ...TIPOS_BREAKDOWN];

export function paramsDoRelatorio(tipo: TipoRelatorio, since: string, until: string) {
  return {
    level: "ad",
    time_increment: 1,
    time_range: JSON.stringify({ since, until }),
    fields: tipo === "principal" ? CAMPOS_INSIGHTS : CAMPOS_BREAKDOWN,
    limit: 500,
    ...(tipo === "principal" ? {} : { breakdowns: BREAKDOWN_DA_META[tipo] }),
  };
}

async function lerResultado(
  cliente: MetaGraphClient,
  armazem: Armazem,
  reportRunId: string,
  tipo: TipoRelatorio,
  conta: ContaInsights,
): Promise<number> {
  let gravadas = 0;
  const agora = new Date();
  for await (const pagina of cliente.paginar<Record<string, unknown>>(`${reportRunId}/insights`, { limit: 500 })) {
    const linhas = pagina
      .map((i) =>
        tipo === "principal"
          ? mapearInsight(i, conta.id, conta.moeda, agora)
          : mapearBreakdown(i, tipo, conta.id, agora)
      )
      .filter((l): l is Linha => l !== null);
    if (linhas.length === 0) continue;
    gravadas += await armazem.upsert(
      tipo === "principal" ? "meta_insights_diarios" : "meta_insights_breakdowns",
      linhas,
      tipo === "principal" ? "ad_id,data" : "ad_id,data,tipo,dim1,dim2",
    );
  }
  return gravadas;
}

/**
 * Baixa uma janela de datas: pede os relatórios, espera até o orçamento de
 * tempo acabar e grava os que ficaram prontos. Idempotente e retomável.
 */
export async function processarJanela(
  cliente: MetaGraphClient,
  armazem: Armazem,
  conta: ContaInsights,
  estado: EstadoJanela,
  opcoes: OpcoesProcessamento,
): Promise<{ concluida: boolean; registros: number }> {
  const tipos = opcoes.tipos ?? TIPOS_PADRAO;
  const agora = opcoes.agora ?? Date.now;
  const dormir = opcoes.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const limite = agora() + opcoes.orcamentoMs;
  let intervalo = opcoes.intervaloPollMs ?? 3_000;
  let registros = 0;
  estado.recriacoes ??= 0;

  while (true) {
    // 1) Pede os relatórios que faltam (todos de uma vez: rodam em paralelo na Meta).
    for (const tipo of tipos) {
      if (estado.concluidos.includes(tipo) || estado.relatorios[tipo]) continue;
      const r = await cliente.post<{ report_run_id?: string }>(
        `${conta.id}/insights`,
        paramsDoRelatorio(tipo, estado.since, estado.until),
      );
      if (!r.report_run_id) throw new Error(`Meta não devolveu report_run_id (${tipo})`);
      estado.relatorios[tipo] = r.report_run_id;
      await opcoes.persistir(estado);
    }

    // 2) Confere cada relatório pendente.
    for (const tipo of tipos) {
      if (estado.concluidos.includes(tipo)) continue;
      const id = estado.relatorios[tipo]!;
      let status: { async_status?: string; async_percent_completion?: number };
      try {
        status = await cliente.get(id, { fields: "async_status,async_percent_completion" });
      } catch (e) {
        // Relatório que a Meta não conhece mais: pede de novo (com trava).
        if (e instanceof MetaApiError && !e.transitorio && e.code !== 190) {
          if (++estado.recriacoes! > MAX_RECRIACOES) throw e;
          delete estado.relatorios[tipo];
          await opcoes.persistir(estado);
          continue;
        }
        throw e;
      }
      if (status.async_status && STATUS_FALHA.has(status.async_status)) {
        delete estado.relatorios[tipo];
        await opcoes.persistir(estado);
        if (++estado.recriacoes! > MAX_RECRIACOES) {
          throw new Error(`Relatório ${tipo} (${estado.since}..${estado.until}) falhou na Meta: ${status.async_status}`);
        }
        continue;
      }
      if (status.async_status === "Job Completed") {
        registros += await lerResultado(cliente, armazem, id, tipo, conta);
        estado.concluidos.push(tipo);
        delete estado.relatorios[tipo];
        await opcoes.persistir(estado);
      }
    }

    if (tipos.every((t) => estado.concluidos.includes(t))) return { concluida: true, registros };
    if (agora() + intervalo >= limite) return { concluida: false, registros };
    await dormir(intervalo);
    intervalo = Math.min(intervalo * 2, 15_000);
  }
}

// --- incremental -------------------------------------------------------------

export interface OpcoesSync {
  orcamentoMs?: number;
  agora?: () => number;
  dormir?: (ms: number) => Promise<void>;
  intervaloPollMs?: number;
  tipos?: TipoRelatorio[];
  /** Relógio de calendário (injetável nos testes). */
  data?: Date;
}

export interface ResultadoSync {
  registros: number;
  /** false quando o tempo acabou antes de a Meta terminar: a próxima chamada retoma. */
  concluido: boolean;
  janela?: { since: string; until: string };
  detalhes: Record<string, unknown>;
}

const CHAVE_INCREMENTAL = "ads_incremental";
const CHAVE_HISTORICO = "ads_historico";
const VALIDADE_RETOMADA_MS = 6 * 3_600_000;

function contaDe(c: { id: string; currency?: string; timezone_name?: string }): ContaInsights {
  return { id: c.id, moeda: c.currency ?? null, fuso: c.timezone_name ?? null };
}

/** Reprocessa os últimos `dias` dias (padrão 28), retomando uma execução interrompida. */
export async function sincronizarIncremental(
  cliente: MetaGraphClient,
  armazem: Armazem,
  opcoes: OpcoesSync & { dias?: number } = {},
): Promise<ResultadoSync> {
  exigirAtivo(cliente.config, "adAccountId");
  const conta = contaDe(await sincronizarConta(cliente, armazem));
  const data = opcoes.data ?? new Date();
  const hoje = hojeNoFuso(conta.fuso, data);
  const since = somarDias(hoje, -((opcoes.dias ?? DIAS_REPROCESSO) - 1));

  const salvo = await armazem.lerEstado(CHAVE_INCREMENTAL);
  const retomavel =
    salvo &&
    salvo.concluida === false &&
    typeof salvo.iniciadoEm === "number" &&
    data.getTime() - (salvo.iniciadoEm as number) < VALIDADE_RETOMADA_MS &&
    (salvo.janela as EstadoJanela | undefined)?.until === hoje;
  const janela: EstadoJanela = retomavel
    ? (salvo!.janela as EstadoJanela)
    : { since, until: hoje, relatorios: {}, concluidos: [] };
  const iniciadoEm = retomavel ? (salvo!.iniciadoEm as number) : data.getTime();

  const persistir = (j: EstadoJanela, concluida = false) =>
    armazem.salvarEstado(CHAVE_INCREMENTAL, { janela: j, concluida, iniciadoEm });

  const r = await processarJanela(cliente, armazem, conta, janela, {
    tipos: opcoes.tipos,
    orcamentoMs: opcoes.orcamentoMs ?? 100_000,
    agora: opcoes.agora,
    dormir: opcoes.dormir,
    intervaloPollMs: opcoes.intervaloPollMs,
    persistir: (j) => persistir(j),
  });
  if (r.concluida) await persistir(janela, true);
  return {
    registros: r.registros,
    concluido: r.concluida,
    janela: { since: janela.since, until: janela.until },
    detalhes: { retomada: Boolean(retomavel), moeda: conta.moeda, fuso: conta.fuso },
  };
}

// --- carga inicial (37 meses) -------------------------------------------------

interface EstadoHistorico {
  /** Dia mais antigo aceito pela Meta. */
  limite: string;
  /** Fim da próxima janela (vai recuando até passar do limite). */
  proximoAte: string;
  janela: EstadoJanela | null;
  concluido: boolean;
  janelasConcluidas: number;
}

/** Janela mensal que termina em `ate`, sem passar de `limite`. */
export function proximaJanelaMensal(ate: string, limite: string): { since: string; until: string } {
  const inicio = inicioDoMes(ate);
  return { since: inicio < limite ? limite : inicio, until: ate };
}

/**
 * Carga inicial: do mês mais recente para o mais antigo, um mês por vez, até o
 * limite de 37 meses. Chame de novo enquanto `concluido` for false — cada
 * chamada continua de onde a anterior parou.
 */
export async function carregarHistorico(
  cliente: MetaGraphClient,
  armazem: Armazem,
  opcoes: OpcoesSync & { meses?: number; reiniciar?: boolean } = {},
): Promise<ResultadoSync & { janelasConcluidas: number; proximoAte: string | null }> {
  exigirAtivo(cliente.config, "adAccountId");
  const conta = contaDe(await sincronizarConta(cliente, armazem));
  const agora = opcoes.agora ?? Date.now;
  const inicio = agora();
  const orcamento = opcoes.orcamentoMs ?? 100_000;
  const hoje = hojeNoFuso(conta.fuso, opcoes.data ?? new Date());

  let estado = (opcoes.reiniciar ? null : await armazem.lerEstado(CHAVE_HISTORICO)) as EstadoHistorico | null;
  if (!estado) {
    estado = {
      limite: limiteHistorico(hoje, opcoes.meses ?? MESES_HISTORICO),
      proximoAte: hoje,
      janela: null,
      concluido: false,
      janelasConcluidas: 0,
    };
    await armazem.salvarEstado(CHAVE_HISTORICO, estado as unknown as Record<string, unknown>);
  }

  let registros = 0;
  while (!estado.concluido) {
    const restante = orcamento - (agora() - inicio);
    if (restante <= 0) break;

    if (!estado.janela) {
      const j = proximaJanelaMensal(estado.proximoAte, estado.limite);
      estado.janela = { ...j, relatorios: {}, concluidos: [] };
    }
    const estadoAtual = estado;
    const r = await processarJanela(cliente, armazem, conta, estadoAtual.janela!, {
      tipos: opcoes.tipos,
      orcamentoMs: restante,
      agora: opcoes.agora,
      dormir: opcoes.dormir,
      intervaloPollMs: opcoes.intervaloPollMs,
      persistir: (j) => {
        estadoAtual.janela = j;
        return armazem.salvarEstado(CHAVE_HISTORICO, estadoAtual as unknown as Record<string, unknown>);
      },
    });
    registros += r.registros;
    if (!r.concluida) break;

    estado.proximoAte = somarDias(estado.janela!.since, -1);
    estado.janela = null;
    estado.janelasConcluidas += 1;
    estado.concluido = estado.proximoAte < estado.limite;
    await armazem.salvarEstado(CHAVE_HISTORICO, estado as unknown as Record<string, unknown>);
  }

  return {
    registros,
    concluido: estado.concluido,
    janelasConcluidas: estado.janelasConcluidas,
    proximoAte: estado.concluido ? null : estado.proximoAte,
    janela: estado.janela ? { since: estado.janela.since, until: estado.janela.until } : undefined,
    detalhes: { limite: estado.limite, moeda: conta.moeda },
  };
}
