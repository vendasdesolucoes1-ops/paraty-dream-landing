// Cálculos e rótulos das telas de Marketing (dados da Meta: Ads e Instagram).
//
// Sem dependências (nem Supabase nem React): as somas vêm prontas das funções
// SQL marketing_* e aqui só se derivam taxas, variações, rótulos e o estado da
// integração. Testado em src/lib/marketing-calculos.test.ts.

// ── Tipos das linhas que as funções SQL devolvem ─────────────────────────────

export interface ResumoAds {
  periodo: "atual" | "anterior";
  inicio: string;
  fim: string;
  moeda: string | null;
  investimento: number;
  impressoes: number;
  alcance_soma: number;
  cliques: number;
  cliques_link: number;
  leads: number;
  mensagens: number;
  compras: number;
  valor_compras: number;
  reservas: number;
  anuncios_com_gasto: number;
}

export interface PontoSerieAds {
  data: string;
  investimento: number;
  impressoes: number;
  cliques_link: number;
  leads: number;
  mensagens: number;
}

export type NivelAnuncio = "campanha" | "conjunto" | "anuncio";

export interface LinhaAnuncio {
  id: string;
  nome: string | null;
  status: string | null;
  effective_status: string | null;
  campanha_id: string | null;
  campanha_nome: string | null;
  conjunto_id: string | null;
  conjunto_nome: string | null;
  objetivo: string | null;
  thumbnail_url: string | null;
  titulo: string | null;
  corpo: string | null;
  orcamento_diario: number | null;
  orcamento_total: number | null;
  investimento: number;
  impressoes: number;
  alcance_soma: number;
  cliques: number;
  cliques_link: number;
  leads: number;
  mensagens: number;
  compras: number;
  reservas: number;
  criado_em: string | null;
}

export type TipoBreakdown = "idade_genero" | "plataforma_posicao" | "regiao";

export interface LinhaBreakdown {
  dim1: string;
  dim2: string;
  investimento: number;
  impressoes: number;
  cliques_link: number;
  leads: number;
  mensagens: number;
}

export interface ResumoIg {
  metrica: string;
  valor: number | null;
  valor_anterior: number | null;
}

export interface PontoSerieIg {
  data: string;
  metrica: string;
  valor: number;
}

export type TipoMidia = "FEED" | "REELS" | "STORY";

export interface MidiaIg {
  id: string;
  caption: string | null;
  media_type: string | null;
  media_product_type: string | null;
  permalink: string | null;
  publicado_em: string | null;
  imagem_url: string | null;
  curtidas: number | null;
  comentarios: number | null;
  alcance: number | null;
  views: number | null;
  salvos: number | null;
  compartilhamentos: number | null;
  interacoes: number | null;
  tempo_medio_ms: number | null;
  respostas: number | null;
  metricas_em: string | null;
}

export interface LinhaDemografia {
  tipo: "age" | "gender" | "city" | "country";
  chave: string;
  valor: number;
  data: string;
}

export interface StatusJob {
  job: string;
  ultima_em: string;
  ultimo_status: "executando" | "sucesso" | "parcial" | "erro";
  ultimo_erro: string | null;
  codigo_erro: number | null;
  registros: number;
  detalhes: Record<string, unknown> | null;
  ultimo_sucesso_em: string | null;
}

// ── Taxas derivadas ───────────────────────────────────────────────────────────

/** a / b, ou null quando não há base (nada de "Infinity" ou "NaN" na tela). */
export function razao(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return a / b;
}

export interface Derivadas {
  /** Custo por lead. */
  cpl: number | null;
  /** Custo por conversa iniciada no WhatsApp/Direct. */
  custoPorMensagem: number | null;
  /** Taxa de cliques (cliques ÷ impressões), 0–1. */
  ctr: number | null;
  /** Custo por clique no link. */
  cpc: number | null;
  /** Custo por mil impressões. */
  cpm: number | null;
}

export function derivadas(r: {
  investimento: number;
  impressoes: number;
  cliques: number;
  cliques_link: number;
  leads: number;
  mensagens: number;
}): Derivadas {
  const cpmBase = razao(r.investimento, r.impressoes);
  return {
    cpl: razao(r.investimento, r.leads),
    custoPorMensagem: razao(r.investimento, r.mensagens),
    ctr: razao(r.cliques, r.impressoes),
    cpc: razao(r.investimento, r.cliques_link),
    cpm: cpmBase === null ? null : cpmBase * 1000,
  };
}

