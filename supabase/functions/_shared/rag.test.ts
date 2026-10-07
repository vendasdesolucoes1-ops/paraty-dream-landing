// Rodar: node --test "supabase/functions/_shared/*.test.ts"   (Node 22.18+; Bun e Deno também servem)
//
// Cobre a decisão que mais importa do RAG: quando a Sophia usa os trechos e
// quando recua para a base inteira. A OpenAI e o banco são substituídos por
// dublês — o que se testa é a regra, não a rede.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  formatarTrechos,
  gerarEmbeddings,
  montarConsultaRag,
  resolverConhecimento,
  trechoRelevante,
  vetorParaSql,
  type TrechoRecuperado,
} from "./rag.ts";

const BASE = "# BASE COMPLETA\n\ntexto inteiro";

function trecho(p: Partial<TrechoRecuperado>): TrechoRecuperado {
  return {
    chunk_id: "c1",
    documento: "rag_conhecimento",
    ordem: 0,
    secao: "1. Identidade",
    conteudo: "conteúdo",
    similaridade: 0.5,
    rank_vetor: 1,
    rank_texto: null,
    score: 0.1,
    ...p,
  };
}

/** Cliente Supabase mínimo: só rpc() e from().insert(). */
function bancoFalso(rpc: () => Promise<{ data: unknown; error: { message: string } | null }>) {
  return { rpc, from: () => ({ insert: async () => ({ error: null }) }) } as never;
}

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

function openaiRetorna(embedding = [0.1, 0.2, 0.3]) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: [{ index: 0, embedding }] }), { status: 200 })) as never;
}

// ---------------------------------------------------------------------------

test("montarConsultaRag: pergunta longa leva só a fala anterior do lead", () => {
  const consulta = montarConsultaRag("Qual a metragem dos lotes disponíveis?", [
    { role: "user", content: "Queria algo pequeno" },
    { role: "assistant", content: "Claro! Me conta, é pra morar?" },
  ]);
  assert.match(consulta, /^Qual a metragem/);
  assert.match(consulta, /Queria algo pequeno/);
  assert.doesNotMatch(consulta, /é pra morar/);
});

test("montarConsultaRag: resposta curta herda o assunto da última fala da Sophia", () => {
  const consulta = montarConsultaRag("sim", [
    { role: "assistant", content: "Quer saber como funciona o esgoto?" },
  ]);
  assert.match(consulta, /esgoto/);
});

test("montarConsultaRag: não duplica a mensagem que já está no histórico", () => {
  const msg = "Tem área verde no loteamento?";
  const consulta = montarConsultaRag(msg, [{ role: "user", content: msg }]);
  assert.equal(consulta, msg);
});

test("montarConsultaRag: limita o tamanho", () => {
  assert.ok(montarConsultaRag("a".repeat(2000), []).length <= 600);
});

// ---------------------------------------------------------------------------

test("trechoRelevante: cosseno alto basta", () => {
  assert.ok(trechoRelevante([trecho({ similaridade: 0.4 })]));
});

test("trechoRelevante: cosseno médio exige acerto na busca textual", () => {
  assert.ok(!trechoRelevante([trecho({ similaridade: 0.28, rank_texto: null })]));
  assert.ok(trechoRelevante([trecho({ similaridade: 0.28, rank_texto: 1 })]));
});

test("trechoRelevante: cosseno muito baixo nunca passa", () => {
  assert.ok(!trechoRelevante([trecho({ similaridade: 0.1, rank_texto: 1 })]));
  assert.ok(!trechoRelevante([]));
});

// ---------------------------------------------------------------------------

test("formatarTrechos: ordem do documento, não do score, com a seção de cada um", () => {
  const texto = formatarTrechos([
    trecho({ ordem: 5, secao: "5. Diferenciais", conteudo: "B" }),
    trecho({ ordem: 1, secao: "1. Identidade", conteudo: "A" }),
  ]);
  assert.equal(texto, "### 1. Identidade\nA\n\n### 5. Diferenciais\nB");
});

test("vetorParaSql: literal do pgvector, com casas limitadas", () => {
  assert.equal(vetorParaSql([0.123456789, -1, 0]), "[0.1234568,-1,0]");
});

// ---------------------------------------------------------------------------

test("resolverConhecimento: busca com bom resultado usa só os trechos", async () => {
  openaiRetorna();
  const banco = bancoFalso(async () => ({
    data: [trecho({ similaridade: 0.6, conteudo: "fossa séptica" })],
    error: null,
  }));
  const r = await resolverConhecimento(banco, "sk-test", {
    baseCompleta: BASE,
    modoConfigurado: "busca",
    message: "Como funciona o esgoto?",
    history: [],
  });
  assert.equal(r.modo, "busca");
  assert.equal(r.motivoRecuo, null);
  assert.match(r.texto, /fossa séptica/);
  assert.doesNotMatch(r.texto, /BASE COMPLETA/);
});

