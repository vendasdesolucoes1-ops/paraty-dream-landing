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

const nbsp = (s: string) => s.replace(/\u00a0/g, " ");

test("razão sem base vira null, nunca Infinity ou NaN", () => {
  assert.equal(razao(10, 4), 2.5);
  assert.equal(razao(10, 0), null);
  assert.equal(razao(null, 3), null);
  assert.equal(razao(5, undefined), null);
});

test("derivadas: custo por lead, por mensagem, CTR, CPC e CPM", () => {
  const d = derivadas({
    investimento: 100,
    impressoes: 10_000,
    cliques: 250,
    cliques_link: 50,
    leads: 4,
    mensagens: 0,
  });
  assert.equal(d.cpl, 25);
  assert.equal(d.custoPorMensagem, null, "sem mensagem não há custo por mensagem");
  assert.equal(d.ctr, 0.025);
  assert.equal(d.cpc, 2);
  assert.equal(d.cpm, 10);
  const zero = derivadas({
    investimento: 0,
    impressoes: 0,
    cliques: 0,
    cliques_link: 0,
    leads: 0,
    mensagens: 0,
  });
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
  assert.equal(
    tomDaVariacao(variacao(150, 100), "menor_melhor"),
    "danger",
    "custo por lead subir é ruim",
  );
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
  assert.equal(
    rotuloBreakdown("plataforma_posicao", "instagram", "instagram_reels"),
    "Instagram · Reels",
  );
  assert.equal(
    rotuloBreakdown("plataforma_posicao", "facebook", "nova_posicao"),
    "Facebook · Nova posicao",
  );
  assert.equal(rotuloBreakdown("regiao", "Rio de Janeiro", ""), "Rio de Janeiro");
  assert.equal(rotuloBreakdown("regiao", "", ""), "Região não informada");
  assert.equal(rotuloDemografia("gender", "F"), "Mulheres");
  assert.equal(
    rotuloDemografia("city", "Paraty, State of Rio de Janeiro"),
    "Paraty, Rio de Janeiro",
  );
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
  assert.deepEqual(
    s.map((p) => p.data),
    ["2026-10-01", "2026-10-02", "2026-10-03"],
  );
  assert.deepEqual(s[0].valores, { reach: 100, seguidores: 1200 });
  assert.deepEqual(s[1].valores, {});
  assert.equal(pivotarSerieIg([], "2026-10-05", "2026-10-01").length, 0, "período invertido");
  assert.equal(metricaIg([{ metrica: "reach", valor: 1, valor_anterior: null }], "views"), null);
});

const anuncio = (o: Partial<LinhaAnuncio>): LinhaAnuncio => ({
  id: "a",
  nome: "A",
  status: null,
  effective_status: "ACTIVE",
  campanha_id: null,
  campanha_nome: null,
  conjunto_id: null,
  conjunto_nome: null,
  objetivo: null,
  thumbnail_url: null,
  titulo: null,
  corpo: null,
  orcamento_diario: null,
  orcamento_total: null,
  investimento: 0,
  impressoes: 0,
  alcance_soma: 0,
  cliques: 0,
  cliques_link: 0,
  leads: 0,
  mensagens: 0,
  compras: 0,
  reservas: 0,
  criado_em: null,
  tipo_resultado: "lead",
  destino: null,
  avisos: null,
  ...o,
});

test("melhores anúncios: lead ou conversa, do menor custo por resultado", () => {
  const r = melhoresAnuncios([
    anuncio({ id: "caro", investimento: 100, leads: 2 }),
    anuncio({ id: "barato", investimento: 30, leads: 3 }),
    anuncio({ id: "zap", tipo_resultado: "conversa", investimento: 40, mensagens: 10 }),
    anuncio({ id: "sem-lead", investimento: 500, leads: 0 }),
    anuncio({ id: "gratis", investimento: 0, leads: 1 }),
    anuncio({ id: "trafego", tipo_resultado: "clique", investimento: 1, cliques_link: 100 }),
  ]);
  assert.deepEqual(
    r.map((a) => a.id),
    ["zap", "barato", "caro"],
  );
  assert.equal(r[0].resultado.custo, 4);
  assert.equal(r[1].resultado.rotulo, "leads");
});

const midia = (o: Partial<MidiaIg>): MidiaIg => ({
  id: "m",
  caption: null,
  media_type: "IMAGE",
  media_product_type: "FEED",
  permalink: null,
  publicado_em: null,
  imagem_url: null,
  curtidas: null,
  comentarios: null,
  alcance: null,
  views: null,
  salvos: null,
  compartilhamentos: null,
  interacoes: null,
  tempo_medio_ms: null,
  respostas: null,
  metricas_em: null,
  ...o,
});

