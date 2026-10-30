// Rodar: node --test "supabase/functions/_shared/meta-jobs.test.ts"
//
// Orquestração dos jobs: guarda diária com retomada, alerta de token (erro 190),
// config ausente, boot tolerante e a carga inicial em várias chamadas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { rodarCargaInicial, rodarSyncAds, rodarSyncInstagram, rodarSyncStories, type DepsJob } from "./meta-jobs.ts";
import { GRAPH_VERSION, MetaGraphClient, MetaTokenInvalidoError } from "./meta-graph.ts";
import { armazemEmMemoria } from "./meta-teste-util.ts";

const DATA = new Date("2026-10-30T15:00:00Z");

function relogio() {
  let t = 1_000_000;
  return { agora: () => t, dormir: async (ms: number) => { t += ms; } };
}

interface OpcoesMeta {
  /** false = relatórios assíncronos nunca terminam (para testar o parcial). */
  completar?: boolean;
  /** Quando definido, responde 190 nas chamadas cujo caminho começa com esse prefixo. */
  tokenInvalidoEm?: string;
  semInstagram?: boolean;
}

function metaCompacta(opcoes: OpcoesMeta = {}) {
  const chamadas: string[] = [];
  let seq = 0;
  const resp = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const u = new URL(String(url));
    const caminho = u.pathname.replace(`/${GRAPH_VERSION}/`, "");
    chamadas.push(`${init.method} ${caminho}`);
    if (opcoes.tokenInvalidoEm && caminho.startsWith(opcoes.tokenInvalidoEm)) {
      return resp({ error: { code: 190, message: "Error validating access token: Session has expired", fbtrace_id: "T" } }, 400);
    }
    if (caminho === "PAGE1") {
      return resp(opcoes.semInstagram ? { id: "PAGE1", name: "Moradas" } : { id: "PAGE1", name: "Moradas", instagram_business_account: { id: "IG1" } });
    }
    if (caminho === "me/adaccounts") return resp({ data: [{ id: "act_1", name: "VS - Moradas", account_status: 1 }] });
    if (caminho === "act_1") return resp({ id: "act_1", name: "VS - Moradas", currency: "BRL", timezone_name: "America/Sao_Paulo" });
    if (caminho === "act_1/campaigns") return resp({ data: [{ id: "c1", name: "Lotes", effective_status: "ACTIVE" }] });
    if (caminho === "act_1/adsets") return resp({ data: [{ id: "s1", campaign_id: "c1" }] });
    if (caminho === "act_1/ads") return resp({ data: [{ id: "a1", adset_id: "s1", campaign_id: "c1" }] });
    if (caminho === "act_1/insights") return resp({ report_run_id: `R${++seq}` });
    const rel = caminho.match(/^(R\d+)(\/insights)?$/);
    if (rel && !rel[2]) {
      return resp(opcoes.completar === false
        ? { async_status: "Job Running", async_percent_completion: 10 }
        : { async_status: "Job Completed", async_percent_completion: 100 });
    }
    if (rel && rel[2]) {
      return resp({ data: [{ ad_id: "a1", adset_id: "s1", campaign_id: "c1", date_start: "2026-10-30", spend: "10", impressions: "100", dim: 1 }] });
    }
    if (caminho === "IG1") return resp({ username: "moradasdeparaty", followers_count: 10, follows_count: 2, media_count: 3 });
    if (caminho === "IG1/insights") return resp({ data: [] });
    if (caminho === "IG1/media") return resp({ data: [] });
    if (caminho === "IG1/stories") return resp({ data: [{ id: "S1", media_product_type: "STORY", timestamp: "2026-10-30T14:00:00+0000" }] });
    if (caminho === "S1/insights") return resp({ data: [{ name: "reach", values: [{ value: 7 }] }] });
    return resp({ error: { code: 100, message: `rota inesperada ${caminho}` } }, 400);
  }) as typeof fetch;
  const criar = () =>
    new MetaGraphClient({
      config: { accessToken: "tok-de-teste-123456", appSecret: "secret-de-teste-123456", pageId: "PAGE1", adAccountId: "act_1" },
      fetchImpl, dormir: async () => {}, log: () => {}, random: () => 0,
    });
  return { criar, chamadas };
}

