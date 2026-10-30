// Rodar: node --test "supabase/functions/_shared/meta-ads-estrutura.test.ts"
//
// Estrutura de Ads: conversões da Meta, sync por nível, idempotência e
// envelope de execução. Rede e banco são dublês em memória.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dataIso,
  filtroStatus,
  inteiroOuNulo,
  mapearAnuncio,
  mapearCampanha,
  mapearConjunto,
  sincronizarEstruturaAds,
} from "./meta-ads-estrutura.ts";
import { deduplicar, emLotes, type Armazem, type Linha, type ResultadoExecucao } from "./meta-armazem.ts";
import { GRAPH_VERSION, MetaGraphClient, MetaRateLimitError, MetaTokenInvalidoError } from "./meta-graph.ts";
import { executarJob } from "./meta-sync-run.ts";

// --- dublês ------------------------------------------------------------------

function armazemEmMemoria() {
  const tabelas = new Map<string, Map<string, Linha>>();
  const execucoes: { id: string; job: string; resultado?: ResultadoExecucao }[] = [];
  const armazem: Armazem = {
    async upsert(tabela, linhas, conflito) {
      const t = tabelas.get(tabela) ?? new Map<string, Linha>();
      tabelas.set(tabela, t);
      for (const l of deduplicar(linhas, conflito)) t.set(String(l[conflito]), { ...(t.get(String(l[conflito])) ?? {}), ...l });
      return linhas.length;
    },
    async iniciarExecucao(job) {
      const id = `exec-${execucoes.length + 1}`;
      execucoes.push({ id, job });
      return id;
    },
    async finalizarExecucao(id, resultado) {
      execucoes.find((e) => e.id === id)!.resultado = resultado;
    },
  };
  return { armazem, tabelas, execucoes };
}

const paginaMeta = (data: unknown[], next?: string) =>
  new Response(JSON.stringify({ data, ...(next ? { paging: { next } } : {}) }), { status: 200 });

function clienteComRota(rota: (u: URL) => Response) {
  const urls: URL[] = [];
  const cliente = new MetaGraphClient({
    config: { accessToken: "tok-de-teste-123456", appSecret: "secret-de-teste-123456", adAccountId: "act_1" },
    fetchImpl: (async (url: string) => {
      const u = new URL(String(url));
      urls.push(u);
      return rota(u);
    }) as typeof fetch,
    dormir: async () => {},
    log: () => {},
    random: () => 0,
  });
  return { cliente, urls };
}

const base = `https://graph.facebook.com/${GRAPH_VERSION}`;

function rotaCompleta(u: URL): Response {
  const caminho = u.pathname.replace(`/${GRAPH_VERSION}/`, "");
  if (caminho === "act_1") {
    return new Response(
      JSON.stringify({ id: "act_1", name: "VS - Moradas", currency: "BRL", timezone_name: "America/Sao_Paulo", account_status: 1 }),
    );
  }
  if (caminho === "act_1/campaigns") {
    if (!u.searchParams.get("after")) {
      return paginaMeta(
        [{ id: "c1", name: "Lotes", status: "ACTIVE", effective_status: "ACTIVE", objective: "OUTCOME_LEADS", buying_type: "AUCTION", daily_budget: "5000", created_time: "2026-09-01T10:00:00-0300" }],
        `${base}/act_1/campaigns?after=P2`,
      );
    }
    // Campanha arquivada vem na 2ª página, e c1 se repete (a Meta pode repetir).
    return paginaMeta([
      { id: "c1", name: "Lotes", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "5000" },
      { id: "c2", name: "Antiga", status: "PAUSED", effective_status: "ARCHIVED", lifetime_budget: "100000" },
    ]);
  }
  if (caminho === "act_1/adsets") {
    return paginaMeta([
      { id: "s1", campaign_id: "c1", name: "Público A", status: "ACTIVE", effective_status: "ACTIVE", optimization_goal: "LEAD_GENERATION", billing_event: "IMPRESSIONS", bid_strategy: "LOWEST_COST_WITHOUT_CAP", targeting: { geo_locations: { cities: [{ key: "1" }] } } },
    ]);
  }
  if (caminho === "act_1/ads") {
    return paginaMeta([
      { id: "a1", adset_id: "s1", campaign_id: "c1", name: "Vídeo 1", status: "ACTIVE", effective_status: "ACTIVE", creative: { id: "cr1", title: "Seu lote em Paraty", body: "Venha conhecer", thumbnail_url: "https://x/t.jpg", object_story_spec: { page_id: "P" } } },
      { id: "a2", adset_id: "s1", campaign_id: "c1", name: "Sem criativo", status: "PAUSED", effective_status: "ADSET_PAUSED" },
    ]);
  }
  return new Response(JSON.stringify({ error: { code: 100, message: `rota inesperada ${caminho}` } }), { status: 400 });
}