test("melhores posts: mais interações, sem stories; engajamento = interações ÷ alcance", () => {
  const r = melhoresPosts([
    midia({ id: "p1", interacoes: 10, alcance: 100 }),
    midia({ id: "p2", interacoes: 50, alcance: 1000 }),
    midia({ id: "s1", media_product_type: "STORY", interacoes: 999 }),
    midia({ id: "p3", interacoes: 0 }),
  ]);
  assert.deepEqual(
    r.map((m) => m.id),
    ["p2", "p1"],
  );
  assert.equal(engajamento(r[1]), 0.1);
  assert.equal(engajamento(midia({ interacoes: 5, alcance: null })), null);
});

const job = (o: Partial<StatusJob>): StatusJob => ({
  job: "ads_diario",
  ultima_em: "2026-11-02T06:10:00Z",
  ultimo_status: "sucesso",
  ultimo_erro: null,
  codigo_erro: null,
  registros: 10,
  detalhes: null,
  ultimo_sucesso_em: "2026-11-02T06:10:00Z",
  ...o,
});
const AGORA = new Date("2026-11-02T15:00:00Z");

test("saúde da integração: sem dados, ok, atenção e token inválido", () => {
  assert.equal(saudeIntegracao([], AGORA).nivel, "sem_dados");
  assert.equal(saudeIntegracao([job({}), job({ job: "ig_diario" })], AGORA).nivel, "ok");

  const tokenRuim = saudeIntegracao(
    [job({ ultimo_status: "erro", codigo_erro: 190 }), job({ job: "ig_diario" })],
    AGORA,
  );
  assert.equal(tokenRuim.nivel, "erro");
  assert.match(tokenRuim.detalhe, /META_ACCESS_TOKEN/);

  const falhou = saudeIntegracao(
    [job({ ultimo_status: "erro", codigo_erro: 100 }), job({ job: "ig_diario" })],
    AGORA,
  );
  assert.equal(falhou.nivel, "atencao");
  assert.match(falhou.detalhe, /Anúncios \(diário\): a última execução falhou/);

  const atrasado = saudeIntegracao(
    [job({ ultimo_sucesso_em: "2026-10-30T06:10:00Z" }), job({ job: "ig_diario" })],
    AGORA,
  );
  assert.equal(atrasado.nivel, "atencao");
  assert.match(atrasado.detalhe, /36 h/);

  const parcialRecente = saudeIntegracao(
    [
      job({ ultimo_status: "parcial", ultimo_sucesso_em: "2026-11-01T06:10:00Z" }),
      job({ job: "ig_diario" }),
    ],
    AGORA,
  );
  assert.equal(parcialRecente.nivel, "ok", "parcial com sucesso recente não é problema");
  assert.equal(
    saudeIntegracao([job({ job: "ig_stories", ultimo_status: "erro" })], AGORA).nivel,
    "ok",
    "falha de stories sozinha não acende alerta",
  );
});

test("alerta de saldo: conta parada, saldo acabando e ok", async () => {
  const { alertaSaldo, haQuanto } = await import("./marketing-calculos.ts");
  const base = {
    contaId: "act_1",
    nome: null,
    moeda: "BRL",
    status: 1,
    statusRotulo: "Ativa",
    prepaga: true,
    saldoDisponivel: 300,
    aCobrar: null,
    gastoTotal: 1000,
    limiteGasto: null,
    restanteLimite: null,
    gastoHoje: 20,
    mediaDiaria7d: 50,
    diasRestantes: 6,
    formaPagamento: null,
    consultadoEm: "2026-11-03T15:00:00Z",
  };
  assert.equal(alertaSaldo(base).nivel, "ok");
  assert.deepEqual(alertaSaldo({ ...base, saldoDisponivel: 100, diasRestantes: 2 }), {
    nivel: "atencao",
    texto: "O saldo dura cerca de 2 dia(s) no ritmo atual.",
  });
  assert.equal(alertaSaldo({ ...base, saldoDisponivel: 0, diasRestantes: 0 }).nivel, "erro");
  assert.equal(
    alertaSaldo({ ...base, status: 3, statusRotulo: "Pagamento pendente" }).texto,
    "Situação da conta na Meta: Pagamento pendente. Os anúncios não estão rodando.",
  );
  // Pós-paga sem limite: não há o que acabar.
  assert.equal(
    alertaSaldo({ ...base, prepaga: false, saldoDisponivel: null, diasRestantes: null }).nivel,
    "ok",
  );
  // Limite menor que o saldo: o aviso fala do limite.
  assert.equal(
    alertaSaldo({ ...base, saldoDisponivel: 278.69, restanteLimite: 100, diasRestantes: 1.8 })
      .texto,
    "O limite de gasto dura cerca de 1 dia(s) no ritmo atual.",
  );
  const agora = Date.parse("2026-11-03T15:05:00Z");
  assert.equal(haQuanto("2026-11-03T15:04:48Z", agora), "há 12 s");
  assert.equal(haQuanto("2026-11-03T15:00:00Z", agora), "há 5 min");
});

