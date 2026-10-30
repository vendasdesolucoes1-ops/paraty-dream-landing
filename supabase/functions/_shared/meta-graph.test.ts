// Rodar: node --test "supabase/functions/_shared/meta-graph.test.ts"   (Node 22.18+)
//
// Cobre as regras do cliente da Graph API: assinatura (appsecret_proof),
// paginação, retry/backoff, rate limit por header, erro 190 e ausência de
// segredos nos logs. A rede é substituída por um fetch de mentira.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appsecretProof,
  atrasoPorUso,
  codigoEhRateLimit,
  configDoAmbiente,
  GRAPH_BASE,
  GRAPH_VERSION,
  higienizar,
  lerUso,
  MetaApiError,
  MetaGraphClient,
  MetaRateLimitError,
  MetaTokenInvalidoError,
  verificarConexao,
} from "./meta-graph.ts";

const TOKEN = "EAAtokenSecretoDeTeste1234567890";
const SEGREDO = "segredo-do-app-abcdef123456";

interface Resposta {
  status?: number;
  body: unknown;
  headers?: Record<string, string>;
}

function montar(respostas: Resposta[], extra: Partial<ConstructorParameters<typeof MetaGraphClient>[0]> = {}) {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const esperas: number[] = [];
  const logs: { nivel: string; evento: string; dados?: Record<string, unknown> }[] = [];
  const fila = [...respostas];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    chamadas.push({ url: String(url), init });
    const r = fila.shift();
    if (!r) throw new Error("fetch sem resposta enfileirada");
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json", ...(r.headers ?? {}) },
    });
  }) as typeof fetch;
  const cliente = new MetaGraphClient({
    config: { accessToken: TOKEN, appSecret: SEGREDO, pageId: "PAGE1", adAccountId: "act_1" },
    fetchImpl,
    dormir: async (ms) => {
      esperas.push(ms);
    },
    log: (nivel, evento, dados) => logs.push({ nivel, evento, dados }),
    random: () => 0,
    ...extra,
  });
  return { cliente, chamadas, esperas, logs };
}

const erroMeta = (code: number, message = "falha", extra: Record<string, unknown> = {}) => ({
  error: { message, type: "OAuthException", code, fbtrace_id: "TRACE", ...extra },
});

// ---------------------------------------------------------------------------

test("a versão da Graph API fica numa constante só", () => {
  assert.match(GRAPH_VERSION, /^v\d+\.\d+$/);
  assert.equal(GRAPH_BASE, `https://graph.facebook.com/${GRAPH_VERSION}`);
});