export type Direcao = "sobe" | "desce" | "igual";

export interface Variacao {
  /** Variação relativa (0,25 = +25%); null quando não há base de comparação. */
  pct: number | null;
  direcao: Direcao;
}

/** Comparação com o período anterior. Sem valor anterior (ou zero) não há %. */
export function variacao(
  atual: number | null | undefined,
  anterior: number | null | undefined,
): Variacao {
  const a = atual ?? 0;
  const b = anterior ?? 0;
  const direcao: Direcao = a > b ? "sobe" : a < b ? "desce" : "igual";
  if (!b) return { pct: null, direcao };
  return { pct: (a - b) / Math.abs(b), direcao };
}

/**
 * Se a variação é boa ou ruim depende da métrica: investimento subir é neutro,
 * custo por lead subir é ruim, leads subir é bom.
 */
export type Sentido = "maior_melhor" | "menor_melhor" | "neutro";

export function tomDaVariacao(v: Variacao, sentido: Sentido): "success" | "danger" | "neutral" {
  if (sentido === "neutro" || v.direcao === "igual" || v.pct === null) return "neutral";
  const melhorou = sentido === "maior_melhor" ? v.direcao === "sobe" : v.direcao === "desce";
  return melhorou ? "success" : "danger";
}

// ── Formatação ────────────────────────────────────────────────────────────────

const cacheMoeda = new Map<string, Intl.NumberFormat>();

/** R$ 1.234,56 (na moeda da conta; BRL se não souber). */
export function formatMoeda(v: number | null | undefined, moeda?: string | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const codigo = moeda || "BRL";
  let f = cacheMoeda.get(codigo);
  if (!f) {
    try {
      f = new Intl.NumberFormat("pt-BR", { style: "currency", currency: codigo });
    } catch {
      f = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    }
    cacheMoeda.set(codigo, f);
  }
  return f.format(v);
}

const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** 1.234 até 9.999; depois 12,3 mil / 1,2 mi. */
export function formatQtd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return Math.abs(v) >= 10_000 ? compacto.format(v) : inteiro.format(v);
}