test("resultado por objetivo e contatos sem duplicar (valores de referência)", async () => {
  const { resultadoDaLinha, totaisSemDuplicar, custosPorObjetivo } =
    await import("./marketing-calculos.ts");
  const linhas = [
    {
      tipo_resultado: "lead" as const,
      investimento: 267.8,
      leads: 52,
      mensagens: 39,
      cliques_link: 300,
    },
    {
      tipo_resultado: "conversa" as const,
      investimento: 515.29,
      leads: 0,
      mensagens: 121,
      cliques_link: 0,
    },
    {
      tipo_resultado: "conversa" as const,
      investimento: 272.9,
      leads: 0,
      mensagens: 52,
      cliques_link: 0,
    },
    {
      tipo_resultado: "conversa" as const,
      investimento: 56.85,
      leads: 0,
      mensagens: 18,
      cliques_link: 0,
    },
  ];
  const form = resultadoDaLinha(linhas[0]);
  assert.equal(form.quantidade, 52);
  assert.equal(form.rotulo, "leads");
  assert.equal(form.custo?.toFixed(2), "5.15");
  const zap = resultadoDaLinha(linhas[1]);
  assert.equal(zap.quantidade, 121);
  assert.equal(zap.custo?.toFixed(2), "4.26");
  assert.equal(
    resultadoDaLinha({
      tipo_resultado: "clique",
      investimento: 10,
      leads: 0,
      mensagens: 0,
      cliques_link: 1,
    }).rotulo,
    "clique",
  );

  const t = totaisSemDuplicar(linhas);
  assert.equal(t.leads, 52);
  assert.equal(t.conversas, 191);
  assert.equal(t.leadsQueChamaram, 39);
  assert.equal(t.contatos, 243);
  assert.equal(t.custoPorContato?.toFixed(2), "4.58");

  const c = custosPorObjetivo({
    periodo: "atual",
    inicio: "2026-10-05",
    fim: "2026-11-03",
    moeda: "BRL",
    investimento: 1112.84,
    impressoes: 0,
    alcance_soma: 0,
    cliques: 0,
    cliques_link: 0,
    leads: 52,
    mensagens: 230,
    compras: 0,
    valor_compras: 0,
    reservas: 0,
    anuncios_com_gasto: 4,
    investimento_leads: 267.8,
    leads_formulario: 52,
    leads_que_chamaram: 39,
    investimento_conversas: 845.04,
    conversas: 191,
    contatos: 243,
  });
  assert.equal(c.custoPorLead?.toFixed(2), "5.15");
  assert.equal(c.custoPorConversa?.toFixed(2), "4.42");
  assert.equal(c.custoPorContato?.toFixed(2), "4.58");
  assert.equal(c.pctLeadsQueChamaram, 0.75);
});

test("última sincronização dos anúncios e dia parcial", async () => {
  const { ultimaSincronizacaoAds, incluiHoje } = await import("./marketing-calculos.ts");
  const job = (o: Partial<StatusJob>): StatusJob => ({
    job: "ads_diario",
    ultima_em: "2026-11-03T06:10:00Z",
    ultimo_status: "sucesso",
    ultimo_erro: null,
    codigo_erro: null,
    registros: 1,
    detalhes: null,
    ultimo_sucesso_em: "2026-11-03T06:10:00Z",
    ...o,
  });
  assert.equal(
    ultimaSincronizacaoAds([
      job({}),
      job({
        job: "ads_carga_inicial",
        ultimo_status: "parcial",
        ultima_em: "2026-11-03T15:20:00Z",
        ultimo_sucesso_em: null,
      }),
      job({ job: "ig_diario", ultimo_sucesso_em: "2026-11-03T18:00:00Z" }),
    ]),
    "2026-11-03T15:20:00Z",
  );
  assert.equal(ultimaSincronizacaoAds([job({ job: "ig_stories" })]), null);
  assert.equal(incluiHoje({ inicio: "2026-10-05", fim: "2026-11-03" }, "2026-11-03"), true);
  assert.equal(incluiHoje({ inicio: "2026-10-01", fim: "2026-10-31" }, "2026-11-03"), false);
});

