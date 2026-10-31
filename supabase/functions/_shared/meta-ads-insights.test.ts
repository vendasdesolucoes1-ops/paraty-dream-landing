// Rodar: node --test "supabase/functions/_shared/meta-ads-insights.test.ts"
//
// Métricas de Ads: janelas de data, relatórios assíncronos retomáveis,
// incremental de 28 dias e carga histórica de 37 meses. A Meta é simulada por
// um roteador de fetch com relatórios que demoram para ficar prontos.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  carregarHistorico,
  hojeNoFuso,
  limiteHistorico,
  mapearBreakdown,
  mapearInsight,
  paramsDoRelatorio,
  proximaJanelaMensal,
  sincronizarIncremental,
  somarDias,
  somarMeses,
} from "./meta-ads-insights.ts";
import { GRAPH_VERSION, MetaGraphClient } from "./meta-graph.ts";
import { armazemEmMemoria, contagens } from "./meta-teste-util.ts";

// --- datas -------------------------------------------------------------------

test("somarMeses preserva o dia e ajusta no fim do mês", () => {
  assert.equal(somarMeses("2026-03-31", -1), "2026-02-28");
  assert.equal(somarMeses("2026-10-30", -37), "2023-09-30");
  assert.equal(somarMeses("2026-01-15", -2), "2025-11-15");
  assert.equal(somarDias("2026-03-01", -1), "2026-02-28");
});

test("limite do histórico: 37 meses atrás, mais um dia de folga", () => {
  assert.equal(limiteHistorico("2026-10-30"), "2023-10-01");
});

test("hoje é calculado no fuso da conta, não no do servidor", () => {
  const agora = new Date("2026-10-30T02:00:00Z"); // 23h do dia 29 em São Paulo
  assert.equal(hojeNoFuso("America/Sao_Paulo", agora), "2026-10-29");
  assert.equal(hojeNoFuso("UTC", agora), "2026-10-30");
  assert.equal(hojeNoFuso("Fuso/Inexistente", agora), "2026-10-30");
});

test("janela mensal termina no dia pedido e não passa do limite", () => {
  assert.deepEqual(proximaJanelaMensal("2026-10-30", "2023-10-01"), { since: "2026-10-01", until: "2026-10-30" });
  assert.deepEqual(proximaJanelaMensal("2023-10-31", "2023-10-01"), { since: "2023-10-01", until: "2023-10-31" });
  assert.deepEqual(proximaJanelaMensal("2023-10-15", "2023-10-05"), { since: "2023-10-05", until: "2023-10-15" });
});

// --- mapeamento --------------------------------------------------------------

test("mapearInsight preenche colunas, JSON e vídeo; ignora linha sem anúncio ou data", () => {
  const l = mapearInsight(
    {
      ad_id: "a1", adset_id: "s1", campaign_id: "c1", date_start: "2026-10-01",
      spend: "123.45", impressions: "1000", reach: "800", frequency: "1.25", clicks: "50",
      unique_clicks: "45", ctr: "5.0", cpc: "2.469", cpm: "123.45", inline_link_clicks: "40",
      actions: [{ action_type: "lead", value: "3" }, { action_type: "link_click", value: "40" }],
      action_values: [{ action_type: "purchase", value: "900" }],
      cost_per_action_type: [{ action_type: "lead", value: "41.15" }],
      video_p25_watched_actions: [{ action_type: "video_view", value: "200" }],
      video_p100_watched_actions: [{ action_type: "video_view", value: "20" }],
    },
    "act_1", "BRL",
  )!;
  assert.equal(l.ad_id, "a1");
  assert.equal(l.data, "2026-10-01");
  assert.equal(l.spend, 123.45);
  assert.equal(l.impressions, 1000);
  assert.equal(l.frequency, 1.25);
  assert.equal(l.leads, 3);
  assert.equal(l.cliques_link, 40);
  assert.equal(l.compras, null);
  assert.equal(l.valor_compras, 900, "o valor vem de action_values, independente da contagem");
  assert.equal(l.video_p25, 200);
  assert.equal(l.video_p50, null);
  assert.equal(l.video_p100, 20);
  assert.equal(l.moeda, "BRL");
  assert.deepEqual(l.cost_per_action_type, [{ action_type: "lead", value: "41.15" }]);
  assert.equal(mapearInsight({ date_start: "2026-10-01" }, "act_1", "BRL"), null);
  assert.equal(mapearInsight({ ad_id: "a1" }, "act_1", "BRL"), null);
});