// --- conversões --------------------------------------------------------------

test("orçamentos da Meta (strings) viram inteiros; vazio e lixo viram null", () => {
  assert.equal(inteiroOuNulo("5000"), 5000);
  assert.equal(inteiroOuNulo(0), 0);
  assert.equal(inteiroOuNulo(""), null);
  assert.equal(inteiroOuNulo(undefined), null);
  assert.equal(inteiroOuNulo("abc"), null);
});

test("datas da Meta com offset sem dois-pontos viram ISO UTC", () => {
  assert.equal(dataIso("2026-10-01T10:00:00-0300"), "2026-10-01T13:00:00.000Z");
  assert.equal(dataIso("2026-10-01T10:00:00+0000"), "2026-10-01T10:00:00.000Z");
  assert.equal(dataIso(undefined), null);
  assert.equal(dataIso("nao-e-data"), null);
  assert.equal(dataIso("1970-01-01T00:00:00+0000"), null); // "sem data" da Meta
});

test("mapearCampanha / mapearConjunto / mapearAnuncio cobrem todos os campos pedidos", () => {
  const camp = mapearCampanha(
    { id: "c1", name: "N", status: "ACTIVE", effective_status: "ACTIVE", objective: "O", buying_type: "AUCTION", daily_budget: "100", lifetime_budget: "0", start_time: "2026-01-01T00:00:00+0000", stop_time: "2026-02-01T00:00:00+0000", created_time: "2026-01-01T00:00:00+0000", updated_time: "2026-01-02T00:00:00+0000" },
    "act_1",
  );
  assert.deepEqual(
    Object.keys(camp).sort(),
    ["buying_type", "conta_id", "created_time", "daily_budget", "effective_status", "id", "lifetime_budget", "name", "objective", "sincronizado_em", "start_time", "status", "stop_time", "updated_time"],
  );
  assert.equal(camp.lifetime_budget, 0);

  const conj = mapearConjunto({ id: "s1", campaign_id: "c1", targeting: { a: 1 }, budget_remaining: "50" }, "act_1");
  assert.deepEqual(conj.targeting, { a: 1 });
  assert.equal(conj.budget_remaining, 50);
  assert.equal(conj.campaign_id, "c1");

  const an = mapearAnuncio({ id: "a1", adset_id: "s1", campaign_id: "c1", creative: { id: "cr", object_story_spec: { x: 1 } } }, "act_1");
  assert.equal(an.creative_id, "cr");
  assert.deepEqual(an.creative_object_story_spec, { x: 1 });
  assert.equal(mapearAnuncio({ id: "a2", adset_id: "s", campaign_id: "c" }, "act_1").creative_id, null);
});

test("filtroStatus monta o JSON de filtering por effective_status", () => {
  const f = JSON.parse(filtroStatus(["ACTIVE", "ARCHIVED"]));
  assert.deepEqual(f, [{ field: "effective_status", operator: "IN", value: ["ACTIVE", "ARCHIVED"] }]);
});