test("etapa 2: frequência alta, destino, avisos e série por campanha", async () => {
  const {
    publicoCansado,
    rotuloDestino,
    avisosDaLinha,
    serieCampanhas,
    statusAnuncio: st,
  } = await import("./marketing-calculos.ts");
  assert.equal(publicoCansado(2.6), true);
  assert.equal(publicoCansado(1.91), false);
  assert.equal(publicoCansado(null), false);
  assert.equal(rotuloDestino("WHATSAPP"), "WhatsApp");
  assert.equal(rotuloDestino("ON_AD"), "Formulário");
  assert.equal(rotuloDestino("MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP"), "Mensagens");
  assert.equal(st("WITH_ISSUES").label, "Erro de veiculação");
  assert.equal(st("IN_PROCESS").label, "Em análise");

  const avisos = avisosDaLinha({
    erros: [
      { error_summary: "Analise 1 erro", error_message: "Este anúncio não pode ser publicado." },
      { error_summary: "Analise 1 erro", error_message: "Este anúncio não pode ser publicado." },
    ],
    revisao: { global: { POLICY: "Texto reprovado" } },
    recomendacoes: [{ title: "Resultados insatisfatórios" }],
  });
  assert.deepEqual(avisos, [
    { tom: "danger", texto: "Este anúncio não pode ser publicado." },
    { tom: "danger", texto: "Texto reprovado" },
    { tom: "warning", texto: "Resultados insatisfatórios" },
  ]);
  assert.deepEqual(avisosDaLinha(null), []);

  const p = (o: Partial<import("./marketing-calculos.ts").PontoSerieCampanha>) => ({
    data: "2026-11-01",
    campanha_id: "z",
    campanha_nome: "WhatsApp Sofia",
    effective_status: "ACTIVE",
    tipo_resultado: "conversa" as const,
    investimento: 0,
    leads: 0,
    mensagens: 0,
    ...o,
  });
  const pontos = [
    p({ investimento: 30, mensagens: 6 }),
    p({ data: "2026-11-02", investimento: 20, mensagens: 0 }),
    p({
      campanha_id: "f",
      campanha_nome: "Formulário",
      tipo_resultado: "lead",
      investimento: 10,
      leads: 2,
    }),
    p({
      campanha_id: "f",
      campanha_nome: "Formulário",
      tipo_resultado: "lead",
      data: "2026-11-02",
      investimento: 12,
      leads: 3,
    }),
    p({
      campanha_id: "v",
      campanha_nome: "Pausada",
      effective_status: "PAUSED",
      investimento: 50,
      mensagens: 9,
    }),
  ];
  const res = serieCampanhas(pontos, "resultado");
  assert.deepEqual(
    res.campanhas.map((c) => c.id),
    ["f", "z"],
    "só as ativas, em ordem de nome",
  );
  assert.deepEqual(res.dias[0], { data: "2026-11-01", valores: { z: 6, f: 2 } });
  const custo = serieCampanhas(pontos, "custo");
  assert.deepEqual(
    custo.dias[1].valores,
    { z: null, f: 4 },
    "dia sem conversa não vira custo zero",
  );
  assert.equal(custo.dias[0].valores.z, 5);
  // Nenhuma ativa: entram as que tiveram gasto.
  const pausadas = serieCampanhas(
    [p({ effective_status: "PAUSED", investimento: 5, mensagens: 1 })],
    "resultado",
  );
  assert.equal(pausadas.campanhas.length, 1);
});

test("progresso da carga histórica em texto", async () => {
  const { resumoProgresso } = await import("./marketing-calculos.ts");
  const ig = resumoProgresso({
    carga: "instagram",
    unidade: "semanas",
    concluido: false,
    feitas: 3,
    total: 13,
    proximo_ate: "2026-10-14",
    limite: "2026-08-06",
    atualizado_em: null,
  });
  assert.equal(ig.titulo, "Carga histórica de Instagram: 3 de 13 semanas");
  assert.match(ig.detalhe, /Continua sozinha a cada 10 minutos/);
  assert.equal(Math.round(ig.fracao * 100), 23);
  const ads = resumoProgresso({
    carga: "ads",
    unidade: "meses",
    concluido: true,
    feitas: 38,
    total: 38,
    proximo_ate: null,
    limite: "2023-10-04",
    atualizado_em: null,
  });
  assert.equal(ads.titulo, "Carga histórica de anúncios: 38 de 38 meses");
  assert.equal(ads.fracao, 1);
  assert.match(ads.detalhe, /^Concluída: dados desde/);
});
