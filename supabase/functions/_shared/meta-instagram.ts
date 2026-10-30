// Instagram (API com Login do Facebook): conta, insights, demografia, mídias e stories.
//
// Regras da documentação atual da Meta que moldam este módulo:
//   - `impressions` foi descontinuada; a métrica nova é `views`.
//   - Quase todas as métricas de conta são period=day com metric_type=total_value:
//     um valor por consulta, então pedimos UM DIA por vez (since/until).
//     Só `reach` e `follower_count` aceitam time_series.
//   - O dado pode atrasar até 48 h: o diário reprocessa os últimos dias.
//   - Conta/mídia sem dado devolve lista vazia (não 0): sem linha, sem zero falso.
//   - Métricas variam por tipo de mídia (feed, reels, story) e algumas só
//     existem para certas contas (follower_demographics exige 100 seguidores).
//   - Story só tem insights por 24 h, e com menos de 5 espectadores a Meta
//     devolve erro 10: capturamos de hora em hora e toleramos esse erro.
//
// Métrica inválida ou indisponível NUNCA derruba o job: ela é pulada, anotada em
// `indisponiveis` e o resto segue. Só erro de token (190), rate limit longo e
// falha de banco interrompem a execução.
import { inteiroDe, numeroOuNulo } from "./meta-actions.ts";
import { dataIso } from "./meta-ads-estrutura.ts";
import { hojeNoFuso, somarDias } from "./meta-ads-insights.ts";
import type { Armazem, Linha } from "./meta-armazem.ts";
import {
  exigirAtivo,
  MetaApiError,
  MetaRateLimitError,
  MetaTokenInvalidoError,
  type MetaGraphClient,
} from "./meta-graph.ts";

export const FUSO_PADRAO = "America/Sao_Paulo";

// --- listas de métricas --------------------------------------------------------

/** Métricas de conta lidas como total_value, um dia por consulta. */
export const METRICAS_CONTA_TOTAL = [
  "reach",
  "views",
  "profile_views",
  "accounts_engaged",
  "total_interactions",
  "likes",
  "comments",
  "shares",
  "saves",
  "replies",
  "reposts",
  "profile_links_taps",
  "website_clicks",
] as const;

/** Lidas como time_series (period=day) numa consulta só para a janela inteira. */
export const METRICAS_CONTA_SERIE = ["follower_count"] as const;

export const BREAKDOWNS_DEMOGRAFIA = ["age", "gender", "city", "country"] as const;

export type TipoProduto = "FEED" | "REELS" | "STORY";

export const METRICAS_MIDIA: Record<TipoProduto, string[]> = {
  FEED: ["reach", "views", "saved", "shares", "likes", "comments", "total_interactions"],
  REELS: [
    "reach", "views", "saved", "shares", "likes", "comments", "total_interactions",
    "ig_reels_avg_watch_time", "ig_reels_video_view_total_time",
  ],
  STORY: ["reach", "views", "shares", "total_interactions", "replies", "follows", "profile_visits"],
};

export const CAMPOS_MIDIA =
  "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url";
// like_count / comments_count não existem em stories.
export const CAMPOS_STORY = "id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url";

// --- datas / fuso ----------------------------------------------------------------

function offsetMs(instante: Date, fuso: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instante);
  const n = (t: string) => Number(partes.find((p) => p.type === t)!.value);
  const comoUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

/** Unix timestamp (s) da meia-noite de `data` (YYYY-MM-DD) no fuso informado. */
export function epochInicioDia(data: string, fuso: string): number {
  const utcMeia = Date.parse(`${data}T00:00:00Z`);
  let t = utcMeia - offsetMs(new Date(utcMeia), fuso);
  t = utcMeia - offsetMs(new Date(t), fuso); // refina quando o fuso muda de offset no dia
  return Math.floor(t / 1000);
}

