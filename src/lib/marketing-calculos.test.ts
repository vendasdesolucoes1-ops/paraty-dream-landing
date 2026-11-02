// Rodar: node --test "src/lib/marketing-calculos.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  derivadas,
  diaCurto,
  engajamento,
  formatDuracaoMs,
  formatMoeda,
  formatQtd,
  formatTaxa,
  formatVariacao,
  grupoStatus,
  melhoresAnuncios,
  melhoresPosts,
  metricaIg,
  pivotarSerieIg,
  razao,
  rotuloBreakdown,
  rotuloDemografia,
  rotuloObjetivo,
  saudeIntegracao,
  statusAnuncio,
  tomDaVariacao,
  variacao,
  type LinhaAnuncio,
  type MidiaIg,
  type StatusJob,
} from "./marketing-calculos.ts";

const nbsp = (s: string) => s.replace(/ /g, " ");

test("razão sem base vira null, nunca Infinity ou NaN", () => {
  assert.equal(razao(10, 4), 2.5);
  assert.equal(razao(10, 0), null);
  assert.equal(razao(null, 3), null);
  assert.equal(razao(5, undefined), null);
});

test("derivadas: custo por lead, por mensagem, CTR, CPC e CPM", () => {
  const d = derivadas({ investimento: 100, impressoes: 10_000, cliques: 250, cliques_link: 50, leads: 4, mensagens: 0 });
  assert.equal(d.cpl, 25);
  assert.equal(d.custoPorMensagem, null, "sem mensagem não há custo por mensagem");
  assert.equal(d.ctr, 0.025);
  assert.equal(d.cpc, 2);
  assert.equal(d.cpm, 10);
  const zero = derivadas({ investimento: 0, impressoes: 0, cliques: 0, cliques_link: 0, leads: 0, mensagens: 0 });
  assert.deepEqual(zero, { cpl: null, custoPorMensagem: null, ctr: null, cpc: null, cpm: null });
});

test("variação contra o período anterior", () => {
  assert.deepEqual(variacao(150, 100), { pct: 0.5, direcao: "sobe" });
  assert.deepEqual(variacao(50, 100), { pct: -0.5, direcao: "desce" });
  assert.deepEqual(variacao(10, 0), { pct: null, direcao: "sobe" }, "sem base anterior não há %");
  assert.deepEqual(variacao(null, null), { pct: null, direcao: "igual" });
  assert.equal(formatVariacao(variacao(150, 100)), "+50% vs. período anterior");
  assert.equal(formatVariacao(variacao(50, 100)), "−50% vs. período anterior");
  assert.equal(formatVariacao(variacao(10, 0)), "sem base anterior");
  assert.equal(formatVariacao(variacao(100, 100)), "igual ao período anterior");
});

test("cor da variação depende do sentido da métrica", () => {
  assert.equal(tomDaVariacao(variacao(150, 100), "maior_melhor"), "success");
  assert.equal(tomDaVariacao(variacao(150, 100), "menor_melhor"), "danger", "custo por lead subir é ruim");
  assert.equal(tomDaVariacao(variacao(50, 100), "menor_melhor"), "success");
  assert.equal(tomDaVariacao(variacao(150, 100), "neutro"), "neutral");
  assert.equal(tomDaVariacao(variacao(10, 0), "maior_melhor"), "neutral", "sem base, sem cor");
});

test("formatação de moeda, quantidade, taxa, duração e dia", () => {
  assert.equal(nbsp(formatMoeda(1234.5)), "R$ 1.234,50");
  assert.equal(nbsp(formatMoeda(10, "USD")), "US$ 10,00");
  assert.equal(nbsp(formatMoeda(10, "XYZ-invalida")), "R$ 10,00");
  assert.equal(formatMoeda(null), "—");
  assert.equal(formatQtd(1234), "1.234");
  assert.match(nbsp(formatQtd(12_345)), /^12,3 mil$/);
  assert.equal(formatQtd(undefined), "—");
  assert.equal(formatTaxa(0.0345), "3,45%");
  assert.equal(formatTaxa(null), "—");
  assert.equal(formatDuracaoMs(4500), "4,5 s");
  assert.equal(formatDuracaoMs(65_000), "1 min 05 s");
  assert.equal(formatDuracaoMs(null), "—");
  assert.equal(diaCurto("2026-10-07"), "07/10");
});

test("status de anúncio: grupo do filtro e rótulo com tom", () => {
  assert.equal(grupoStatus("ACTIVE"), "ativos");
  assert.equal(grupoStatus("ADSET_PAUSED"), "pausados");
  assert.equal(grupoStatus("DELETED"), "arquivados");
  assert.equal(grupoStatus("WITH_ISSUES"), "outros");
  assert.equal(grupoStatus(null), "outros");
  assert.deepEqual(statusAnuncio("DISAPPROVED"), { label: "Reprovado", tone: "danger" });
  assert.deepEqual(statusAnuncio("ALGO_NOVO"), { label: "Algo novo", tone: "neutral" });
  assert.equal(rotuloObjetivo("OUTCOME_LEADS"), "Cadastros");
  assert.equal(rotuloObjetivo("OUTCOME_ALGO"), "Algo");
  assert.equal(rotuloObjetivo(null), "—");
});

test("rótulos de breakdown e demografia", () => {
  assert.equal(rotuloBreakdown("idade_genero", "25-34", "female"), "25-34 · Mulheres");
  assert.equal(rotuloBreakdown("plataforma_posicao", "instagram", "instagram_reels"), "Instagram · Reels");
  assert.equal(rotuloBreakdown("plataforma_posicao", "facebook", "nova_posicao"), "Facebook · Nova posicao");
  assert.equal(rotuloBreakdown("regiao", "Rio de Janeiro", ""), "Rio de Janeiro");
  assert.equal(rotuloBreakdown("regiao", "", ""), "Região não informada");
  assert.equal(rotuloDemografia("gender", "F"), "Mulheres");
  assert.equal(rotuloDemografia("city", "Paraty, State of Rio de Janeiro"), "Paraty, Rio de Janeiro");
  assert.equal(rotuloDemografia("age", "25-34"), "25-34");
});