test("mapearBreakdown usa as dimensões certas de cada tipo", () => {
  const base = { ad_id: "a1", date_start: "2026-10-01", spend: "10", impressions: "100" };
  const ig = mapearBreakdown({ ...base, age: "25-34", gender: "female" }, "idade_genero", "act_1")!;
  assert.deepEqual([ig.tipo, ig.dim1, ig.dim2], ["idade_genero", "25-34", "female"]);
  const pl = mapearBreakdown({ ...base, publisher_platform: "instagram", platform_position: "feed" }, "plataforma_posicao", "act_1")!;
  assert.deepEqual([pl.dim1, pl.dim2], ["instagram", "feed"]);
  const rg = mapearBreakdown({ ...base, region: "Rio de Janeiro" }, "regiao", "act_1")!;
  assert.deepEqual([rg.dim1, rg.dim2], ["Rio de Janeiro", ""]);
});

test("parâmetros do relatório: level=ad, diário, intervalo em time_range, breakdown só quando pedido", () => {
  const p = paramsDoRelatorio("principal", "2026-10-01", "2026-10-30");
  assert.equal(p.level, "ad");
  assert.equal(p.time_increment, 1);
  assert.deepEqual(JSON.parse(p.time_range), { since: "2026-10-01", until: "2026-10-30" });
  assert.ok(!("breakdowns" in p));
  for (const c of ["spend", "reach", "unique_clicks", "inline_link_clicks", "actions", "action_values",
    "cost_per_action_type", "video_p25_watched_actions", "video_p100_watched_actions", "conversions"]) {
    assert.ok(p.fields.split(",").includes(c), c);
  }
  assert.equal((paramsDoRelatorio("regiao", "a", "b") as { breakdowns: string }).breakdowns, "region");
  assert.equal((paramsDoRelatorio("idade_genero", "a", "b") as { breakdowns: string }).breakdowns, "age,gender");
});

// --- Meta simulada -----------------------------------------------------------

interface Job { tipo: string; since: string; until: string; consultas: number; falhar?: boolean }

function metaSimulada(opcoes: { consultasAteCompletar?: number; falharPrimeiro?: boolean } = {}) {
  const consultasAteCompletar = opcoes.consultasAteCompletar ?? 2;
  const jobs = new Map<string, Job>();
  const posts: { since: string; until: string; tipo: string }[] = [];
  let seq = 0;
  let falhou = false;
  const resp = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

  const fetchImpl = (async (url: string, init: RequestInit) => {
    const u = new URL(String(url));
    const caminho = u.pathname.replace(`/${GRAPH_VERSION}/`, "");
    if (caminho === "act_1" && init.method === "GET") {
      return resp({ id: "act_1", name: "VS - Moradas", currency: "BRL", timezone_name: "America/Sao_Paulo", account_status: 1 });
    }
    if (caminho === "act_1/insights" && init.method === "POST") {
      const p = new URLSearchParams(String(init.body));
      const range = JSON.parse(p.get("time_range")!);
      const tipo = p.get("breakdowns") ?? "principal";
      const id = `R${++seq}`;
      const job: Job = { tipo, since: range.since, until: range.until, consultas: 0 };
      if (opcoes.falharPrimeiro && !falhou) { job.falhar = true; falhou = true; }
      jobs.set(id, job);
      posts.push({ since: job.since, until: job.until, tipo });
      return resp({ report_run_id: id });
    }
    const m = caminho.match(/^(R\d+)(\/insights)?$/);
    if (m) {
      const job = jobs.get(m[1]);
      if (!job) return resp({ error: { code: 100, message: "Unsupported get request" } }, 400);
      if (!m[2]) {
        job.consultas++;
        if (job.falhar) return resp({ async_status: "Job Failed", async_percent_completion: 0 });
        return job.consultas >= consultasAteCompletar
          ? resp({ async_status: "Job Completed", async_percent_completion: 100 })
          : resp({ async_status: "Job Running", async_percent_completion: 40 });
      }
      // Resultado: principal tem 2 páginas (início e fim da janela); breakdown, 1 linha.
      const dim =
        job.tipo === "principal" ? {}
        : job.tipo === "age,gender" ? { age: "25-34", gender: "female" }
        : job.tipo === "region" ? { region: "Sao Paulo" }
        : { publisher_platform: "instagram", platform_position: "feed" };
      const linha = (data: string) => ({
        ad_id: "a1", adset_id: "s1", campaign_id: "c1", date_start: data, date_stop: data,
        spend: "10.50", impressions: "100", reach: "90", clicks: "5", inline_link_clicks: "4",
        actions: [{ action_type: "lead", value: "1" }], ...dim,
      });
      if (job.tipo === "principal" && !u.searchParams.get("after")) {
        return resp({ data: [linha(job.since)], paging: { next: `https://graph.facebook.com/${GRAPH_VERSION}/${m[1]}/insights?after=P2&limit=500` } });
      }
      return resp({ data: [linha(job.until)] });
    }
    return resp({ error: { code: 100, message: `rota inesperada ${caminho}` } }, 400);
  }) as typeof fetch;

  const cliente = new MetaGraphClient({
    config: { accessToken: "tok-de-teste-123456", appSecret: "secret-de-teste-123456", adAccountId: "act_1" },
    fetchImpl, dormir: async () => {}, log: () => {}, random: () => 0,
  });
  return { cliente, jobs, posts };
}

