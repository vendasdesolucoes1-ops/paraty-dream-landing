// Cliente da Graph API da Meta (Marketing API + Instagram).
//
// Usado pelos syncs de Meta Ads e Instagram. Regras que ele garante:
//   - appsecret_proof (HMAC-SHA256 do token com o app secret) em TODA chamada;
//   - paginação completa por paging.next (a URL devolvida é revalidada e
//     reassinada: nunca confiamos em host nem em token vindos da resposta);
//   - retry com backoff exponencial em erro transitório e de rate limit, e
//     desaceleração pelos headers X-App-Usage / X-Business-Use-Case-Usage /
//     X-Ad-Account-Usage;
//   - erro 190 (token expirado/revogado) vira MetaTokenInvalidoError, sem retry;
//   - logs estruturados que nunca carregam token, proof nem query string.
//
// O módulo não usa APIs do Deno: o ambiente entra por `configDoAmbiente` e o
// resto é injetável (fetch, sleep, log), o que permite testar em Node.

/** Versão da Graph API usada em todas as chamadas (v26.0: 29/07/2026). */
export const GRAPH_VERSION = "v26.0";
export const GRAPH_HOST = "graph.facebook.com";
export const GRAPH_BASE = `https://${GRAPH_HOST}/${GRAPH_VERSION}`;

/** Códigos de rate limit / throttling da Graph e da Marketing API. */
const CODIGOS_RATE_LIMIT = new Set([4, 17, 32, 613]);
/** 80000–80014: limites por caso de uso (Ads Management, Instagram, etc.). */
const FAIXA_RATE_LIMIT_BUC = { min: 80000, max: 80014 };
/** Falhas temporárias do lado da Meta ("unknown error", "service unavailable"). */
const CODIGOS_TRANSITORIOS = new Set([1, 2]);
export const CODIGO_TOKEN_INVALIDO = 190;

export interface MetaConfig {
  accessToken: string;
  appSecret: string;
  appId?: string;
  /** Formato act_XXXX. */
  adAccountId?: string;
  pageId?: string;
}

export type Params = Record<string, string | number | boolean | null | undefined>;

export interface LogMeta {
  (nivel: "info" | "warn" | "error", evento: string, dados?: Record<string, unknown>): void;
}

export interface OpcoesCliente {
  config: MetaConfig;
  fetchImpl?: typeof fetch;
  /** Substituível nos testes para não esperar de verdade. */
  dormir?: (ms: number) => Promise<void>;
  log?: LogMeta;
  /** Tentativas totais por chamada (1 = sem retry). Padrão 5. */
  maxTentativas?: number;
  /** Espera base do backoff. Padrão 1 s (dobra a cada tentativa, com jitter). */
  backoffBaseMs?: number;
  /** Teto de uma espera individual. Acima disso lança MetaRateLimitError. */
  maxEsperaMs?: number;
  timeoutMs?: number;
  random?: () => number;
  /** Uso (%) a partir do qual começamos a desacelerar. Padrão 75. */
  limiarUsoPct?: number;
}

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

export class MetaApiError extends Error {
  readonly status: number;
  readonly code: number | null;
  readonly subcode: number | null;
  readonly tipo: string | null;
  readonly fbtraceId: string | null;
  readonly transitorio: boolean;
  constructor(
    mensagem: string,
    info: {
      status: number;
      code?: number | null;
      subcode?: number | null;
      tipo?: string | null;
      fbtraceId?: string | null;
      transitorio?: boolean;
    },
  ) {
    super(mensagem);
    this.name = "MetaApiError";
    this.status = info.status;
    this.code = info.code ?? null;
    this.subcode = info.subcode ?? null;
    this.tipo = info.tipo ?? null;
    this.fbtraceId = info.fbtraceId ?? null;
    this.transitorio = info.transitorio ?? false;
  }
}

/** Erro 190: token expirado, revogado ou invalidado. Exige ação humana. */
export class MetaTokenInvalidoError extends MetaApiError {
  constructor(mensagem: string, info: ConstructorParameters<typeof MetaApiError>[1]) {
    super(mensagem, info);
    this.name = "MetaTokenInvalidoError";
  }
}

