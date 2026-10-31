// Rodar: node --test "supabase/functions/_shared/meta-instagram.test.ts"
//
// Instagram: conta, insights por dia, demografia, mídias e stories. A Meta é
// simulada, incluindo métricas inexistentes, story com poucos espectadores
// (erro 10) e token revogado (erro 190).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  descobrirInstagram,
  diaDoPeriodo,
  epochInicioDia,
  insightsDaMidia,
  mapearMidia,
  resultadosBreakdown,
  sincronizarInstagramDiario,
  sincronizarStories,
  valoresSimples,
} from "./meta-instagram.ts";
import { GRAPH_VERSION, MetaGraphClient, MetaRateLimitError, MetaTokenInvalidoError } from "./meta-graph.ts";
import { armazemEmMemoria, contagens } from "./meta-teste-util.ts";

const AGORA = new Date("2026-10-30T15:00:00Z"); // 12h em São Paulo

// --- funções puras -------------------------------------------------------------

test("meia-noite do dia no fuso da conta (São Paulo = UTC−3)", () => {
  assert.equal(epochInicioDia("2026-10-30", "America/Sao_Paulo"), Date.parse("2026-10-30T03:00:00Z") / 1000);
  assert.equal(epochInicioDia("2026-10-30", "UTC"), Date.parse("2026-10-30T00:00:00Z") / 1000);
});

test("period=day: o dia é o do início do período que terminou em end_time", () => {
  assert.equal(diaDoPeriodo("2026-10-29T07:00:00+0000"), "2026-10-28");
  assert.equal(diaDoPeriodo("2026-10-29T00:00:00+0000"), "2026-10-28");
  assert.equal(diaDoPeriodo("lixo"), null);
});

test("valoresSimples lê total_value e values[0]; lista vazia não vira zero", () => {
  assert.deepEqual(
    valoresSimples({
      data: [
        { name: "reach", total_value: { value: 120 } },
        { name: "saved", values: [{ value: "7" }] },
        { name: "likes", total_value: { value: 0 } },
        { name: "views" },
      ],
    }),
    { reach: 120, saved: 7, likes: 0 },
  );
  assert.deepEqual(valoresSimples({ data: [] }), {});
  assert.deepEqual(valoresSimples({}), {});
});

test("resultadosBreakdown junta as dimensões e ignora linhas sem valor", () => {
  const r = resultadosBreakdown({
    data: [{ name: "follower_demographics", total_value: { breakdowns: [{ results: [
      { dimension_values: ["25-34"], value: 120 },
      { dimension_values: ["F", "25-34"], value: 5 },
      { dimension_values: ["35-44"] },
    ] }] } }],
  });
  assert.deepEqual(r, [{ chave: "25-34", valor: 120 }, { chave: "F|25-34", valor: 5 }]);
});

test("mapearMidia normaliza data e deixa o que falta como null", () => {
  const l = mapearMidia(
    { id: "m1", media_type: "VIDEO", media_product_type: "REELS", timestamp: "2026-10-25T12:00:00+0000", like_count: "10", caption: "" },
    "IG1",
  );
  assert.equal(l.timestamp, "2026-10-25T12:00:00.000Z");
  assert.equal(l.like_count, 10);
  assert.equal(l.caption, null);
  assert.equal(l.thumbnail_url, null);
  assert.equal(l.comments_count, null);
});

// --- Meta simulada -----------------------------------------------------------------

type Handler = (caminho: string, p: URLSearchParams) => unknown | Response;

function erro(code: number, message = "falha", status = 400) {
  return new Response(JSON.stringify({ error: { message, type: "OAuthException", code, fbtrace_id: "T" } }), { status });
}