/** Dia civil (UTC) em que começou o período que terminou em `endTime` (period=day). */
export function diaDoPeriodo(endTime: string): string | null {
  const t = Date.parse(endTime.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  if (Number.isNaN(t)) return null;
  return new Date(t - 24 * 3_600_000).toISOString().slice(0, 10);
}

function intervaloDeDatas(desde: string, ate: string): string[] {
  const dias: string[] = [];
  for (let d = desde; d <= ate; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

// --- leitura das respostas de /insights --------------------------------------------

interface ItemInsight {
  name: string;
  values?: { value?: unknown; end_time?: string }[];
  total_value?: {
    value?: unknown;
    breakdowns?: { dimension_keys?: string[]; results?: { dimension_values?: string[]; value?: unknown }[] }[];
  };
}
interface RespostaInsights { data?: ItemInsight[] }

/** name → valor numérico, aceitando total_value e values[0] (mídia). Vazio não vira 0. */
export function valoresSimples(resp: RespostaInsights): Record<string, number> {
  const saida: Record<string, number> = {};
  for (const item of resp.data ?? []) {
    const n = numeroOuNulo(item.total_value?.value ?? item.values?.[0]?.value);
    if (n !== null) saida[item.name] = n;
  }
  return saida;
}

/** Resultados de um breakdown: [{ chave: "25-34", valor: 120 }]. */
export function resultadosBreakdown(resp: RespostaInsights): { chave: string; valor: number }[] {
  const saida: { chave: string; valor: number }[] = [];
  for (const item of resp.data ?? []) {
    for (const b of item.total_value?.breakdowns ?? []) {
      for (const r of b.results ?? []) {
        const valor = numeroOuNulo(r.value);
        const chave = (r.dimension_values ?? []).join("|");
        if (valor !== null && chave) saida.push({ chave, valor });
      }
    }
  }
  return saida;
}

/**
 * Erro de métrica/dado indisponível: segue o job. Token inválido e rate limit
 * longo são relançados; erro transitório que esgotou as tentativas também.
 */
function indisponivel(e: unknown): MetaApiError | null {
  if (e instanceof MetaTokenInvalidoError || e instanceof MetaRateLimitError) throw e;
  if (e instanceof MetaApiError && !e.transitorio) return e;
  throw e;
}

// --- descoberta e conta ------------------------------------------------------------

/** ID do Instagram vinculado à Página (GET /{page_id}?fields=instagram_business_account). */
export async function descobrirInstagram(cliente: MetaGraphClient): Promise<string> {
  const pageId = exigirAtivo(cliente.config, "pageId");
  const r = await cliente.get<{ instagram_business_account?: { id: string } }>(pageId, {
    fields: "instagram_business_account",
  });
  const id = r.instagram_business_account?.id;
  if (!id) throw new Error("A Página não tem conta do Instagram vinculada (instagram_business_account).");
  return id;
}

export async function snapshotConta(
  cliente: MetaGraphClient,
  armazem: Armazem,
  igId: string,
  hoje: string,
  agora = new Date(),
): Promise<number> {
  const c = await cliente.get<Record<string, unknown>>(igId, {
    fields: "username,followers_count,follows_count,media_count",
  });
  return armazem.upsert(
    "ig_conta_diaria",
    [{
      ig_user_id: igId,
      data: hoje,
      username: typeof c.username === "string" ? c.username : null,
      followers_count: inteiroDe(c.followers_count),
      follows_count: inteiroDe(c.follows_count),
      media_count: inteiroDe(c.media_count),
      capturado_em: agora.toISOString(),
    }],
    "ig_user_id,data",
  );
}

// --- insights da conta --------------------------------------------------------------

export async function sincronizarInsightsConta(
  cliente: MetaGraphClient,
  armazem: Armazem,
  igId: string,
  janela: { desde: string; ate: string; fuso: string },
  indisponiveis: Set<string>,
  agora = new Date(),
): Promise<number> {
  const dias = intervaloDeDatas(janela.desde, janela.ate);
  let registros = 0;

  for (const metrica of METRICAS_CONTA_TOTAL) {
    const linhas: Linha[] = [];
    for (const dia of dias) {
      if (indisponiveis.has(metrica)) break;
      try {
        const r = await cliente.get<RespostaInsights>(`${igId}/insights`, {
          metric: metrica,
          metric_type: "total_value",
          period: "day",
          since: epochInicioDia(dia, janela.fuso),
          until: epochInicioDia(somarDias(dia, 1), janela.fuso) - 1,
        });
        const valor = valoresSimples(r)[metrica];
        if (valor !== undefined) {
          linhas.push({ ig_user_id: igId, data: dia, metrica, valor, atualizado_em: agora.toISOString() });
        }
      } catch (e) {
        indisponivel(e);
        indisponiveis.add(metrica);
      }
    }
    if (linhas.length) registros += await armazem.upsert("ig_insights_conta_diario", linhas, "ig_user_id,data,metrica");
  }

  for (const metrica of METRICAS_CONTA_SERIE) {
    if (indisponiveis.has(metrica)) continue;
    try {
      const r = await cliente.get<RespostaInsights>(`${igId}/insights`, {
        metric: metrica,
        period: "day",
        since: epochInicioDia(janela.desde, janela.fuso),
        until: epochInicioDia(somarDias(janela.ate, 1), janela.fuso) - 1,
      });
      const linhas: Linha[] = [];
      for (const item of r.data ?? []) {
        for (const v of item.values ?? []) {
          const valor = numeroOuNulo(v.value);
          const dia = v.end_time ? diaDoPeriodo(v.end_time) : null;
          if (valor !== null && dia && dia >= janela.desde && dia <= janela.ate) {
            linhas.push({ ig_user_id: igId, data: dia, metrica, valor, atualizado_em: agora.toISOString() });
          }
        }
      }
      if (linhas.length) registros += await armazem.upsert("ig_insights_conta_diario", linhas, "ig_user_id,data,metrica");
    } catch (e) {
      indisponivel(e);
      indisponiveis.add(metrica);
    }
  }
  return registros;
}

// --- demografia -----------------------------------------------------------------------

export async function sincronizarDemografia(
  cliente: MetaGraphClient,
  armazem: Armazem,
  igId: string,
  hoje: string,
  indisponiveis: Set<string>,
): Promise<number> {
  let registros = 0;
  for (const breakdown of BREAKDOWNS_DEMOGRAFIA) {
    const chaveIndisp = `follower_demographics:${breakdown}`;
    if (indisponiveis.has(chaveIndisp)) continue;
    try {
      const r = await cliente.get<RespostaInsights>(`${igId}/insights`, {
        metric: "follower_demographics",
        metric_type: "total_value",
        period: "lifetime",
        timeframe: "this_month",
        breakdown,
      });
      const linhas = resultadosBreakdown(r).map((x) => ({
        ig_user_id: igId, data: hoje, tipo: breakdown, chave: x.chave, valor: Math.trunc(x.valor),
      }));
      if (linhas.length) registros += await armazem.upsert("ig_demografia", linhas, "ig_user_id,data,tipo,chave");
    } catch (e) {
      indisponivel(e); // ex.: conta com menos de 100 seguidores
      indisponiveis.add(chaveIndisp);
    }
  }
  return registros;
}

// --- mídias ---------------------------------------------------------------------------

export function mapearMidia(item: Record<string, unknown>, igId: string, agora = new Date()): Linha {
  const texto = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
  return {
    id: item.id,
    ig_user_id: igId,
    caption: texto(item.caption),
    media_type: texto(item.media_type),
    media_product_type: texto(item.media_product_type),
    permalink: texto(item.permalink),
    timestamp: dataIso(item.timestamp),
    like_count: inteiroDe(item.like_count),
    comments_count: inteiroDe(item.comments_count),
    thumbnail_url: texto(item.thumbnail_url),
    sincronizado_em: agora.toISOString(),
  };
}

/** FEED, REELS ou STORY; tipos sem métricas conhecidas (ex.: AD) viram null. */
export function tipoDeProduto(item: Record<string, unknown>): TipoProduto | null {
  const t = item.media_product_type;
  return t === "FEED" || t === "REELS" || t === "STORY" ? t : null;
}

/** Códigos da Meta para "poucos espectadores" no story. */
const CODIGO_POUCOS_ESPECTADORES = 10;

/**
 * Insights de uma mídia. Tenta todas as métricas de uma vez; se a Meta recusar
 * alguma (métrica inválida para o tipo), refaz uma a uma e guarda no cache o que
 * não existe, para não repetir a falha nas outras mídias do mesmo tipo.
 */
export async function insightsDaMidia(
  cliente: MetaGraphClient,
  midiaId: string,
  tipo: TipoProduto,
  indisponiveis: Set<string>,
): Promise<Record<string, number>> {
  const metricas = METRICAS_MIDIA[tipo].filter((m) => !indisponiveis.has(`${tipo}:${m}`));
  if (metricas.length === 0) return {};
  try {
    const r = await cliente.get<RespostaInsights>(`${midiaId}/insights`, { metric: metricas.join(",") });
    return valoresSimples(r);
  } catch (e) {
    const erro = indisponivel(e)!;
    if (erro.code === CODIGO_POUCOS_ESPECTADORES) return {}; // tenta de novo na próxima execução
  }
  const valores: Record<string, number> = {};
  for (const metrica of metricas) {
    try {
      const r = await cliente.get<RespostaInsights>(`${midiaId}/insights`, { metric: metrica });
      Object.assign(valores, valoresSimples(r));
    } catch (e) {
      const erro = indisponivel(e)!;
      if (erro.code === CODIGO_POUCOS_ESPECTADORES) break;
      indisponiveis.add(`${tipo}:${metrica}`);
    }
  }
  return valores;
}

/** Navegação do story (avançar, voltar, sair…): breakdown próprio. */
async function navegacaoDoStory(cliente: MetaGraphClient, midiaId: string): Promise<Record<string, number>> {
  try {
    const r = await cliente.get<RespostaInsights>(`${midiaId}/insights`, {
      metric: "navigation",
      breakdown: "story_navigation_action_type",
    });
    return Object.fromEntries(resultadosBreakdown(r).map((x) => [`navigation.${x.chave}`, x.valor]));
  } catch (e) {
    indisponivel(e);
    return {};
  }
}

async function gravarInsightsDaMidia(
  armazem: Armazem,
  midiaId: string,
  valores: Record<string, number>,
  agora: Date,
): Promise<number> {
  const linhas = Object.entries(valores).map(([metrica, valor]) => ({
    midia_id: midiaId, metrica, valor, capturado_em: agora.toISOString(),
  }));
  return linhas.length ? armazem.upsert("ig_midia_insights", linhas, "midia_id,metrica") : 0;
}

export interface OpcoesMidias {
  /** Posts mais novos que isso (dias) têm insights atualizados. Padrão 30. */
  diasInsights?: number;
  /** true na carga inicial: grava TODAS as mídias, não só as recentes. */
  todas?: boolean;
  agora?: Date;
}

export async function sincronizarMidias(
  cliente: MetaGraphClient,
  armazem: Armazem,
  igId: string,
  indisponiveis: Set<string>,
  opcoes: OpcoesMidias = {},
): Promise<{ midias: number; insights: number }> {
  const agora = opcoes.agora ?? new Date();
  const corte = agora.getTime() - (opcoes.diasInsights ?? 30) * 86_400_000;
  let midias = 0;
  let insights = 0;

  paginas: for await (const pagina of cliente.paginar<Record<string, unknown>>(`${igId}/media`, {
    fields: CAMPOS_MIDIA,
    limit: 50,
  })) {
    const dessaPagina: Record<string, unknown>[] = [];
    for (const item of pagina) {
      const quando = Date.parse(String(dataIso(item.timestamp)));
      // A lista vem do mais novo para o mais antigo: passou do corte, acabou.
      if (!opcoes.todas && !Number.isNaN(quando) && quando < corte) {
        midias += await gravarMidias(armazem, igId, dessaPagina, agora);
        insights += await insightsDasMidias(cliente, armazem, dessaPagina, indisponiveis, agora);
        break paginas;
      }
      dessaPagina.push(item);
    }
    midias += await gravarMidias(armazem, igId, dessaPagina, agora);
    // Insights só do que está na janela (na carga inicial, apenas dos recentes também).
    const recentes = dessaPagina.filter((i) => Date.parse(String(dataIso(i.timestamp))) >= corte);
    insights += await insightsDasMidias(cliente, armazem, recentes, indisponiveis, agora);
  }
  return { midias, insights };
}

async function gravarMidias(armazem: Armazem, igId: string, itens: Record<string, unknown>[], agora: Date) {
  return itens.length ? armazem.upsert("ig_midias", itens.map((i) => mapearMidia(i, igId, agora)), "id") : 0;
}

async function insightsDasMidias(
  cliente: MetaGraphClient,
  armazem: Armazem,
  itens: Record<string, unknown>[],
  indisponiveis: Set<string>,
  agora: Date,
): Promise<number> {
  let total = 0;
  for (const item of itens) {
    const tipo = tipoDeProduto(item);
    if (!tipo || typeof item.id !== "string") continue;
    const valores = await insightsDaMidia(cliente, item.id, tipo, indisponiveis);
    total += await gravarInsightsDaMidia(armazem, item.id, valores, agora);
  }
  return total;
}

// --- jobs --------------------------------------------------------------------------------

export interface OpcoesInstagram {
  data?: Date;
  fuso?: string;
  /** Dias fechados de insights de conta a reprocessar (a Meta atrasa até 48 h). Padrão 3. */
  diasConta?: number;
  diasMidias?: number;
  todasMidias?: boolean;
}

export interface SaidaInstagram {
  registros: number;
  parcial: boolean;
  detalhes: {
    igUserId: string;
    indisponiveis: string[];
    erros: { etapa: string; mensagem: string; codigo: number | null }[];
    contagens: Record<string, number>;
  };
}

/**
 * Sync diário: snapshot da conta, insights dos últimos dias, demografia e mídias
 * dos últimos 30 dias. Cada etapa é independente: erro de dado/métrica em uma
 * não impede as outras (o job termina como "parcial").
 */
export async function sincronizarInstagramDiario(
  cliente: MetaGraphClient,
  armazem: Armazem,
  opcoes: OpcoesInstagram = {},
): Promise<SaidaInstagram> {
  const igId = await descobrirInstagram(cliente);
  const data = opcoes.data ?? new Date();
  const fuso = opcoes.fuso ?? FUSO_PADRAO;
  const hoje = hojeNoFuso(fuso, data);
  const indisponiveis = new Set<string>();
  const erros: SaidaInstagram["detalhes"]["erros"] = [];
  const contagens: Record<string, number> = {};

  const etapa = async (nome: string, fn: () => Promise<number>) => {
    try {
      contagens[nome] = await fn();
    } catch (e) {
      if (e instanceof MetaApiError && !e.transitorio && !(e instanceof MetaTokenInvalidoError)) {
        erros.push({ etapa: nome, mensagem: e.message, codigo: e.code });
        return;
      }
      throw e;
    }
  };

  await etapa("conta", () => snapshotConta(cliente, armazem, igId, hoje, data));
  await etapa("insights_conta", () =>
    sincronizarInsightsConta(
      cliente, armazem, igId,
      { desde: somarDias(hoje, -(opcoes.diasConta ?? 3)), ate: somarDias(hoje, -1), fuso },
      indisponiveis, data,
    ));
  await etapa("demografia", () => sincronizarDemografia(cliente, armazem, igId, hoje, indisponiveis));
  await etapa("midias", async () => {
    const r = await sincronizarMidias(cliente, armazem, igId, indisponiveis, {
      diasInsights: opcoes.diasMidias, todas: opcoes.todasMidias, agora: data,
    });
    contagens.insights_midias = r.insights;
    return r.midias;
  });

  return {
    registros: Object.values(contagens).reduce((a, b) => a + b, 0),
    parcial: erros.length > 0,
    detalhes: { igUserId: igId, indisponiveis: [...indisponiveis].sort(), erros, contagens },
  };
}

/**
 * Sync horário de stories: só ficam disponíveis por 24 h. Cada execução grava a
 * mídia e a captura mais recente das métricas; a última antes de expirar vale.
 */
export async function sincronizarStories(
  cliente: MetaGraphClient,
  armazem: Armazem,
  opcoes: { data?: Date } = {},
): Promise<{ registros: number; stories: number; detalhes: { igUserId: string; indisponiveis: string[] } }> {
  const igId = await descobrirInstagram(cliente);
  const agora = opcoes.data ?? new Date();
  const indisponiveis = new Set<string>();
  const stories = await cliente.listarTudo<Record<string, unknown>>(`${igId}/stories`, { fields: CAMPOS_STORY });

  let registros = await gravarMidias(armazem, igId, stories, agora);
  for (const s of stories) {
    if (typeof s.id !== "string") continue;
    const valores = {
      ...(await insightsDaMidia(cliente, s.id, "STORY", indisponiveis)),
      ...(await navegacaoDoStory(cliente, s.id)),
    };
    registros += await gravarInsightsDaMidia(armazem, s.id, valores, agora);
  }
  return { registros, stories: stories.length, detalhes: { igUserId: igId, indisponiveis: [...indisponiveis].sort() } };
}