test("appsecret_proof é o HMAC-SHA256 do token com o app secret", async () => {
  // Vetor conhecido (RFC 4231 / Wikipedia): chave "key", mensagem da raposa.
  const proof = await appsecretProof("The quick brown fox jumps over the lazy dog", "key");
  assert.equal(proof, "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
});

test("toda chamada leva access_token e appsecret_proof (GET e POST)", async () => {
  const { cliente, chamadas } = montar([{ body: { id: "1" } }, { body: { report_run_id: "9" } }]);
  await cliente.get("act_1", { fields: "currency" });
  await cliente.post("act_1/insights", { level: "ad" });

  const proof = await appsecretProof(TOKEN, SEGREDO);
  const get = new URL(chamadas[0].url);
  assert.equal(get.origin + get.pathname, `${GRAPH_BASE}/act_1`);
  assert.equal(get.searchParams.get("access_token"), TOKEN);
  assert.equal(get.searchParams.get("appsecret_proof"), proof);
  assert.equal(get.searchParams.get("fields"), "currency");

  assert.equal(chamadas[1].init.method, "POST");
  assert.equal(chamadas[1].url, `${GRAPH_BASE}/act_1/insights`); // sem segredo na URL
  const corpo = new URLSearchParams(String(chamadas[1].init.body));
  assert.equal(corpo.get("appsecret_proof"), proof);
  assert.equal(corpo.get("level"), "ad");
});

test("paginação segue paging.next até o fim e reassina cada página", async () => {
  const proof = await appsecretProof(TOKEN, SEGREDO);
  const { cliente, chamadas } = montar([
    {
      body: {
        data: [{ id: "a" }, { id: "b" }],
        paging: {
          // O next da Meta traz token/proof próprios: devem ser descartados.
          next: `https://graph.facebook.com/${GRAPH_VERSION}/act_1/campaigns?fields=name&after=C1&access_token=VELHO&appsecret_proof=VELHO`,
        },
      },
    },
    {
      body: {
        data: [{ id: "c" }],
        paging: { next: `https://graph.facebook.com/${GRAPH_VERSION}/act_1/campaigns?fields=name&after=C2` },
      },
    },
    { body: { data: [{ id: "d" }] } },
  ]);

  const todos = await cliente.listarTudo<{ id: string }>("act_1/campaigns", { fields: "name" });
  assert.deepEqual(
    todos.map((t) => t.id),
    ["a", "b", "c", "d"],
  );
  assert.equal(chamadas.length, 3);
  const segunda = new URL(chamadas[1].url);
  assert.equal(segunda.pathname, `/${GRAPH_VERSION}/act_1/campaigns`);
  assert.equal(segunda.searchParams.get("after"), "C1");
  assert.equal(segunda.searchParams.get("access_token"), TOKEN);
  assert.equal(segunda.searchParams.get("appsecret_proof"), proof);
});

test("paginação recusa paging.next de outro host", async () => {
  const { cliente, chamadas } = montar([
    { body: { data: [{ id: "a" }], paging: { next: "https://evil.example.com/v26.0/x?after=1" } } },
  ]);
  await assert.rejects(() => cliente.listarTudo("act_1/ads"), MetaApiError);
  assert.equal(chamadas.length, 1, "não pode ter seguido a URL estranha");
});

test("página vazia termina a paginação sem erro", async () => {
  const { cliente } = montar([{ body: { data: [] } }]);
  assert.deepEqual(await cliente.listarTudo("act_1/ads"), []);
});

test("rate limit (código 17) repete com backoff exponencial até dar certo", async () => {
  const { cliente, esperas, chamadas } = montar([
    { status: 400, body: erroMeta(17, "User request limit reached") },
    { status: 400, body: erroMeta(80004, "Too many calls") },
    { body: { ok: true } },
  ]);
  const r = await cliente.get<{ ok: boolean }>("act_1");
  assert.equal(r.ok, true);
  assert.equal(chamadas.length, 3);
  assert.deepEqual(esperas, [1000, 2000]); // base 1 s, dobra; jitter zerado no teste
});

test("erro 5xx e erro de rede também são repetidos", async () => {
  const { cliente, chamadas } = montar([
    { status: 503, body: {} },
    { status: 500, body: erroMeta(2, "Service temporarily unavailable") },
    { body: { ok: 1 } },
  ]);
  assert.deepEqual(await cliente.get("act_1"), { ok: 1 });
  assert.equal(chamadas.length, 3);

  const logs: string[] = [];
  let n = 0;
  const c = new MetaGraphClient({
    config: { accessToken: TOKEN, appSecret: SEGREDO },
    fetchImpl: (async () => {
      if (n++ === 0) throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ ok: 2 }), { status: 200 });
    }) as typeof fetch,
    dormir: async () => {},
    log: (_n, e) => logs.push(e),
    random: () => 0,
  });
  assert.deepEqual(await c.get("x"), { ok: 2 });
  assert.ok(logs.includes("retry_rede"));
});

test("tentativas esgotadas em rate limit lançam MetaRateLimitError", async () => {
  const { cliente, chamadas } = montar(
    Array.from({ length: 3 }, () => ({ status: 400, body: erroMeta(4, "App limit") })),
    { maxTentativas: 3 },
  );
  await assert.rejects(
    () => cliente.get("act_1"),
    (e: unknown) => e instanceof MetaRateLimitError && e.code === 4,
  );
  assert.equal(chamadas.length, 3);
});

