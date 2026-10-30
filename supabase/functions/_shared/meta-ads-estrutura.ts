// Meta Ads — estrutura: conta, campanhas, conjuntos e anúncios.
//
// Tudo é upsert por ID da Meta, então rodar duas vezes não duplica nada.
// Itens arquivados e excluídos entram de propósito (filtering por
// effective_status): o histórico de métricas aponta para anúncios que podem
// já ter sido arquivados.
import { exigirAtivo, type MetaGraphClient } from "./meta-graph.ts";
import type { Armazem, Linha } from "./meta-armazem.ts";

// --- campos pedidos à Graph API --------------------------------------------

export const CAMPOS_CAMPANHA =
  "id,name,status,effective_status,objective,buying_type,daily_budget,lifetime_budget," +
  "start_time,stop_time,created_time,updated_time";

export const CAMPOS_CONJUNTO =
  "id,campaign_id,name,status,effective_status,optimization_goal,billing_event,bid_strategy," +
  "daily_budget,lifetime_budget,budget_remaining,targeting,start_time,end_time," +
  "created_time,updated_time";

export const CAMPOS_ANUNCIO =
  "id,adset_id,campaign_id,name,status,effective_status,created_time,updated_time," +
  "creative{id,title,body,thumbnail_url,object_story_spec}";

// Sem o filtro a Meta devolve só o que não está arquivado/excluído.
const STATUS_CAMPANHA = ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED", "IN_PROCESS", "WITH_ISSUES"];
const STATUS_CONJUNTO = [...STATUS_CAMPANHA, "CAMPAIGN_PAUSED"];
const STATUS_ANUNCIO = [
  ...STATUS_CONJUNTO,
  "ADSET_PAUSED",
  "PENDING_REVIEW",
  "DISAPPROVED",
  "PREAPPROVED",
  "PENDING_BILLING_INFO",
];

export function filtroStatus(valores: string[]): string {
  return JSON.stringify([{ field: "effective_status", operator: "IN", value: valores }]);
}

// --- conversões ------------------------------------------------------------

/** "1500" → 1500; ausente, vazio ou inválido → null. Orçamentos vêm como string. */
export function inteiroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Normaliza datas da Meta ("2026-10-01T10:00:00-0300") para ISO UTC.
 * Valor ausente, inválido ou zerado vira null.
 */
export function dataIso(v: unknown): string | null {
  if (typeof v !== "string" || v === "") return null;
  const texto = v.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(texto);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1980) return null;
  return d.toISOString();
}

const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

// --- mapeadores (puros, testáveis) -----------------------------------------

export interface ContaMeta {
  id: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
  account_status?: number;
}

export function mapearConta(c: ContaMeta, agora = new Date()): Linha {
  return {
    id: c.id,
    nome: texto(c.name),
    moeda: texto(c.currency),
    fuso: texto(c.timezone_name),
    account_status: c.account_status ?? null,
    sincronizado_em: agora.toISOString(),
  };
}

export function mapearCampanha(c: Record<string, unknown>, contaId: string, agora = new Date()): Linha {
  return {
    id: c.id,
    conta_id: contaId,
    name: texto(c.name),
    status: texto(c.status),
    effective_status: texto(c.effective_status),
    objective: texto(c.objective),
    buying_type: texto(c.buying_type),
    daily_budget: inteiroOuNulo(c.daily_budget),
    lifetime_budget: inteiroOuNulo(c.lifetime_budget),
    start_time: dataIso(c.start_time),
    stop_time: dataIso(c.stop_time),
    created_time: dataIso(c.created_time),
    updated_time: dataIso(c.updated_time),
    sincronizado_em: agora.toISOString(),
  };
}

export function mapearConjunto(c: Record<string, unknown>, contaId: string, agora = new Date()): Linha {
  return {
    id: c.id,
    campaign_id: c.campaign_id,
    conta_id: contaId,
    name: texto(c.name),
    status: texto(c.status),
    effective_status: texto(c.effective_status),
    optimization_goal: texto(c.optimization_goal),
    billing_event: texto(c.billing_event),
    bid_strategy: texto(c.bid_strategy),
    daily_budget: inteiroOuNulo(c.daily_budget),
    lifetime_budget: inteiroOuNulo(c.lifetime_budget),
    budget_remaining: inteiroOuNulo(c.budget_remaining),
    targeting: c.targeting ?? null,
    start_time: dataIso(c.start_time),
    end_time: dataIso(c.end_time),
    created_time: dataIso(c.created_time),
    updated_time: dataIso(c.updated_time),
    sincronizado_em: agora.toISOString(),
  };
}