function montar(opcoes: OpcoesMeta = {}, extra: Partial<DepsJob> = {}) {
  const meta = metaCompacta(opcoes);
  const mem = armazemEmMemoria();
  const deps: DepsJob = { armazem: mem.armazem, criarCliente: meta.criar, data: DATA, ...relogio(), ...extra };
  return { deps, ...meta, ...mem };
}

// --- Ads ----------------------------------------------------------------------------

test("sync de Ads: estrutura + incremental numa execução registrada", async () => {
  const { deps, tabelas, execucoes } = montar();
  const r = await rodarSyncAds(deps);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.ok, true);
  assert.equal(r.corpo.status, "sucesso");
  assert.ok(tabelas.get("meta_campanhas")!.has("c1"));
  assert.ok(tabelas.get("meta_insights_diarios")!.has("a1|2026-10-30"));
  assert.equal(execucoes.length, 1);
  assert.equal(execucoes[0].job, "ads_diario");
  assert.equal(execucoes[0].resultado!.status, "sucesso");
  assert.ok(execucoes[0].resultado!.registros > 0);
});

test("guarda diária: depois de um sucesso, as retomadas do cron só pulam; forcar roda de novo", async () => {
  const { deps, execucoes, chamadas } = montar();
  await rodarSyncAds(deps);
  const feitas = chamadas.length;

  const segunda = await rodarSyncAds(deps);
  assert.equal(segunda.status, 200);
  assert.equal(segunda.corpo.pulado, true);
  assert.equal(chamadas.length, feitas, "não chamou a Meta");
  assert.equal(execucoes.length, 1, "pular não cria registro de execução");

  const forcada = await rodarSyncAds(deps, { forcar: true });
  assert.equal(forcada.corpo.pulado, undefined);
  assert.equal(execucoes.length, 2);
});

test("execução parcial (Meta ainda gerando o relatório) não conta como feita: a próxima retoma", async () => {
  const lento = montar({ completar: false });
  const r = await rodarSyncAds(lento.deps);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.status, "parcial");
  assert.equal(lento.execucoes[0].resultado!.status, "parcial");

  // Mesmo estado/armazém, agora com a Meta respondendo: não é pulado e conclui.
  const rapido = metaCompacta({ completar: true });
  const r2 = await rodarSyncAds({ ...lento.deps, criarCliente: rapido.criar });
  assert.equal(r2.corpo.pulado, undefined);
  assert.equal(r2.corpo.status, "sucesso");
  const posts = rapido.chamadas.filter((c) => c === "POST act_1/insights");
  assert.equal(posts.length, 0, "retomou os relatórios já pedidos, sem pedir de novo");
});

test("erro 190: responde 502, registra o código, dispara o alerta e a próxima tentativa não é pulada", async () => {
  const { deps, execucoes, alertas } = montar({ tokenInvalidoEm: "act_1" });
  const r = await rodarSyncAds(deps);
  assert.equal(r.status, 502);
  assert.equal(r.corpo.ok, false);
  assert.equal(r.corpo.tokenInvalido, true);
  assert.equal(r.corpo.codigoErro, 190);
  assert.equal(execucoes[0].resultado!.status, "erro");
  assert.equal(execucoes[0].resultado!.codigoErro, 190);
  assert.equal(alertas.length, 1);
  assert.match(alertas[0], /Session has expired/);
  assert.ok(!JSON.stringify(r).includes("tok-de-teste"), "resposta sem token");

  const outra = await rodarSyncAds(deps);
  assert.equal(outra.status, 502, "erro não ativa a guarda: tenta de novo");
});

test("variável de ambiente ausente: 503 com mensagem clara, sem executar nada", async () => {
  const { deps, execucoes } = montar();
  const r = await rodarSyncAds({
    ...deps,
    criarCliente: () => { throw new Error("META_ACCESS_TOKEN e META_APP_SECRET precisam estar configurados."); },
  });
  assert.equal(r.status, 503);
  assert.match(String(r.corpo.erro), /META_ACCESS_TOKEN/);
  assert.equal(execucoes.length, 0);
});

// --- boot ---------------------------------------------------------------------------

test("boot roda dentro da execução; falha comum do boot não impede o sync", async () => {
  let chamado = 0;
  const { deps, tabelas } = montar({}, { boot: async () => { chamado++; throw new Error("página sem permissão"); } });
  const r = await rodarSyncAds(deps);
  assert.equal(chamado, 1);
  assert.equal(r.corpo.status, "sucesso");
  assert.ok(tabelas.get("meta_campanhas")!.has("c1"));
});