test("erro 190 não repete e vira MetaTokenInvalidoError", async () => {
  const { cliente, chamadas, esperas, logs } = montar([
    { status: 400, body: erroMeta(190, "Error validating access token: Session has expired", { error_subcode: 463 }) },
  ]);
  await assert.rejects(
    () => cliente.get("act_1"),
    (e: unknown) => e instanceof MetaTokenInvalidoError && e.code === 190 && e.subcode === 463,
  );
  assert.equal(chamadas.length, 1);
  assert.equal(esperas.length, 0);
  assert.ok(logs.some((l) => l.nivel === "error" && l.evento === "token_invalido"));
});

test("erro de parâmetro (100) não é transitório: falha direto", async () => {
  const { cliente, chamadas } = montar([{ status: 400, body: erroMeta(100, "Invalid parameter") }]);
  await assert.rejects(
    () => cliente.get("act_1"),
    (e: unknown) => e instanceof MetaApiError && !(e instanceof MetaRateLimitError) && !e.transitorio,
  );
  assert.equal(chamadas.length, 1);
});

test("uso alto nos headers faz o cliente desacelerar antes da próxima chamada", async () => {
  const { cliente, esperas } = montar([
    {
      body: { id: "1" },
      headers: { "x-app-usage": JSON.stringify({ call_count: 95, total_cputime: 10, total_time: 10 }) },
    },
    { body: { id: "2" } },
  ]);
  await cliente.get("a");
  assert.deepEqual(esperas, []);
  await cliente.get("b");
  assert.equal(esperas.length, 1);
  assert.ok(esperas[0] >= 1000 && esperas[0] <= 10_000);
});

test("bloqueio longo (estimated_time_to_regain_access) adia em vez de esperar dentro da execução", async () => {
  const buc = JSON.stringify({
    "1819368239260446": [
      { type: "ads_management", call_count: 100, total_cputime: 100, total_time: 100, estimated_time_to_regain_access: 15 },
    ],
  });
  const { cliente, esperas } = montar([
    { status: 400, body: erroMeta(80000, "Ads management limit"), headers: { "x-business-use-case-usage": buc } },
  ]);
  await assert.rejects(
    () => cliente.get("act_1/insights"),
    (e: unknown) => e instanceof MetaRateLimitError && e.retryAfterMs === 15 * 60_000,
  );
  assert.equal(esperas.length, 0);
});

test("lerUso lê os três headers e ignora JSON malformado", () => {
  const h = new Headers({
    "x-app-usage": '{"call_count":12,"total_cputime":40,"total_time":7}',
    "x-ad-account-usage": '{"acc_id_util_pct":55,"reset_time_duration":120}',
    "x-business-use-case-usage": '{"1":[{"call_count":3,"total_cputime":2,"total_time":1,"estimated_time_to_regain_access":5}]}',
  });
  assert.deepEqual(lerUso(h), { maxPct: 55, regainMs: 5 * 60_000 });
  assert.deepEqual(lerUso(new Headers({ "x-app-usage": "{nao-e-json" })), { maxPct: 0, regainMs: 0 });
  assert.equal(atrasoPorUso(50), 0);
  assert.ok(atrasoPorUso(100) > atrasoPorUso(80));
});

test("códigos de rate limit incluem a faixa 80000–80014 e só ela", () => {
  for (const c of [4, 17, 32, 613, 80000, 80007, 80014]) assert.equal(codigoEhRateLimit(c), true, String(c));
  for (const c of [100, 190, 79999, 80015, null, undefined]) assert.equal(codigoEhRateLimit(c), false, String(c));
});