function metaIg(handler: Handler) {
  const chamadas: { caminho: string; params: Record<string, string> }[] = [];
  const cliente = new MetaGraphClient({
    config: { accessToken: "tok-de-teste-123456", appSecret: "secret-de-teste-123456", pageId: "PAGE1", adAccountId: "act_1" },
    fetchImpl: (async (url: string) => {
      const u = new URL(String(url));
      const caminho = u.pathname.replace(`/${GRAPH_VERSION}/`, "");
      chamadas.push({ caminho, params: Object.fromEntries(u.searchParams) });
      const r = handler(caminho, u.searchParams);
      return r instanceof Response ? r : new Response(JSON.stringify(r), { status: 200 });
    }) as typeof fetch,
    dormir: async () => {}, log: () => {}, random: () => 0,
  });
  return { cliente, chamadas };
}

const NAO_EXISTE = new Set(["profile_views", "website_clicks"]);

function handlerCompleto(extra?: Handler): Handler {
  return (caminho, p) => {
    const sobrescrita = extra?.(caminho, p);
    if (sobrescrita !== undefined) return sobrescrita;

    if (caminho === "PAGE1") return { id: "PAGE1", instagram_business_account: { id: "IG1" } };
    if (caminho === "IG1") return { username: "moradasdeparaty", followers_count: 1200, follows_count: 300, media_count: 85 };

    if (caminho === "IG1/insights") {
      const metrica = p.get("metric")!;
      if (NAO_EXISTE.has(metrica)) return erro(100, `(#100) metric ${metrica} is not supported`);
      if (metrica === "follower_demographics") {
        const b = p.get("breakdown")!;
        if (b === "city") return erro(100, "(#100) Not enough followers");
        const valores: Record<string, string[]> = { age: ["25-34", "35-44"], gender: ["F", "M"], country: ["BR", "PT"] };
        return { data: [{ name: metrica, total_value: { breakdowns: [{ results: valores[b].map((k, i) => ({ dimension_values: [k], value: 100 - i * 10 })) }] } }] };
      }
      if (metrica === "follower_count") {
        return { data: [{ name: metrica, period: "day", values: ["2026-10-27", "2026-10-28", "2026-10-29"].map((d, i) => ({ value: 3 + i, end_time: `${somar(d)}T07:00:00+0000` })) }] };
      }
      if (metrica === "replies") return { data: [] }; // sem dado: não vira zero
      const dia = new Date(Number(p.get("since")) * 1000).toISOString().slice(0, 10);
      return { data: [{ name: metrica, period: "day", total_value: { value: Number(dia.slice(8)) * 10 } }] };
    }

    if (caminho === "IG1/media") {
      if (!p.get("after")) {
        return {
          data: [
            { id: "M1", media_type: "IMAGE", media_product_type: "FEED", timestamp: "2026-10-25T12:00:00+0000", like_count: 30, comments_count: 4, permalink: "https://ig/p/1" },
            { id: "M2", media_type: "VIDEO", media_product_type: "REELS", timestamp: "2026-10-10T12:00:00+0000", like_count: 90, comments_count: 9, thumbnail_url: "https://t/2.jpg" },
          ],
          paging: { next: `https://graph.facebook.com/${GRAPH_VERSION}/IG1/media?after=P2&limit=50` },
        };
      }
      return { data: [{ id: "M3", media_type: "IMAGE", media_product_type: "FEED", timestamp: "2026-08-01T12:00:00+0000" }] };
    }

    const m = caminho.match(/^(M\d|S\d)\/insights$/);
    if (m) {
      const pedidas = p.get("metric")!.split(",");
      if (m[1] === "M2" && pedidas.includes("ig_reels_video_view_total_time")) return erro(100, "(#100) metric not supported for this media");
      if (m[1] === "S2") return erro(10, "(#10) Not enough viewers for the media to show insights");
      if (pedidas[0] === "navigation") {
        return { data: [{ name: "navigation", total_value: { breakdowns: [{ results: [{ dimension_values: ["tap_forward"], value: 5 }, { dimension_values: ["tap_exit"], value: 2 }] }] } }] };
      }
      return { data: pedidas.map((nome, i) => ({ name: nome, period: "lifetime", values: [{ value: 100 + i }] })) };
    }
    return erro(100, `rota inesperada ${caminho}`);
  };
}