test("boot com token inválido interrompe e alerta", async () => {
  const { deps, alertas } = montar({}, {
    boot: async () => { throw new MetaTokenInvalidoError("token revogado", { status: 400, code: 190 }); },
  });
  const r = await rodarSyncAds(deps);
  assert.equal(r.status, 502);
  assert.equal(r.corpo.tokenInvalido, true);
  assert.equal(alertas.length, 1);
});

// --- Instagram e stories -------------------------------------------------------------

test("sync de Instagram: grava a conta e registra a execução ig_diario", async () => {
  const { deps, tabelas, execucoes } = montar();
  const r = await rodarSyncInstagram(deps);
  assert.equal(r.status, 200);
  assert.equal(execucoes[0].job, "ig_diario");
  assert.equal(tabelas.get("ig_conta_diaria")!.get("IG1|2026-10-30")!.followers_count, 10);
  const segunda = await rodarSyncInstagram(deps);
  assert.equal(segunda.corpo.pulado, true);
});

test("sync de stories roda toda hora (sem guarda) e grava os stories no ar", async () => {
  const { deps, tabelas, execucoes } = montar();
  const a = await rodarSyncStories(deps);
  const b = await rodarSyncStories(deps);
  assert.equal(a.status, 200);
  assert.equal(b.corpo.pulado, undefined);
  assert.equal(execucoes.length, 2);
  assert.equal(execucoes[0].job, "ig_stories");
  assert.ok(tabelas.get("ig_midias")!.has("S1"));
  assert.equal(tabelas.get("ig_midia_insights")!.get("S1|reach")!.valor, 7);
});

test("Página sem Instagram: o job de Instagram falha com mensagem clara", async () => {
  const { deps, execucoes } = montar({ semInstagram: true });
  const r = await rodarSyncInstagram(deps);
  assert.equal(r.status, 502);
  assert.match(String(r.corpo.erro), /instagram_business_account/);
  assert.equal(execucoes[0].resultado!.status, "erro");
});

// --- carga inicial --------------------------------------------------------------------

test("carga inicial de Ads: sincroniza a estrutura na 1ª chamada e conclui o histórico", async () => {
  const { deps, tabelas, estados, chamadas, execucoes } = montar();
  const r = await rodarCargaInicial(deps, { escopo: "ads", meses: 2 });
  assert.equal(r.status, 200);
  assert.equal((r.corpo.detalhes as Record<string, unknown>).concluido, true);
  assert.equal((r.corpo.detalhes as Record<string, unknown>).janelasConcluidas, 3);
  assert.ok(tabelas.get("meta_anuncios")!.has("a1"), "estrutura veio antes");
  assert.equal(estados.get("ads_historico")!.concluido, true);
  assert.equal(execucoes[0].job, "ads_carga_inicial");

  // Chamada seguinte (já concluída): não repete a estrutura.
  const antes = chamadas.filter((c) => c === "GET act_1/campaigns").length;
  const r2 = await rodarCargaInicial(deps, { escopo: "ads", meses: 2 });
  assert.equal((r2.corpo.detalhes as Record<string, unknown>).concluido, true);
  assert.equal(chamadas.filter((c) => c === "GET act_1/campaigns").length, antes);
});

test("carga inicial interrompida devolve concluido=false e continua na chamada seguinte", async () => {
  const lento = montar({ completar: false });
  const a = await rodarCargaInicial(lento.deps, { escopo: "ads", meses: 2 });
  assert.equal(a.status, 200);
  assert.equal((a.corpo.detalhes as Record<string, unknown>).concluido, false);
  assert.equal(a.corpo.status, "parcial");

  const rapido = metaCompacta({ completar: true });
  const b = await rodarCargaInicial({ ...lento.deps, criarCliente: rapido.criar }, { escopo: "ads", meses: 2 });
  assert.equal((b.corpo.detalhes as Record<string, unknown>).concluido, true);
});

test("carga inicial do Instagram grava todo o acervo numa chamada", async () => {
  const { deps, execucoes } = montar();
  const r = await rodarCargaInicial(deps, { escopo: "instagram", dias: 7 });
  assert.equal(r.status, 200);
  assert.equal((r.corpo.detalhes as Record<string, unknown>).concluido, true);
  assert.equal(execucoes[0].job, "ig_carga_inicial");
});