test("token e app secret nunca aparecem em logs nem em mensagens de erro", async () => {
  const { cliente, logs } = montar([
    {
      status: 400,
      body: erroMeta(100, `Invalid request access_token=${TOKEN} appsecret_proof=abc secret ${SEGREDO}`),
    },
  ]);
  let mensagem = "";
  try {
    await cliente.get("act_1", { fields: "x" });
  } catch (e) {
    mensagem = (e as Error).message;
  }
  const tudo = JSON.stringify(logs) + mensagem;
  assert.ok(!tudo.includes(TOKEN), "token vazou");
  assert.ok(!tudo.includes(SEGREDO), "app secret vazou");
  assert.ok(!tudo.includes("appsecret_proof=abc"), "proof vazou");
  assert.ok(logs.length > 0);
  // O log nunca traz a query string da chamada: só pode sobrar o valor mascarado.
  assert.ok(!/access_token=(?!\*\*\*)/.test(JSON.stringify(logs) + mensagem));
});

test("higienizar mascara token em texto livre", () => {
  assert.equal(higienizar("GET ?access_token=abc123&x=1"), "GET ?access_token=***&x=1");
  assert.equal(higienizar(`falhou com ${TOKEN}`, [TOKEN]), "falhou com ***");
  assert.equal(higienizar("Authorization: Bearer abc.def"), "Authorization: Bearer ***");
});

test("verificarConexao descobre o Instagram e lista as contas de anúncio", async () => {
  const { cliente, chamadas, logs } = montar([
    { body: { id: "PAGE1", name: "Moradas de Paraty", instagram_business_account: { id: "IG1" } } },
    { body: { id: "IG1", username: "moradasdeparaty" } },
    { body: { data: [{ id: "act_1", name: "VS - Moradas", account_status: 1 }] } },
  ]);
  const r = await verificarConexao(cliente, (n, e, d) => logs.push({ nivel: n, evento: e, dados: d }));
  assert.equal(r.igUserId, "IG1");
  assert.equal(r.igUsername, "moradasdeparaty");
  assert.deepEqual(r.contasAnuncio, [{ id: "act_1", nome: "VS - Moradas", status: 1 }]);
  const primeira = new URL(chamadas[0].url);
  assert.equal(primeira.pathname, `/${GRAPH_VERSION}/PAGE1`);
  assert.equal(primeira.searchParams.get("fields"), "name,instagram_business_account");
  assert.ok(logs.some((l) => l.evento === "boot_contas_acessiveis"));
  assert.ok(!JSON.stringify(logs).includes(TOKEN));
});

test("verificarConexao avisa quando a página não tem Instagram e segue", async () => {
  const { cliente, logs } = montar([
    { body: { id: "PAGE1", name: "Moradas" } },
    { body: { data: [] } },
  ]);
  const r = await verificarConexao(cliente, (n, e, d) => logs.push({ nivel: n, evento: e, dados: d }));
  assert.equal(r.igUserId, null);
  assert.ok(logs.some((l) => l.evento === "boot_pagina_sem_instagram"));
  assert.ok(logs.some((l) => l.evento === "boot_conta_anuncio_inacessivel"));
});

test("verificarConexao propaga erro 190 (token precisa ser trocado)", async () => {
  const { cliente } = montar([{ status: 400, body: erroMeta(190, "token revogado") }]);
  await assert.rejects(() => verificarConexao(cliente, () => {}), MetaTokenInvalidoError);
});

test("configDoAmbiente exige token e secret e valida o formato act_", () => {
  const env = (m: Record<string, string>) => (n: string) => m[n];
  assert.throws(() => configDoAmbiente(env({})), /META_ACCESS_TOKEN/);
  assert.throws(
    () => configDoAmbiente(env({ META_ACCESS_TOKEN: "t", META_APP_SECRET: "s", META_AD_ACCOUNT_ID: "123" })),
    /act_XXXX/,
  );
  const c = configDoAmbiente(
    env({ META_ACCESS_TOKEN: "t", META_APP_SECRET: "s", META_AD_ACCOUNT_ID: "act_9", META_PAGE_ID: "p" }),
  );
  assert.equal(c.adAccountId, "act_9");
  assert.equal(c.pageId, "p");
});