function somar(d: string) {
  return new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

// --- sync diário -------------------------------------------------------------------

test("sync diário grava conta, insights por dia, demografia e mídias recentes", async () => {
  const { cliente, chamadas } = metaIg(handlerCompleto());
  const { armazem, tabelas } = armazemEmMemoria();
  const r = await sincronizarInstagramDiario(cliente, armazem, { data: AGORA });

  assert.equal(r.parcial, false, "métrica indisponível não torna o job parcial");
  assert.deepEqual(r.detalhes.erros, []);
  assert.equal(r.detalhes.igUserId, "IG1");

  // Snapshot da conta.
  const conta = tabelas.get("ig_conta_diaria")!.get("IG1|2026-10-30")!;
  assert.deepEqual([conta.username, conta.followers_count, conta.follows_count, conta.media_count], ["moradasdeparaty", 1200, 300, 85]);

  // Insights: 3 dias fechados (27, 28, 29), um valor por métrica/dia.
  const ins = tabelas.get("ig_insights_conta_diario")!;
  assert.equal(ins.get("IG1|2026-10-29|reach")!.valor, 290);
  assert.equal(ins.get("IG1|2026-10-27|views")!.valor, 270);
  assert.ok(!ins.has("IG1|2026-10-30|reach"), "o dia de hoje (incompleto) não entra");
  assert.ok(!ins.has("IG1|2026-10-29|replies"), "sem dado, sem linha");
  assert.equal(ins.get("IG1|2026-10-28|follower_count")!.valor, 4);
  assert.equal([...ins.keys()].filter((k) => k.endsWith("|follower_count")).length, 3);

  // Métricas que a Meta não aceita são anotadas, não derrubam.
  assert.deepEqual(
    r.detalhes.indisponiveis.filter((x) => !x.startsWith("REELS") && !x.startsWith("FEED")),
    ["follower_demographics:city", "profile_views", "website_clicks"],
  );
  // E só são tentadas uma vez (não repete nos outros 2 dias).
  assert.equal(chamadas.filter((c) => c.params.metric === "profile_views").length, 1);

  // Cada consulta diária cobre exatamente um dia no fuso de São Paulo.
  const reach = chamadas.find((c) => c.params.metric === "reach" && c.caminho === "IG1/insights")!;
  assert.equal(reach.params.metric_type, "total_value");
  assert.equal(reach.params.period, "day");
  assert.equal(Number(reach.params.until) - Number(reach.params.since), 86_400 - 1);
  assert.equal(Number(reach.params.since), epochInicioDia("2026-10-27", "America/Sao_Paulo"));

  // Demografia (city indisponível, o resto grava).
  const demo = tabelas.get("ig_demografia")!;
  assert.equal(demo.get("IG1|2026-10-30|age|25-34")!.valor, 100);
  assert.ok(demo.has("IG1|2026-10-30|gender|F") && demo.has("IG1|2026-10-30|country|BR"));
  assert.ok(![...demo.keys()].some((k) => k.includes("|city|")));
  const dem = chamadas.find((c) => c.params.metric === "follower_demographics")!;
  assert.deepEqual([dem.params.period, dem.params.metric_type, dem.params.timeframe], ["lifetime", "total_value", "this_month"]);

  // Mídias: só as dos últimos 30 dias (M3, de agosto, fica de fora).
  assert.deepEqual([...tabelas.get("ig_midias")!.keys()].sort(), ["M1", "M2"]);
  assert.equal(tabelas.get("ig_midias")!.get("M2")!.thumbnail_url, "https://t/2.jpg");
  assert.ok(!chamadas.some((c) => c.caminho === "M3/insights"));
});

test("insights de mídia variam por tipo e caem para métrica a métrica quando uma é inválida", async () => {
  const { cliente, chamadas } = metaIg(handlerCompleto());
  const { armazem, tabelas } = armazemEmMemoria();
  const r = await sincronizarInstagramDiario(cliente, armazem, { data: AGORA });

  const mi = tabelas.get("ig_midia_insights")!;
  // Feed: pedido combinado, sem views de reels.
  const feed = chamadas.find((c) => c.caminho === "M1/insights")!;
  assert.equal(feed.params.metric, "reach,views,saved,shares,likes,comments,total_interactions");
  assert.equal(mi.get("M1|reach")!.valor, 100);
  assert.ok(!mi.has("M1|ig_reels_avg_watch_time"));
  // Reels: combinado falhou (métrica inválida) → refaz uma a uma, guarda o resto.
  assert.ok(mi.has("M2|ig_reels_avg_watch_time"), "tempo médio de visualização do reel");
  assert.ok(mi.has("M2|views") && mi.has("M2|total_interactions"));
  assert.ok(!mi.has("M2|ig_reels_video_view_total_time"));
  assert.ok(r.detalhes.indisponiveis.includes("REELS:ig_reels_video_view_total_time"));
  // Valor mais recente por (mídia, métrica): uma linha cada.
  assert.equal([...mi.keys()].filter((k) => k.startsWith("M1|")).length, 7);
});

test("rodar o sync diário duas vezes não duplica nada", async () => {
  const { armazem, tabelas } = armazemEmMemoria();
  await sincronizarInstagramDiario(metaIg(handlerCompleto()).cliente, armazem, { data: AGORA });
  const antes = contagens(tabelas);
  await sincronizarInstagramDiario(metaIg(handlerCompleto()).cliente, armazem, { data: AGORA });
  assert.deepEqual(contagens(tabelas), antes);
});

test("todasMidias grava as antigas também, mas só atualiza insights das recentes", async () => {
  const { cliente, chamadas } = metaIg(handlerCompleto());
  const { armazem, tabelas } = armazemEmMemoria();
  await sincronizarInstagramDiario(cliente, armazem, { data: AGORA, todasMidias: true });
  assert.deepEqual([...tabelas.get("ig_midias")!.keys()].sort(), ["M1", "M2", "M3"]);
  assert.ok(!chamadas.some((c) => c.caminho === "M3/insights"));
});

test("erro 190 em qualquer etapa interrompe o job com MetaTokenInvalidoError", async () => {
  const { cliente } = metaIg(handlerCompleto((caminho, p) =>
    caminho === "IG1/insights" && p.get("metric") === "views" ? erro(190, "Error validating access token") : undefined));
  await assert.rejects(
    () => sincronizarInstagramDiario(cliente, armazemEmMemoria().armazem, { data: AGORA }),
    MetaTokenInvalidoError,
  );
});

test("rate limit longo também interrompe (o job tenta de novo depois)", async () => {
  const buc = JSON.stringify({ IG1: [{ call_count: 100, total_cputime: 100, total_time: 100, estimated_time_to_regain_access: 30 }] });
  const { cliente } = metaIg(handlerCompleto((caminho) =>
    caminho === "IG1/media"
      ? new Response(JSON.stringify({ error: { code: 4, message: "limit" } }), { status: 400, headers: { "x-business-use-case-usage": buc } })
      : undefined));
  await assert.rejects(
    () => sincronizarInstagramDiario(cliente, armazemEmMemoria().armazem, { data: AGORA }),
    MetaRateLimitError,
  );
});

test("falha de dado numa etapa (erro 100) vira erro anotado e as outras etapas seguem", async () => {
  const { cliente } = metaIg(handlerCompleto((caminho, p) =>
    caminho === "IG1" && p.get("fields")?.includes("followers_count") ? erro(100, "(#100) campo inválido") : undefined));
  const { armazem, tabelas } = armazemEmMemoria();
  const r = await sincronizarInstagramDiario(cliente, armazem, { data: AGORA });
  assert.equal(r.parcial, true);
  assert.equal(r.detalhes.erros.length, 1);
  assert.equal(r.detalhes.erros[0].etapa, "conta");
  assert.equal(r.detalhes.erros[0].codigo, 100);
  assert.equal(tabelas.get("ig_conta_diaria"), undefined);
  assert.ok(tabelas.get("ig_insights_conta_diario")!.size > 0, "o resto foi gravado");
  assert.ok(tabelas.get("ig_midias")!.size > 0);
});

test("Página sem Instagram vinculado dá erro claro", async () => {
  const { cliente } = metaIg(() => ({ id: "PAGE1" }));
  await assert.rejects(() => descobrirInstagram(cliente), /instagram_business_account/);
});

// --- insightsDaMidia ------------------------------------------------------------------

test("poucos espectadores (erro 10) devolve vazio sem marcar a métrica como inexistente", async () => {
  const { cliente } = metaIg(() => erro(10, "(#10) Not enough viewers for the media to show insights"));
  const indisp = new Set<string>();
  assert.deepEqual(await insightsDaMidia(cliente, "S9", "STORY", indisp), {});
  assert.equal(indisp.size, 0);
});

// --- stories --------------------------------------------------------------------------

function handlerStories(): Handler {
  return (caminho) =>
    caminho === "IG1/stories"
      ? { data: [
          { id: "S1", media_type: "IMAGE", media_product_type: "STORY", timestamp: "2026-10-30T14:00:00+0000", permalink: "https://ig/s/1" },
          { id: "S2", media_type: "VIDEO", media_product_type: "STORY", timestamp: "2026-10-30T14:30:00+0000" },
        ] }
      : undefined as unknown as Response;
}

test("stories: grava as mídias e as métricas atuais, com navegação; poucos espectadores só adia", async () => {
  const { cliente, chamadas } = metaIg(handlerCompleto(handlerStories()));
  const { armazem, tabelas } = armazemEmMemoria();
  const r = await sincronizarStories(cliente, armazem, { data: AGORA });

  assert.equal(r.stories, 2);
  assert.deepEqual([...tabelas.get("ig_midias")!.keys()].sort(), ["S1", "S2"]);
  assert.equal(tabelas.get("ig_midias")!.get("S1")!.media_product_type, "STORY");
  const mi = tabelas.get("ig_midia_insights")!;
  assert.equal(mi.get("S1|reach")!.valor, 100);
  assert.ok(mi.has("S1|views") && mi.has("S1|replies") && mi.has("S1|shares"));
  assert.equal(mi.get("S1|navigation.tap_forward")!.valor, 5);
  assert.equal(mi.get("S1|navigation.tap_exit")!.valor, 2);
  assert.ok(![...mi.keys()].some((k) => k.startsWith("S2|")), "S2 ainda sem espectadores suficientes");
  assert.equal(chamadas.find((c) => c.params.breakdown)?.params.breakdown, "story_navigation_action_type");
  assert.equal(chamadas.find((c) => c.caminho === "IG1/stories")!.params.fields.includes("like_count"), false);
});

test("stories: horário seguinte atualiza as métricas sem duplicar", async () => {
  const { armazem, tabelas } = armazemEmMemoria();
  await sincronizarStories(metaIg(handlerCompleto(handlerStories())).cliente, armazem, { data: AGORA });
  const antes = contagens(tabelas);
  await sincronizarStories(metaIg(handlerCompleto(handlerStories())).cliente, armazem, { data: new Date(AGORA.getTime() + 3_600_000) });
  assert.deepEqual(contagens(tabelas), antes);
  assert.equal(tabelas.get("ig_midia_insights")!.get("S1|reach")!.capturado_em, new Date(AGORA.getTime() + 3_600_000).toISOString());
});

test("stories: sem stories no ar não é erro", async () => {
  const { cliente } = metaIg((c) => (c === "PAGE1" ? { instagram_business_account: { id: "IG1" } } : { data: [] }));
  const r = await sincronizarStories(cliente, armazemEmMemoria().armazem, { data: AGORA });
  assert.equal(r.stories, 0);
  assert.equal(r.registros, 0);
});