/** Relógio falso: dormir avança o tempo, para o orçamento de tempo ser testável. */
function relogio() {
  let t = 1_000_000;
  return { agora: () => t, dormir: async (ms: number) => { t += ms; } };
}

const HOJE = new Date("2026-10-30T15:00:00Z"); // 12h em São Paulo, dia 30

// --- incremental -------------------------------------------------------------

test("incremental pede os últimos 28 dias em relatórios assíncronos e grava tudo", async () => {
  const { cliente, posts } = metaSimulada();
  const { armazem, tabelas } = armazemEmMemoria();
  const r = await sincronizarIncremental(cliente, armazem, { data: HOJE, ...relogio() });

  assert.equal(r.concluido, true);
  assert.deepEqual(r.janela, { since: "2026-10-03", until: "2026-10-30" }); // 28 dias contando hoje
  assert.deepEqual(posts.map((p) => p.tipo).sort(), ["age,gender", "principal", "publisher_platform,platform_position", "region"]);
  assert.ok(posts.every((p) => p.since === "2026-10-03" && p.until === "2026-10-30"));

  assert.deepEqual([...tabelas.get("meta_insights_diarios")!.keys()].sort(), ["a1|2026-10-03", "a1|2026-10-30"]);
  const dia = tabelas.get("meta_insights_diarios")!.get("a1|2026-10-30")!;
  assert.equal(dia.spend, 10.5);
  assert.equal(dia.leads, 1);
  assert.equal(dia.moeda, "BRL");
  const tipos = [...tabelas.get("meta_insights_breakdowns")!.values()].map((l) => l.tipo);
  assert.deepEqual([...new Set(tipos)].sort(), ["idade_genero", "plataforma_posicao", "regiao"]);
  assert.equal(tabelas.get("meta_conta_anuncios")!.get("act_1")!.fuso, "America/Sao_Paulo");
});

test("incremental duas vezes seguidas não duplica nada", async () => {
  const { armazem, tabelas } = armazemEmMemoria();
  await sincronizarIncremental(metaSimulada().cliente, armazem, { data: HOJE, ...relogio() });
  const antes = contagens(tabelas);
  await sincronizarIncremental(metaSimulada().cliente, armazem, { data: HOJE, ...relogio() });
  assert.deepEqual(contagens(tabelas), antes);
});

test("sem tempo para a Meta terminar, salva o estado e a próxima chamada retoma sem pedir de novo", async () => {
  const { cliente, posts } = metaSimulada({ consultasAteCompletar: 4 });
  const { armazem, tabelas, estados } = armazemEmMemoria();
  const rel = relogio();

  const primeira = await sincronizarIncremental(cliente, armazem, { data: HOJE, ...rel, orcamentoMs: 5_000, intervaloPollMs: 3_000 });
  assert.equal(primeira.concluido, false);
  assert.equal(posts.length, 4, "pediu os 4 relatórios uma única vez");
  assert.equal(tabelas.get("meta_insights_diarios"), undefined, "nada gravado ainda");
  const salvo = estados.get("ads_incremental")!;
  assert.equal(salvo.concluida, false);
  assert.equal(Object.keys((salvo.janela as { relatorios: object }).relatorios).length, 4);

  const segunda = await sincronizarIncremental(cliente, armazem, { data: HOJE, ...rel, orcamentoMs: 60_000 });
  assert.equal(segunda.concluido, true);
  assert.equal(segunda.detalhes.retomada, true);
  assert.equal(posts.length, 4, "não pediu relatório novo na retomada");
  assert.equal(tabelas.get("meta_insights_diarios")!.size, 2);
  assert.equal(estados.get("ads_incremental")!.concluida, true);
});

test("estado antigo de outro dia não é retomado: começa janela nova", async () => {
  const { armazem, estados } = armazemEmMemoria();
  estados.set("ads_incremental", {
    concluida: false, iniciadoEm: HOJE.getTime() - 60_000,
    janela: { since: "2026-09-01", until: "2026-09-28", relatorios: { principal: "R99" }, concluidos: [] },
  });
  const { cliente, posts } = metaSimulada();
  const r = await sincronizarIncremental(cliente, armazem, { data: HOJE, ...relogio() });
  assert.equal(r.detalhes.retomada, false);
  assert.equal(posts.length, 4);
});