export function mapearAnuncio(a: Record<string, unknown>, contaId: string, agora = new Date()): Linha {
  const criativo = (a.creative ?? {}) as Record<string, unknown>;
  return {
    id: a.id,
    adset_id: a.adset_id,
    campaign_id: a.campaign_id,
    conta_id: contaId,
    name: texto(a.name),
    status: texto(a.status),
    effective_status: texto(a.effective_status),
    creative_id: texto(criativo.id),
    creative_title: texto(criativo.title),
    creative_body: texto(criativo.body),
    creative_thumbnail_url: texto(criativo.thumbnail_url),
    creative_object_story_spec: criativo.object_story_spec ?? null,
    created_time: dataIso(a.created_time),
    updated_time: dataIso(a.updated_time),
    sincronizado_em: agora.toISOString(),
  };
}

// --- sync ------------------------------------------------------------------

export interface ResumoEstrutura {
  conta: number;
  campanhas: number;
  conjuntos: number;
  anuncios: number;
}

/** Lê moeda e fuso da conta e grava em meta_conta_anuncios. */
export async function sincronizarConta(cliente: MetaGraphClient, armazem: Armazem): Promise<ContaMeta> {
  const contaId = exigirAtivo(cliente.config, "adAccountId");
  const conta = await cliente.get<ContaMeta>(contaId, {
    fields: "id,name,currency,timezone_name,account_status",
  });
  await armazem.upsert("meta_conta_anuncios", [mapearConta({ ...conta, id: contaId })], "id");
  return { ...conta, id: contaId };
}

async function sincronizarNivel(
  cliente: MetaGraphClient,
  armazem: Armazem,
  caminho: string,
  params: Record<string, string | number>,
  tabela: string,
  mapear: (item: Record<string, unknown>) => Linha,
): Promise<number> {
  let total = 0;
  // Grava página a página: uma execução interrompida deixa o que já chegou.
  for await (const pagina of cliente.paginar<Record<string, unknown>>(caminho, params)) {
    total += await armazem.upsert(tabela, pagina.map(mapear), "id");
  }
  return total;
}

/**
 * Sincroniza conta, campanhas, conjuntos e anúncios (incluindo arquivados e
 * excluídos). Ordem fixa — campanhas, conjuntos, anúncios — para que um erro no
 * meio nunca deixe filhos sem pai gravado.
 */
export async function sincronizarEstruturaAds(
  cliente: MetaGraphClient,
  armazem: Armazem,
): Promise<ResumoEstrutura> {
  const contaId = exigirAtivo(cliente.config, "adAccountId");
  await sincronizarConta(cliente, armazem);

  const campanhas = await sincronizarNivel(
    cliente, armazem, `${contaId}/campaigns`,
    { fields: CAMPOS_CAMPANHA, filtering: filtroStatus(STATUS_CAMPANHA), limit: 200 },
    "meta_campanhas", (c) => mapearCampanha(c, contaId),
  );
  const conjuntos = await sincronizarNivel(
    cliente, armazem, `${contaId}/adsets`,
    { fields: CAMPOS_CONJUNTO, filtering: filtroStatus(STATUS_CONJUNTO), limit: 200 },
    "meta_conjuntos", (c) => mapearConjunto(c, contaId),
  );
  // Limite menor: o criativo expandido (object_story_spec) deixa a resposta pesada.
  const anuncios = await sincronizarNivel(
    cliente, armazem, `${contaId}/ads`,
    { fields: CAMPOS_ANUNCIO, filtering: filtroStatus(STATUS_ANUNCIO), limit: 50 },
    "meta_anuncios", (a) => mapearAnuncio(a, contaId),
  );
  return { conta: 1, campanhas, conjuntos, anuncios };
}