/** Rate limit que não cabe numa espera dentro da execução: o job tenta depois. */
export class MetaRateLimitError extends MetaApiError {
  readonly retryAfterMs: number | null;
  constructor(
    mensagem: string,
    info: ConstructorParameters<typeof MetaApiError>[1],
    retryAfterMs: number | null,
  ) {
    super(mensagem, { ...info, transitorio: true });
    this.name = "MetaRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export function codigoEhRateLimit(code: number | null | undefined): boolean {
  if (code == null) return false;
  return (
    CODIGOS_RATE_LIMIT.has(code) ||
    (code >= FAIXA_RATE_LIMIT_BUC.min && code <= FAIXA_RATE_LIMIT_BUC.max)
  );
}

// ---------------------------------------------------------------------------
// Utilidades puras (exportadas para teste)
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

/** appsecret_proof = HMAC-SHA256(access_token, chave = app secret), em hex. */
export async function appsecretProof(accessToken: string, appSecret: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, encoder.encode(accessToken));
  return Array.from(new Uint8Array(assinatura), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Remove token, proof e segredos de qualquer texto antes de logar/lançar. */
export function higienizar(texto: string, segredos: string[] = []): string {
  let saida = texto.replace(/(access_token|appsecret_proof|client_secret)=[^&\s"']+/gi, "$1=***");
  saida = saida.replace(/(Bearer|OAuth)\s+[A-Za-z0-9_\-.]+/g, "$1 ***");
  for (const s of segredos) {
    if (s && s.length >= 8) saida = saida.split(s).join("***");
  }
  return saida;
}

export interface UsoMeta {
  /** Maior percentual de uso entre os headers recebidos (0–100). */
  maxPct: number;
  /** Maior tempo estimado até recuperar acesso, em ms (0 se não bloqueado). */
  regainMs: number;
}

function numero(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Lê X-App-Usage, X-Business-Use-Case-Usage e X-Ad-Account-Usage.
 * Todos trazem JSON; header ausente ou malformado é ignorado.
 */
export function lerUso(headers: Headers): UsoMeta {
  let maxPct = 0;
  let regainMs = 0;
  const lerJson = (nome: string): unknown => {
    const bruto = headers.get(nome);
    if (!bruto) return null;
    try {
      return JSON.parse(bruto);
    } catch {
      return null;
    }
  };

  const app = lerJson("x-app-usage") as Record<string, unknown> | null;
  if (app) {
    maxPct = Math.max(
      maxPct,
      numero(app.call_count),
      numero(app.total_cputime),
      numero(app.total_time),
    );
  }

  const conta = lerJson("x-ad-account-usage") as Record<string, unknown> | null;
  if (conta) {
    maxPct = Math.max(maxPct, numero(conta.acc_id_util_pct));
    // reset_time_duration vem em segundos.
    regainMs = Math.max(regainMs, numero(conta.reset_time_duration) * 1000);
  }

  const buc = lerJson("x-business-use-case-usage") as Record<string, unknown> | null;
  if (buc && typeof buc === "object") {
    for (const itens of Object.values(buc)) {
      if (!Array.isArray(itens)) continue;
      for (const item of itens as Record<string, unknown>[]) {
        maxPct = Math.max(
          maxPct,
          numero(item.call_count),
          numero(item.total_cputime),
          numero(item.total_time),
        );
        // estimated_time_to_regain_access vem em MINUTOS.
        regainMs = Math.max(regainMs, numero(item.estimated_time_to_regain_access) * 60_000);
      }
    }
  }
  return { maxPct, regainMs };
}

/** Espera preventiva: 0 abaixo do limiar, sobe até ~10 s perto de 100%. */
export function atrasoPorUso(maxPct: number, limiarPct = 75): number {
  if (maxPct < limiarPct) return 0;
  const fracao = Math.min(1, (maxPct - limiarPct) / Math.max(1, 100 - limiarPct));
  return Math.round(1_000 + fracao * 9_000);
}

// ---------------------------------------------------------------------------
// Configuração a partir do ambiente
// ---------------------------------------------------------------------------

/**
 * Lê META_ACCESS_TOKEN, META_APP_SECRET, META_APP_ID, META_AD_ACCOUNT_ID e
 * META_PAGE_ID. Só o token e o app secret são obrigatórios aqui; cada sync
 * exige os ativos de que precisa (`exigirAtivo`).
 */
export function configDoAmbiente(lerEnv: (nome: string) => string | undefined): MetaConfig {
  const accessToken = lerEnv("META_ACCESS_TOKEN") ?? "";
  const appSecret = lerEnv("META_APP_SECRET") ?? "";
  if (!accessToken || !appSecret) {
    throw new Error("META_ACCESS_TOKEN e META_APP_SECRET precisam estar configurados.");
  }
  const adAccountId = lerEnv("META_AD_ACCOUNT_ID") || undefined;
  if (adAccountId && !/^act_\d+$/.test(adAccountId)) {
    throw new Error("META_AD_ACCOUNT_ID deve ter o formato act_XXXX.");
  }
  return {
    accessToken,
    appSecret,
    appId: lerEnv("META_APP_ID") || undefined,
    adAccountId,
    pageId: lerEnv("META_PAGE_ID") || undefined,
  };
}

export function exigirAtivo<K extends "adAccountId" | "pageId" | "appId">(
  config: MetaConfig,
  chave: K,
): string {
  const valor = config[chave];
  if (!valor) {
    const env = { adAccountId: "META_AD_ACCOUNT_ID", pageId: "META_PAGE_ID", appId: "META_APP_ID" };
    throw new Error(`${env[chave]} não configurado.`);
  }
  return valor;
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

const logPadrao: LogMeta = (nivel, evento, dados) => {
  const linha = JSON.stringify({ origem: "meta-graph", evento, ...dados });
  if (nivel === "error") console.error(linha);
  else if (nivel === "warn") console.warn(linha);
  else console.log(linha);
};

const dormirPadrao = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Pagina<T> {
  data?: T[];
  paging?: { next?: string; cursors?: { after?: string } };
}

export interface OpcoesPaginacao {
  /** Teto de páginas, como trava de segurança contra loop. Padrão 1000. */
  maxPaginas?: number;
}

export class MetaGraphClient {
  readonly config: MetaConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly dormir: (ms: number) => Promise<void>;
  private readonly log: LogMeta;
  private readonly maxTentativas: number;
  private readonly backoffBaseMs: number;
  private readonly maxEsperaMs: number;
  private readonly timeoutMs: number;
  private readonly random: () => number;
  private readonly limiarUsoPct: number;
  private proof: string | null = null;
  /** Espera preventiva calculada a partir do último response. */
  private esperaPreventivaMs = 0;

  constructor(opcoes: OpcoesCliente) {
    this.config = opcoes.config;
    this.fetchImpl = opcoes.fetchImpl ?? fetch;
    this.dormir = opcoes.dormir ?? dormirPadrao;
    this.log = opcoes.log ?? logPadrao;
    this.maxTentativas = Math.max(1, opcoes.maxTentativas ?? 5);
    this.backoffBaseMs = opcoes.backoffBaseMs ?? 1_000;
    this.maxEsperaMs = opcoes.maxEsperaMs ?? 60_000;
    this.timeoutMs = opcoes.timeoutMs ?? 30_000;
    this.random = opcoes.random ?? Math.random;
    this.limiarUsoPct = opcoes.limiarUsoPct ?? 75;
  }

  private async obterProof(): Promise<string> {
    this.proof ??= await appsecretProof(this.config.accessToken, this.config.appSecret);
    return this.proof;
  }

  private higienizar(texto: string): string {
    return higienizar(texto, [this.config.accessToken, this.config.appSecret]);
  }

  /** GET num caminho relativo (ex.: "act_1/campaigns"). */
  async get<T = unknown>(caminho: string, params: Params = {}): Promise<T> {
    return this.requisitar<T>("GET", caminho, params);
  }

  /** POST (usado nos relatórios assíncronos de /insights). Params vão no corpo. */
  async post<T = unknown>(caminho: string, params: Params = {}): Promise<T> {
    return this.requisitar<T>("POST", caminho, params);
  }

  /**
   * Percorre todas as páginas seguindo paging.next e devolve uma página por
   * vez, para o chamador gravar sem acumular tudo na memória.
   */
  async *paginar<T = unknown>(
    caminho: string,
    params: Params = {},
    { maxPaginas = 1000 }: OpcoesPaginacao = {},
  ): AsyncGenerator<T[], void, void> {
    let atual: { caminho: string; params: Params } | null = { caminho, params };
    for (let i = 0; i < maxPaginas && atual; i++) {
      const pagina: Pagina<T> = await this.get<Pagina<T>>(atual.caminho, atual.params);
      const itens = pagina.data ?? [];
      if (itens.length > 0) yield itens;
      const proxima = pagina.paging?.next;
      atual = proxima ? this.destinoDaProxima(proxima) : null;
    }
    if (atual) {
      this.log("warn", "paginacao_truncada", { caminho, maxPaginas });
    }
  }

  async listarTudo<T = unknown>(
    caminho: string,
    params: Params = {},
    opcoes?: OpcoesPaginacao,
  ): Promise<T[]> {
    const todos: T[] = [];
    for await (const pagina of this.paginar<T>(caminho, params, opcoes)) todos.push(...pagina);
    return todos;
  }

  /**
   * Converte o paging.next em (caminho, params) próprios: confere o host,
   * descarta access_token/appsecret_proof embutidos e deixa o cliente assinar
   * de novo. Evita seguir URL arbitrária com o nosso token.
   */
  private destinoDaProxima(url: string): { caminho: string; params: Params } {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.hostname !== GRAPH_HOST) {
      throw new MetaApiError("paging.next aponta para host inesperado", { status: 0 });
    }
    // Remove o prefixo /vXX.X/ — o cliente aplica a própria versão.
    const caminho = u.pathname.replace(/^\/v\d+\.\d+\//, "").replace(/^\//, "");
    const params: Params = {};
    for (const [k, v] of u.searchParams) {
      if (k === "access_token" || k === "appsecret_proof") continue;
      params[k] = v;
    }
    return { caminho, params };
  }

  private async requisitar<T>(metodo: "GET" | "POST", caminho: string, params: Params): Promise<T> {
    const proof = await this.obterProof();
    const corpo = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      corpo.set(k, String(v));
    }
    corpo.set("access_token", this.config.accessToken);
    corpo.set("appsecret_proof", proof);

    const caminhoLimpo = caminho.replace(/^\/+/, "");
    const url =
      metodo === "GET"
        ? `${GRAPH_BASE}/${caminhoLimpo}?${corpo.toString()}`
        : `${GRAPH_BASE}/${caminhoLimpo}`;
    const init: RequestInit =
      metodo === "GET"
        ? { method: "GET" }
        : {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: corpo.toString(),
          };

    let ultimoErro: unknown;
    for (let tentativa = 1; tentativa <= this.maxTentativas; tentativa++) {
      if (this.esperaPreventivaMs > 0) {
        const espera = this.esperaPreventivaMs;
        this.esperaPreventivaMs = 0;
        this.log("info", "desacelerando_por_uso", { caminho: caminhoLimpo, esperaMs: espera });
        await this.dormir(espera);
      }

      const inicio = Date.now();
      let resposta: Response;
      try {
        resposta = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
      } catch (erro) {
        // Erro de rede / timeout: tratado como transitório.
        const msg = this.higienizar((erro as Error)?.message ?? String(erro));
        ultimoErro = new MetaApiError(`Falha de rede: ${msg}`, { status: 0, transitorio: true });
        if (tentativa < this.maxTentativas) {
          const espera = this.backoff(tentativa);
          this.log("warn", "retry_rede", { caminho: caminhoLimpo, tentativa, esperaMs: espera });
          await this.dormir(espera);
          continue;
        }
        break;
      }

      const uso = lerUso(resposta.headers);
      this.esperaPreventivaMs = atrasoPorUso(uso.maxPct, this.limiarUsoPct);

      if (resposta.ok) {
        this.log("info", "chamada_ok", {
          metodo,
          caminho: caminhoLimpo,
          status: resposta.status,
          ms: Date.now() - inicio,
          usoPct: uso.maxPct || undefined,
        });
        return (await resposta.json()) as T;
      }

      const erro = await this.lerErro(resposta);
      ultimoErro = erro;

      if (erro instanceof MetaTokenInvalidoError) {
        this.log("error", "token_invalido", {
          caminho: caminhoLimpo,
          code: erro.code,
          subcode: erro.subcode,
          fbtraceId: erro.fbtraceId,
        });
        throw erro;
      }
      if (!erro.transitorio) {
        this.log("error", "erro_api", {
          caminho: caminhoLimpo,
          status: erro.status,
          code: erro.code,
          subcode: erro.subcode,
          fbtraceId: erro.fbtraceId,
          mensagem: erro.message,
        });
        throw erro;
      }

      // Transitório ou rate limit.
      const ehRateLimit = codigoEhRateLimit(erro.code);
      const espera = Math.max(this.backoff(tentativa), uso.regainMs);
      if (espera > this.maxEsperaMs) {
        this.log("warn", "rate_limit_adiado", {
          caminho: caminhoLimpo,
          code: erro.code,
          retryAfterMs: espera,
        });
        throw new MetaRateLimitError(erro.message, {
          status: erro.status,
          code: erro.code,
          subcode: erro.subcode,
          tipo: erro.tipo,
          fbtraceId: erro.fbtraceId,
        }, espera);
      }
      if (tentativa < this.maxTentativas) {
        this.log("warn", ehRateLimit ? "retry_rate_limit" : "retry_transitorio", {
          caminho: caminhoLimpo,
          tentativa,
          code: erro.code,
          status: erro.status,
          esperaMs: espera,
        });
        await this.dormir(espera);
      }
    }

    this.log("error", "tentativas_esgotadas", { caminho: caminhoLimpo, tentativas: this.maxTentativas });
    if (ultimoErro instanceof MetaApiError && codigoEhRateLimit(ultimoErro.code)) {
      throw new MetaRateLimitError(ultimoErro.message, {
        status: ultimoErro.status,
        code: ultimoErro.code,
        subcode: ultimoErro.subcode,
        tipo: ultimoErro.tipo,
        fbtraceId: ultimoErro.fbtraceId,
      }, null);
    }
    throw ultimoErro instanceof Error ? ultimoErro : new Error("Falha desconhecida na Graph API");
  }

  /** Backoff exponencial com jitter: base * 2^(n-1) + [0, base * 2^(n-1)). */
  private backoff(tentativa: number): number {
    const base = this.backoffBaseMs * 2 ** (tentativa - 1);
    return Math.min(this.maxEsperaMs, Math.floor(base + this.random() * base));
  }

  private async lerErro(resposta: Response): Promise<MetaApiError> {
    let json: { error?: Record<string, unknown> } | null = null;
    try {
      json = await resposta.json();
    } catch {
      json = null;
    }
    const e = json?.error ?? {};
    const code = typeof e.code === "number" ? e.code : null;
    const subcode = typeof e.error_subcode === "number" ? e.error_subcode : null;
    const info = {
      status: resposta.status,
      code,
      subcode,
      tipo: typeof e.type === "string" ? e.type : null,
      fbtraceId: typeof e.fbtrace_id === "string" ? e.fbtrace_id : null,
    };
    const mensagem = this.higienizar(
      typeof e.message === "string" ? e.message : `HTTP ${resposta.status}`,
    );
    if (code === CODIGO_TOKEN_INVALIDO) return new MetaTokenInvalidoError(mensagem, info);
    const transitorio =
      codigoEhRateLimit(code) ||
      (code != null && CODIGOS_TRANSITORIOS.has(code)) ||
      e.is_transient === true ||
      resposta.status === 429 ||
      resposta.status >= 500;
    return new MetaApiError(mensagem, { ...info, transitorio });
  }
}

// ---------------------------------------------------------------------------
// Verificação de boot
// ---------------------------------------------------------------------------

export interface ContasAcessiveis {
  pageId: string;
  pageName: string | null;
  igUserId: string | null;
  igUsername: string | null;
  contasAnuncio: { id: string; nome: string | null; status: number | null }[];
}

/**
 * Descobre o ID do Instagram (GET /{page_id}?fields=instagram_business_account),
 * lista as contas de anúncio acessíveis ao token e loga tudo (sem segredos).
 * Falha de uma parte não impede a outra: o log diz o que ficou de fora.
 */
export async function verificarConexao(
  cliente: MetaGraphClient,
  log: LogMeta = logPadrao,
): Promise<ContasAcessiveis> {
  const pageId = exigirAtivo(cliente.config, "pageId");

  const pagina = await cliente.get<{
    id: string;
    name?: string;
    instagram_business_account?: { id: string };
  }>(pageId, { fields: "name,instagram_business_account" });
  const igUserId = pagina.instagram_business_account?.id ?? null;

  let igUsername: string | null = null;
  if (igUserId) {
    try {
      const ig = await cliente.get<{ username?: string }>(igUserId, { fields: "username" });
      igUsername = ig.username ?? null;
    } catch (e) {
      if (e instanceof MetaTokenInvalidoError) throw e;
      log("warn", "boot_instagram_sem_username", { igUserId, erro: (e as Error).message });
    }
  } else {
    log("warn", "boot_pagina_sem_instagram", { pageId });
  }

  let contasAnuncio: ContasAcessiveis["contasAnuncio"] = [];
  try {
    const contas = await cliente.listarTudo<{ id: string; name?: string; account_status?: number }>(
      "me/adaccounts",
      { fields: "name,account_status", limit: 100 },
    );
    contasAnuncio = contas.map((c) => ({
      id: c.id,
      nome: c.name ?? null,
      status: c.account_status ?? null,
    }));
  } catch (e) {
    if (e instanceof MetaTokenInvalidoError) throw e;
    log("warn", "boot_sem_contas_anuncio", { erro: (e as Error).message });
  }

  const resultado: ContasAcessiveis = {
    pageId,
    pageName: pagina.name ?? null,
    igUserId,
    igUsername,
    contasAnuncio,
  };
  log("info", "boot_contas_acessiveis", { ...resultado });

  const configurada = cliente.config.adAccountId;
  if (configurada && !contasAnuncio.some((c) => c.id === configurada)) {
    log("warn", "boot_conta_anuncio_inacessivel", { adAccountId: configurada });
  }
  return resultado;
}