test("resolverConhecimento: rag_modo = completo desliga a busca sem chamar a OpenAI", async () => {
  globalThis.fetch = (async () => {
    throw new Error("não deveria chamar a OpenAI");
  }) as never;
  const r = await resolverConhecimento(
    bancoFalso(async () => ({ data: [], error: null })),
    "sk-test",
    { baseCompleta: BASE, modoConfigurado: " Completo ", message: "oi", history: [] },
  );
  assert.equal(r.modo, "completo");
  assert.equal(r.motivoRecuo, "desativado");
  assert.equal(r.texto, BASE);
});

test("resolverConhecimento: sem chave da OpenAI recua para a base inteira", async () => {
  const r = await resolverConhecimento(
    bancoFalso(async () => ({ data: [], error: null })),
    "",
    { baseCompleta: BASE, modoConfigurado: "busca", message: "oi", history: [] },
  );
  assert.equal(r.texto, BASE);
  assert.equal(r.motivoRecuo, "desativado");
});

test("resolverConhecimento: índice vazio/desatualizado recua para a base inteira", async () => {
  openaiRetorna();
  const r = await resolverConhecimento(
    bancoFalso(async () => ({ data: [], error: null })),
    "sk-test",
    { baseCompleta: BASE, modoConfigurado: "busca", message: "Tem área verde?", history: [] },
  );
  assert.equal(r.modo, "completo");
  assert.equal(r.motivoRecuo, "indice_indisponivel");
  assert.equal(r.texto, BASE);
});

test("resolverConhecimento: erro do banco recua para a base inteira", async () => {
  openaiRetorna();
  const r = await resolverConhecimento(
    bancoFalso(async () => ({ data: null, error: { message: "boom" } })),
    "sk-test",
    { baseCompleta: BASE, modoConfigurado: "busca", message: "Tem área verde?", history: [] },
  );
  assert.equal(r.motivoRecuo, "erro");
  assert.equal(r.texto, BASE);
});

test("resolverConhecimento: falha da OpenAI recua para a base inteira", async () => {
  globalThis.fetch = (async () => new Response("chave inválida", { status: 401 })) as never;
  const r = await resolverConhecimento(
    bancoFalso(async () => ({ data: [], error: null })),
    "sk-ruim",
    { baseCompleta: BASE, modoConfigurado: "busca", message: "Tem área verde?", history: [] },
  );
  assert.equal(r.motivoRecuo, "erro");
  assert.equal(r.texto, BASE);
});

test("resolverConhecimento: conversa solta (similaridade baixa) recua para a base inteira", async () => {
  openaiRetorna();
  const r = await resolverConhecimento(
    bancoFalso(async () => ({ data: [trecho({ similaridade: 0.3 })], error: null })),
    "sk-test",
    { baseCompleta: BASE, modoConfigurado: "busca", message: "Obrigado!", history: [] },
  );
  assert.equal(r.motivoRecuo, "similaridade_baixa");
  assert.equal(r.texto, BASE);
});

// ---------------------------------------------------------------------------

test("gerarEmbeddings: 4xx (exceto 429) não é repetido", async () => {
  let chamadas = 0;
  globalThis.fetch = (async () => {
    chamadas++;
    return new Response("chave inválida", { status: 401 });
  }) as never;
  await assert.rejects(() => gerarEmbeddings("sk-ruim", ["a"]), /OpenAI 401/);
  assert.equal(chamadas, 1);
});

test("gerarEmbeddings: 429 é repetido e depois dá certo", async () => {
  let chamadas = 0;
  globalThis.fetch = (async () => {
    chamadas++;
    return chamadas < 2
      ? new Response("limite", { status: 429 })
      : new Response(JSON.stringify({ data: [{ index: 0, embedding: [1] }] }), { status: 200 });
  }) as never;
  const r = await gerarEmbeddings("sk-test", ["a"]);
  assert.deepEqual(r, [[1]]);
  assert.equal(chamadas, 2);
});

test("gerarEmbeddings: devolve na ordem dos textos mesmo se a API embaralhar", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        data: [
          { index: 1, embedding: [2] },
          { index: 0, embedding: [1] },
        ],
      }),
      { status: 200 },
    )) as never;
  assert.deepEqual(await gerarEmbeddings("sk-test", ["a", "b"]), [[1], [2]]);
});