test("deduplicar fica com a última ocorrência e emLotes respeita o tamanho", () => {
  const out = deduplicar([{ id: "1", v: 1 }, { id: "2", v: 2 }, { id: "1", v: 3 }], "id");
  assert.deepEqual(out, [{ id: "1", v: 3 }, { id: "2", v: 2 }]);
  assert.deepEqual(emLotes([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

// --- sync --------------------------------------------------------------------

test("sincroniza conta, campanhas (inclui arquivadas), conjuntos e anúncios", async () => {
  const { cliente, urls } = clienteComRota(rotaCompleta);
  const { armazem, tabelas } = armazemEmMemoria();

  const r = await sincronizarEstruturaAds(cliente, armazem);

  assert.equal(tabelas.get("meta_conta_anuncios")!.get("act_1")!.moeda, "BRL");
  assert.equal(tabelas.get("meta_conta_anuncios")!.get("act_1")!.fuso, "America/Sao_Paulo");
  assert.deepEqual([...tabelas.get("meta_campanhas")!.keys()].sort(), ["c1", "c2"]);
  assert.equal(tabelas.get("meta_campanhas")!.get("c2")!.effective_status, "ARCHIVED");
  assert.equal(tabelas.get("meta_campanhas")!.get("c1")!.daily_budget, 5000);
  assert.deepEqual(tabelas.get("meta_conjuntos")!.get("s1")!.targeting, { geo_locations: { cities: [{ key: "1" }] } });
  assert.equal(tabelas.get("meta_anuncios")!.get("a1")!.creative_title, "Seu lote em Paraty");
  assert.equal(tabelas.get("meta_anuncios")!.get("a2")!.creative_id, null);
  assert.deepEqual(r, { conta: 1, campanhas: 3, conjuntos: 1, anuncios: 2 });

  // Os três níveis pedem itens arquivados/excluídos pelo filtro de effective_status.
  for (const nivel of ["campaigns", "adsets", "ads"]) {
    const u = urls.find((x) => x.pathname.endsWith(`/act_1/${nivel}`))!;
    const filtro = JSON.parse(u.searchParams.get("filtering")!);
    assert.equal(filtro[0].field, "effective_status");
    assert.ok(filtro[0].value.includes("ARCHIVED") && filtro[0].value.includes("DELETED"), nivel);
  }
  // O criativo é expandido na consulta de anúncios.
  const ads = urls.find((x) => x.pathname.endsWith("/act_1/ads"))!;
  assert.match(ads.searchParams.get("fields")!, /creative\{id,title,body,thumbnail_url,object_story_spec\}/);
});

test("rodar duas vezes não duplica nada (idempotência)", async () => {
  const { cliente } = clienteComRota(rotaCompleta);
  const { armazem, tabelas } = armazemEmMemoria();
  await sincronizarEstruturaAds(cliente, armazem);
  const antes = Object.fromEntries([...tabelas].map(([t, m]) => [t, m.size]));
  await sincronizarEstruturaAds(cliente, armazem);
  const depois = Object.fromEntries([...tabelas].map(([t, m]) => [t, m.size]));
  assert.deepEqual(depois, antes);
  assert.deepEqual(antes, { meta_conta_anuncios: 1, meta_campanhas: 2, meta_conjuntos: 1, meta_anuncios: 2 });
});

test("sem META_AD_ACCOUNT_ID o sync recusa com mensagem clara", async () => {
  const cliente = new MetaGraphClient({
    config: { accessToken: "t", appSecret: "s" },
    fetchImpl: (async () => new Response("{}")) as typeof fetch,
    log: () => {},
  });
  await assert.rejects(() => sincronizarEstruturaAds(cliente, armazemEmMemoria().armazem), /META_AD_ACCOUNT_ID/);
});

// --- envelope de execução -----------------------------------------------------

test("executarJob registra início, fim, status e contagem", async () => {
  const { armazem, execucoes } = armazemEmMemoria();
  const r = await executarJob(armazem, "ads_estrutura", async () => ({ registros: 6, detalhes: { campanhas: 3 } }));
  assert.equal(r.ok, true);
  assert.equal(execucoes[0].job, "ads_estrutura");
  assert.deepEqual(execucoes[0].resultado, { status: "sucesso", registros: 6, detalhes: { campanhas: 3 } });

  const p = await executarJob(armazem, "ads_estrutura", async () => ({ registros: 1, parcial: true }));
  assert.equal(p.ok && p.status, "parcial");
});

test("executarJob com erro 190 grava o código, marca tokenInvalido e dispara o alerta", async () => {
  const { armazem, execucoes } = armazemEmMemoria();
  let alertas = 0;
  const r = await executarJob(
    armazem,
    "ads_estrutura",
    async () => {
      throw new MetaTokenInvalidoError("Session has expired", { status: 400, code: 190, subcode: 463, fbtraceId: "TR" });
    },
    { aoTokenInvalido: () => void alertas++ },
  );
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.tokenInvalido && r.codigoErro === 190);
  assert.equal(alertas, 1);
  assert.equal(execucoes[0].resultado!.status, "erro");
  assert.equal(execucoes[0].resultado!.codigoErro, 190);
  assert.equal(execucoes[0].resultado!.detalhes!.fbtraceId, "TR");
});

test("executarJob guarda retryAfterMs do rate limit e não derruba se o alerta falhar", async () => {
  const { armazem, execucoes } = armazemEmMemoria();
  await executarJob(armazem, "j", async () => {
    throw new MetaRateLimitError("limite", { status: 400, code: 80000 }, 900_000);
  });
  assert.equal(execucoes[0].resultado!.detalhes!.retryAfterMs, 900_000);

  const r = await executarJob(
    armazem,
    "j",
    async () => {
      throw new MetaTokenInvalidoError("x", { status: 400, code: 190 });
    },
    { aoTokenInvalido: () => { throw new Error("webhook fora do ar"); } },
  );
  assert.equal(r.ok, false); // devolve o relatório mesmo assim
});