/** 0,0345 → "3,45%". */
export function formatTaxa(v: number | null | undefined, casas = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

/** Variação para o rodapé do indicador: "+12% vs. período anterior". */
export function formatVariacao(v: Variacao): string {
  if (v.pct === null)
    return v.direcao === "igual" ? "igual ao período anterior" : "sem base anterior";
  if (v.direcao === "igual" || Math.abs(v.pct) < 0.005) return "igual ao período anterior";
  const pct = Math.round(Math.abs(v.pct) * 100);
  return `${v.direcao === "sobe" ? "+" : "−"}${pct}% vs. período anterior`;
}

/** Tempo médio de reel (ms) → "4,5 s" / "1 min 05 s". */
export function formatDuracaoMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const s = ms / 1000;
  if (s < 60) return `${s.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
  const min = Math.floor(s / 60);
  return `${min} min ${String(Math.round(s - min * 60)).padStart(2, "0")} s`;
}

/** "2026-10-07" → "07/10" sem passar por fuso (a data já é do calendário). */
export function diaCurto(dataIso: string): string {
  const [, m, d] = dataIso.split("-");
  return `${d}/${m}`;
}

// ── Status de campanhas/anúncios ─────────────────────────────────────────────

export type GrupoStatus = "ativos" | "pausados" | "arquivados" | "outros";

export function grupoStatus(effectiveStatus: string | null | undefined): GrupoStatus {
  switch (effectiveStatus) {
    case "ACTIVE":
      return "ativos";
    case "PAUSED":
    case "CAMPAIGN_PAUSED":
    case "ADSET_PAUSED":
      return "pausados";
    case "ARCHIVED":
    case "DELETED":
      return "arquivados";
    default:
      return "outros";
  }
}

type Tom = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

const STATUS_ANUNCIO: Record<string, { label: string; tone: Tom }> = {
  ACTIVE: { label: "Ativo", tone: "success" },
  PAUSED: { label: "Pausado", tone: "neutral" },
  CAMPAIGN_PAUSED: { label: "Campanha pausada", tone: "neutral" },
  ADSET_PAUSED: { label: "Conjunto pausado", tone: "neutral" },
  ARCHIVED: { label: "Arquivado", tone: "neutral" },
  DELETED: { label: "Excluído", tone: "neutral" },
  IN_PROCESS: { label: "Processando", tone: "info" },
  PENDING_REVIEW: { label: "Em análise", tone: "info" },
  PREAPPROVED: { label: "Pré-aprovado", tone: "info" },
  WITH_ISSUES: { label: "Com problemas", tone: "warning" },
  PENDING_BILLING_INFO: { label: "Pagamento pendente", tone: "warning" },
  DISAPPROVED: { label: "Reprovado", tone: "danger" },
};

export function statusAnuncio(effectiveStatus: string | null | undefined): {
  label: string;
  tone: Tom;
} {
  if (!effectiveStatus) return { label: "—", tone: "neutral" };
  return STATUS_ANUNCIO[effectiveStatus] ?? { label: humanizar(effectiveStatus), tone: "neutral" };
}

const OBJETIVO: Record<string, string> = {
  OUTCOME_LEADS: "Cadastros",
  OUTCOME_ENGAGEMENT: "Engajamento",
  OUTCOME_TRAFFIC: "Tráfego",
  OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_SALES: "Vendas",
  OUTCOME_APP_PROMOTION: "Promoção de app",
  LEAD_GENERATION: "Cadastros",
  MESSAGES: "Mensagens",
  LINK_CLICKS: "Tráfego",
  REACH: "Alcance",
  BRAND_AWARENESS: "Reconhecimento",
  POST_ENGAGEMENT: "Engajamento",
  VIDEO_VIEWS: "Visualizações de vídeo",
  CONVERSIONS: "Conversões",
};

export function rotuloObjetivo(objetivo: string | null | undefined): string {
  if (!objetivo) return "—";
  return OBJETIVO[objetivo] ?? humanizar(objetivo);
}

/** "AUDIENCE_NETWORK" → "Audience network". */
export function humanizar(texto: string): string {
  const t = texto
    .replace(/^OUTCOME_/, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ── Rótulos dos breakdowns e da demografia ────────────────────────────────────

const GENERO: Record<string, string> = {
  female: "Mulheres",
  male: "Homens",
  unknown: "Não informado",
  F: "Mulheres",
  M: "Homens",
  U: "Não informado",
};

const PLATAFORMA: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Audience Network",
  threads: "Threads",
  whatsapp: "WhatsApp",
};

const POSICAO: Record<string, string> = {
  feed: "Feed",
  story: "Stories",
  instagram_stories: "Stories",
  facebook_stories: "Stories",
  instagram_reels: "Reels",
  facebook_reels: "Reels",
  reels: "Reels",
  facebook_reels_overlay: "Sobreposição em Reels",
  explore: "Explorar",
  instagram_explore: "Explorar",
  instagram_explore_grid_home: "Explorar (grade)",
  instagram_search: "Busca",
  instagram_profile_feed: "Feed do perfil",
  marketplace: "Marketplace",
  video_feeds: "Feeds de vídeo",
  instream_video: "Vídeo in-stream",
  right_hand_column: "Coluna direita",
  search: "Busca",
  messenger_inbox: "Caixa de entrada",
  an_classic: "Audience Network",
  rewarded_video: "Vídeo premiado",
};

export function rotuloGenero(chave: string): string {
  return GENERO[chave] ?? humanizar(chave);
}

/** Rótulo de uma linha de breakdown de anúncios. */
export function rotuloBreakdown(tipo: TipoBreakdown, dim1: string, dim2: string): string {
  if (tipo === "idade_genero")
    return `${dim1 === "Unknown" ? "Idade não informada" : dim1} · ${rotuloGenero(dim2)}`;
  if (tipo === "plataforma_posicao") {
    return `${PLATAFORMA[dim1] ?? humanizar(dim1)} · ${POSICAO[dim2] ?? humanizar(dim2)}`;
  }
  return dim1 || "Região não informada";
}

const ROTULO_DEMOGRAFIA: Record<LinhaDemografia["tipo"], string> = {
  age: "Idade",
  gender: "Gênero",
  city: "Cidades",
  country: "Países",
};

export function rotuloTipoDemografia(tipo: LinhaDemografia["tipo"]): string {
  return ROTULO_DEMOGRAFIA[tipo];
}

/** Rótulo de uma chave de demografia (gênero vira palavra; o resto vem como a Meta manda). */
export function rotuloDemografia(tipo: LinhaDemografia["tipo"], chave: string): string {
  if (tipo === "gender") return rotuloGenero(chave);
  if (tipo === "city") return chave.replace(/, State of /i, ", ");
  return chave;
}

// ── Instagram ─────────────────────────────────────────────────────────────────

export const TIPO_MIDIA_LABEL: Record<TipoMidia, string> = {
  FEED: "Post",
  REELS: "Reel",
  STORY: "Story",
};

/** Taxa de engajamento de um post: interações ÷ alcance. */
export function engajamento(m: Pick<MidiaIg, "interacoes" | "alcance">): number | null {
  return razao(m.interacoes, m.alcance);
}

/**
 * Série diária do Instagram em formato largo, com todos os dias do período
 * (dia sem dado fica sem a métrica, não com zero).
 */
export function pivotarSerieIg(
  linhas: PontoSerieIg[],
  inicio: string,
  fim: string,
): { data: string; valores: Record<string, number> }[] {
  const porDia = new Map<string, Record<string, number>>();
  for (const l of linhas) {
    const dia = porDia.get(l.data) ?? {};
    dia[l.metrica] = l.valor;
    porDia.set(l.data, dia);
  }
  const saida: { data: string; valores: Record<string, number> }[] = [];
  for (let d = inicio; d <= fim; d = proximoDia(d)) {
    saida.push({ data: d, valores: porDia.get(d) ?? {} });
    if (saida.length > 1200) break;
  }
  return saida;
}

function proximoDia(dataIso: string): string {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Valor de uma métrica no resumo do Instagram (ou null se a conta não tem). */
export function metricaIg(resumo: ResumoIg[], metrica: string): ResumoIg | null {
  return resumo.find((r) => r.metrica === metrica) ?? null;
}

// ── Destaques ─────────────────────────────────────────────────────────────────

/** Anúncios que geraram lead, do menor custo por lead para o maior. */
export function melhoresAnuncios(
  linhas: LinhaAnuncio[],
  n = 5,
): (LinhaAnuncio & { cpl: number })[] {
  return linhas
    .filter((l) => l.leads > 0 && l.investimento > 0)
    .map((l) => ({ ...l, cpl: l.investimento / l.leads }))
    .sort((a, b) => a.cpl - b.cpl || b.leads - a.leads)
    .slice(0, n);
}

/** Posts e reels com mais interações (stories ficam de fora: vivem 24 h). */
export function melhoresPosts(midias: MidiaIg[], n = 5): MidiaIg[] {
  return midias
    .filter((m) => m.media_product_type !== "STORY" && (m.interacoes ?? 0) > 0)
    .sort(
      (a, b) => (b.interacoes ?? 0) - (a.interacoes ?? 0) || (b.alcance ?? 0) - (a.alcance ?? 0),
    )
    .slice(0, n);
}

// ── Saúde da integração ───────────────────────────────────────────────────────

export const ROTULO_JOB: Record<string, string> = {
  ads_diario: "Anúncios (diário)",
  ig_diario: "Instagram (diário)",
  ig_stories: "Stories (de hora em hora)",
  ads_carga_inicial: "Carga inicial de anúncios",
  ig_carga_inicial: "Carga inicial do Instagram",
};

export function rotuloJob(job: string): string {
  return ROTULO_JOB[job] ?? job;
}

export type NivelSaude = "ok" | "atencao" | "erro" | "sem_dados";

export interface Saude {
  nivel: NivelSaude;
  titulo: string;
  detalhe: string;
}

const JOBS_DIARIOS = ["ads_diario", "ig_diario"];
/** Mais de 36 h sem sucesso num job diário = atraso de verdade (o cron roda de madrugada). */
const LIMITE_ATRASO_MS = 36 * 3_600_000;

/**
 * Resume o estado da integração para a faixa de status:
 *   erro      — token inválido (190): nada sincroniza até trocar o token;
 *   atencao   — um job diário falhou por último ou está há mais de 36 h sem sucesso;
 *   sem_dados — nenhuma execução registrada ainda;
 *   ok        — tudo em dia.
 */
export function saudeIntegracao(jobs: StatusJob[], agora: Date = new Date()): Saude {
  if (jobs.length === 0) {
    return {
      nivel: "sem_dados",
      titulo: "A integração com a Meta ainda não rodou",
      detalhe:
        "Assim que a primeira sincronização terminar, os dados de anúncios e do Instagram aparecem aqui.",
    };
  }
  const token = jobs.find((j) => j.ultimo_status === "erro" && j.codigo_erro === 190);
  if (token) {
    return {
      nivel: "erro",
      titulo: "Token da Meta expirado ou revogado",
      detalhe:
        "A sincronização parou. Gere um novo token do usuário do sistema e atualize META_ACCESS_TOKEN.",
    };
  }
  const problemas: string[] = [];
  for (const job of JOBS_DIARIOS) {
    const j = jobs.find((x) => x.job === job);
    if (!j) continue;
    const ultimoOk = j.ultimo_sucesso_em ? new Date(j.ultimo_sucesso_em).getTime() : null;
    if (j.ultimo_status === "erro") {
      problemas.push(`${rotuloJob(job)}: a última execução falhou`);
    } else if (ultimoOk === null || agora.getTime() - ultimoOk > LIMITE_ATRASO_MS) {
      problemas.push(`${rotuloJob(job)}: sem sincronização completa há mais de 36 h`);
    }
  }
  if (problemas.length) {
    return {
      nivel: "atencao",
      titulo: "Sincronização com pendências",
      detalhe: problemas.join(" · "),
    };
  }
  const ultima = jobs
    .filter((j) => JOBS_DIARIOS.includes(j.job) && j.ultimo_sucesso_em)
    .map((j) => new Date(j.ultimo_sucesso_em!).getTime())
    .sort((a, b) => a - b)[0];
  return {
    nivel: "ok",
    titulo: "Dados da Meta em dia",
    detalhe: ultima
      ? `Última sincronização completa em ${new Date(ultima).toLocaleString("pt-BR")}`
      : "Sincronização em dia",
  };
}

// --- Saldo da conta de anúncios (ao vivo, função meta-saldo) -------------------

/** Espelho de SaldoConta em supabase/functions/_shared/meta-saldo.ts. */
export type SaldoConta = {
  contaId: string;
  nome: string | null;
  moeda: string | null;
  status: number | null;
  statusRotulo: string | null;
  prepaga: boolean;
  saldoDisponivel: number | null;
  aCobrar: number | null;
  gastoTotal: number | null;
  limiteGasto: number | null;
  restanteLimite: number | null;
  gastoHoje: number | null;
  mediaDiaria7d: number | null;
  diasRestantes: number | null;
  formaPagamento: string | null;
  consultadoEm: string;
};

export type AlertaSaldo = { nivel: "ok" | "atencao" | "erro"; texto: string };

/** Abaixo disso o saldo (ou o limite) acaba logo e os anúncios param. */
export const DIAS_ALERTA_SALDO = 3;

/**
 * Situação do saldo numa frase: conta parada, saldo/limite acabando, ou ok.
 * Os dias usam o ritmo de gasto dos últimos 7 dias.
 */
export function alertaSaldo(s: SaldoConta): AlertaSaldo {
  if (s.status !== null && s.status !== 1) {
    return {
      nivel: "erro",
      texto: `Situação da conta na Meta: ${s.statusRotulo ?? "com restrição"}. Os anúncios não estão rodando.`,
    };
  }
  // Para o que acabar primeiro: o saldo pré-pago ou o limite de gasto da conta.
  const limiteAntes =
    s.restanteLimite !== null &&
    (s.saldoDisponivel === null || s.restanteLimite < s.saldoDisponivel);
  const base = limiteAntes ? s.restanteLimite : s.prepaga ? s.saldoDisponivel : null;
  const oQue = limiteAntes ? "O limite de gasto" : "O saldo";
  if (base !== null && base <= 0) {
    return { nivel: "erro", texto: `${oQue} acabou: os anúncios param até recarregar.` };
  }
  if (s.diasRestantes !== null && s.diasRestantes < DIAS_ALERTA_SALDO) {
    const dias =
      s.diasRestantes < 1 ? "menos de 1 dia" : `cerca de ${Math.floor(s.diasRestantes)} dia(s)`;
    return { nivel: "atencao", texto: `${oQue} dura ${dias} no ritmo atual.` };
  }
  return { nivel: "ok", texto: "" };
}

/** "há 12 s", "há 3 min" — para o carimbo de atualização do saldo. */
export function haQuanto(iso: string, agora = Date.now()): string {
  const s = Math.max(0, Math.round((agora - Date.parse(iso)) / 1000));
  if (s < 60) return `há ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  return `há ${Math.floor(m / 60)} h`;
}