test("relatório que falha na Meta é pedido de novo e a janela conclui", async () => {
  const { cliente, posts } = metaSimulada({ falharPrimeiro: true });
  const { armazem, tabelas } = armazemEmMemoria();
  const r = await sincronizarIncremental(cliente, armazem, { data: HOJE, ...relogio() });
  assert.equal(r.concluido, true);
  assert.equal(posts.length, 5, "4 relatórios + 1 refeito");
  assert.equal(tabelas.get("meta_insights_diarios")!.size, 2);
});

test("relatório que a Meta não conhece mais é recriado", async () => {
  const { cliente, posts } = metaSimulada();
  const { armazem, tabelas, estados } = armazemEmMemoria();
  estados.set("ads_incremental", {
    concluida: false, iniciadoEm: HOJE.getTime() - 60_000,
    janela: { since: "2026-10-03", until: "2026-10-30", relatorios: { principal: "R404" }, concluidos: [] },
  });
  const r = await sincronizarIncremental(cliente, armazem, { data: HOJE, ...relogio() });
  assert.equal(r.concluido, true);
  assert.equal(posts.length, 4, "principal refeito + 3 breakdowns");
  assert.equal(tabelas.get("meta_insights_diarios")!.size, 2);
});

// --- carga histórica ----------------------------------------------------------

test("carga histórica anda mês a mês, do mais recente ao mais antigo, até o limite", async () => {
  const { cliente, posts } = metaSimulada({ consultasAteCompletar: 1 });
  const { armazem, tabelas, estados } = armazemEmMemoria();
  const r = await carregarHistorico(cliente, armazem, { data: HOJE, meses: 2, ...relogio(), orcamentoMs: 600_000 });

  assert.equal(r.concluido, true);
  assert.equal(r.proximoAte, null);
  // limite = 30/08/2026 + 1 dia → 31/08; janelas: out (1–30), set (1–30), ago (31–31).
  const janelas = [...new Set(posts.filter((p) => p.tipo === "principal").map((p) => `${p.since}..${p.until}`))];
  assert.deepEqual(janelas, ["2026-10-01..2026-10-30", "2026-09-01..2026-09-30", "2026-08-31..2026-08-31"]);
  assert.equal(r.janelasConcluidas, 3);
  assert.equal(posts.length, 12, "4 relatórios por janela");
  assert.equal(estados.get("ads_historico")!.concluido, true);
  // Cada janela grava o primeiro e o último dia → dias distintos no banco.
  assert.ok(tabelas.get("meta_insights_diarios")!.has("a1|2026-10-01"));
  assert.ok(tabelas.get("meta_insights_diarios")!.has("a1|2026-08-31"));
});

test("carga histórica interrompida continua de onde parou e não repete janelas", async () => {
  const { cliente, posts } = metaSimulada({ consultasAteCompletar: 2 });
  const { armazem, estados } = armazemEmMemoria();
  const rel = relogio();

  // Orçamento curto: não dá para fechar nem a primeira janela.
  const a = await carregarHistorico(cliente, armazem, { data: HOJE, meses: 2, ...rel, orcamentoMs: 2_000, intervaloPollMs: 3_000 });
  assert.equal(a.concluido, false);
  assert.equal(a.janelasConcluidas, 0);
  assert.equal(posts.length, 4);
  assert.equal((estados.get("ads_historico")!.janela as { since: string }).since, "2026-10-01");

  // Segunda chamada, com tempo: termina tudo sem repetir pedidos da janela 1.
  const b = await carregarHistorico(cliente, armazem, { data: HOJE, meses: 2, ...rel, orcamentoMs: 600_000 });
  assert.equal(b.concluido, true);
  assert.equal(b.janelasConcluidas, 3);
  assert.equal(posts.filter((p) => p.tipo === "principal" && p.since === "2026-10-01").length, 1);
  assert.equal(posts.length, 12);

  // Depois de concluída, chamar de novo não faz nada.
  const c = await carregarHistorico(cliente, armazem, { data: HOJE, meses: 2, ...rel });
  assert.equal(c.concluido, true);
  assert.equal(posts.length, 12);
});

test("carga histórica com reiniciar recomeça do zero", async () => {
  const { cliente, posts } = metaSimulada({ consultasAteCompletar: 1 });
  const { armazem } = armazemEmMemoria();
  await carregarHistorico(cliente, armazem, { data: HOJE, meses: 1, ...relogio(), orcamentoMs: 600_000 });
  const antes = posts.length;
  await carregarHistorico(cliente, armazem, { data: HOJE, meses: 1, ...relogio(), orcamentoMs: 600_000, reiniciar: true });
  assert.ok(posts.length > antes);
});