test("série do Instagram: um ponto por dia, dia sem dado fica vazio (não zero)", () => {
  const s = pivotarSerieIg(
    [
      { data: "2026-10-01", metrica: "reach", valor: 100 },
      { data: "2026-10-01", metrica: "seguidores", valor: 1200 },
      { data: "2026-10-03", metrica: "reach", valor: 80 },
    ],
    "2026-10-01",
    "2026-10-03",
  );
  assert.deepEqual(s.map((p) => p.data), ["2026-10-01", "2026-10-02", "2026-10-03"]);
  assert.deepEqual(s[0].valores, { reach: 100, seguidores: 1200 });
  assert.deepEqual(s[1].valores, {});
  assert.equal(pivotarSerieIg([], "2026-10-05", "2026-10-01").length, 0, "período invertido");
  assert.equal(metricaIg([{ metrica: "reach", valor: 1, valor_anterior: null }], "views"), null);
});

const anuncio = (o: Partial<LinhaAnuncio>): LinhaAnuncio => ({
  id: "a", nome: "A", status: null, effective_status: "ACTIVE", campanha_id: null, campanha_nome: null,
  conjunto_id: null, conjunto_nome: null, objetivo: null, thumbnail_url: null, titulo: null, corpo: null,
  orcamento_diario: null, orcamento_total: null, investimento: 0, impressoes: 0, alcance_soma: 0, cliques: 0,
  cliques_link: 0, leads: 0, mensagens: 0, compras: 0, reservas: 0, criado_em: null, ...o,
});

test("melhores anúncios: só os que geraram lead, do menor custo por lead", () => {
  const r = melhoresAnuncios([
    anuncio({ id: "caro", investimento: 100, leads: 2 }),
    anuncio({ id: "barato", investimento: 30, leads: 3 }),
    anuncio({ id: "sem-lead", investimento: 500, leads: 0 }),
    anuncio({ id: "gratis", investimento: 0, leads: 1 }),
  ]);
  assert.deepEqual(r.map((a) => a.id), ["barato", "caro"]);
  assert.equal(r[0].cpl, 10);
});

const midia = (o: Partial<MidiaIg>): MidiaIg => ({
  id: "m", caption: null, media_type: "IMAGE", media_product_type: "FEED", permalink: null, publicado_em: null,
  imagem_url: null, curtidas: null, comentarios: null, alcance: null, views: null, salvos: null,
  compartilhamentos: null, interacoes: null, tempo_medio_ms: null, respostas: null, metricas_em: null, ...o,
});

test("melhores posts: mais interações, sem stories; engajamento = interações ÷ alcance", () => {
  const r = melhoresPosts([
    midia({ id: "p1", interacoes: 10, alcance: 100 }),
    midia({ id: "p2", interacoes: 50, alcance: 1000 }),
    midia({ id: "s1", media_product_type: "STORY", interacoes: 999 }),
    midia({ id: "p3", interacoes: 0 }),
  ]);
  assert.deepEqual(r.map((m) => m.id), ["p2", "p1"]);
  assert.equal(engajamento(r[1]), 0.1);
  assert.equal(engajamento(midia({ interacoes: 5, alcance: null })), null);
});

const job = (o: Partial<StatusJob>): StatusJob => ({
  job: "ads_diario", ultima_em: "2026-11-02T06:10:00Z", ultimo_status: "sucesso", ultimo_erro: null,
  codigo_erro: null, registros: 10, detalhes: null, ultimo_sucesso_em: "2026-11-02T06:10:00Z", ...o,
});
const AGORA = new Date("2026-11-02T15:00:00Z");

test("saúde da integração: sem dados, ok, atenção e token inválido", () => {
  assert.equal(saudeIntegracao([], AGORA).nivel, "sem_dados");
  assert.equal(saudeIntegracao([job({}), job({ job: "ig_diario" })], AGORA).nivel, "ok");

  const tokenRuim = saudeIntegracao([job({ ultimo_status: "erro", codigo_erro: 190 }), job({ job: "ig_diario" })], AGORA);
  assert.equal(tokenRuim.nivel, "erro");
  assert.match(tokenRuim.detalhe, /META_ACCESS_TOKEN/);

  const falhou = saudeIntegracao([job({ ultimo_status: "erro", codigo_erro: 100 }), job({ job: "ig_diario" })], AGORA);
  assert.equal(falhou.nivel, "atencao");
  assert.match(falhou.detalhe, /Anúncios \(diário\): a última execução falhou/);

  const atrasado = saudeIntegracao(
    [job({ ultimo_sucesso_em: "2026-10-30T06:10:00Z" }), job({ job: "ig_diario" })],
    AGORA,
  );
  assert.equal(atrasado.nivel, "atencao");
  assert.match(atrasado.detalhe, /36 h/);

  const parcialRecente = saudeIntegracao(
    [job({ ultimo_status: "parcial", ultimo_sucesso_em: "2026-11-01T06:10:00Z" }), job({ job: "ig_diario" })],
    AGORA,
  );
  assert.equal(parcialRecente.nivel, "ok", "parcial com sucesso recente não é problema");
  assert.equal(saudeIntegracao([job({ job: "ig_stories", ultimo_status: "erro" })], AGORA).nivel, "ok",
    "falha de stories sozinha não acende alerta");
});
