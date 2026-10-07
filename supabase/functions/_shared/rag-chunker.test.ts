// Rodar: node --test "supabase/functions/_shared/*.test.ts"   (Node 22.18+; Bun e Deno também servem)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dividirEmTrechos, textoParaEmbedding, MAX_CHARS_TRECHO } from "./rag-chunker.ts";

/** A base real (v3.0), tal como a migration a grava no banco. */
function baseReal(): string {
  const sql = readFileSync(
    new URL("../../migrations/20260806000000_rag_sem_precos.sql", import.meta.url),
    "utf8",
  );
  const m = /update configuracoes set valor = \$rag\$([\s\S]*?)\$rag\$/.exec(sql);
  assert.ok(m, "bloco $rag$ não encontrado na migration");
  return m[1];
}

test("a base real vira trechos que respeitam o limite", () => {
  const { trechos } = dividirEmTrechos(baseReal());
  assert.ok(trechos.length >= 12, `esperava ao menos 12 trechos, veio ${trechos.length}`);
  for (const t of trechos) {
    assert.ok(
      t.conteudo.length <= MAX_CHARS_TRECHO * 1.25,
      `trecho ${t.ordem} (${t.secao}) com ${t.conteudo.length} chars`,
    );
  }
  assert.deepEqual(
    trechos.map((t) => t.ordem),
    trechos.map((_, i) => i),
  );
});

test("o cabeçalho de metadados do documento não vira trecho", () => {
  const { titulo, trechos } = dividirEmTrechos(baseReal());
  assert.match(titulo, /Moradas de Paraty/);
  const todo = trechos.map((t) => t.conteudo).join("\n");
  assert.ok(!todo.includes("injetada no prompt"));
  assert.ok(!todo.includes("Versão 3.0"));
});

test("cada trecho carrega o caminho da seção", () => {
  const { trechos } = dividirEmTrechos(baseReal());
  const esgoto = trechos.find((t) => t.conteudo.includes("fossa séptica"));
  assert.ok(esgoto);
  assert.match(esgoto.secao, /INFRAESTRUTURA.*Esgotamento/);
});

test("tabela longa quebra por linhas repetindo o cabeçalho", () => {
  const { trechos } = dividirEmTrechos(baseReal());
  const objecoes = trechos.filter((t) => t.secao.includes("Objeções"));
  assert.ok(objecoes.length >= 2, "a tabela de objeções deveria quebrar");
  for (const t of objecoes) {
    assert.ok(t.conteudo.startsWith("| Objeção | Resposta |"), `sem cabeçalho: ${t.conteudo}`);
    assert.ok(t.conteudo.split("\n")[1].includes("---"));
  }
  // nenhuma linha foi perdida na quebra
  const linhas = objecoes.flatMap((t) => t.conteudo.split("\n").slice(2));
  assert.equal(linhas.length, 9);
});

test("nenhum conteúdo da base se perde", () => {
  const original = baseReal();
  const { trechos } = dividirEmTrechos(original);
  const reconstruido = trechos.map((t) => t.conteudo).join("\n");
  for (const marcador of [
    "37.489.760/0001-14",
    "118.574,11m²",
    "Espaço Pet",
    "Já entregue com asfalto, água e iluminação",
    "financiamento direto com o loteador",
    "Quanto custa?",
  ]) {
    assert.ok(reconstruido.includes(marcador), `perdeu: ${marcador}`);
  }
});

test("documento sem cabeçalho nem títulos vira trechos com rótulo padrão", () => {
  const { trechos } = dividirEmTrechos("Primeiro parágrafo.\n\nSegundo parágrafo.");
  assert.equal(trechos.length, 1);
  assert.equal(trechos[0].secao, "Documento");
});

test("texto vazio não gera trechos", () => {
  assert.deepEqual(dividirEmTrechos("").trechos, []);
  assert.deepEqual(dividirEmTrechos("   \n\n  ").trechos, []);
});

test("parágrafo gigante é quebrado sem passar do limite", () => {
  const frase = "O loteamento tem infraestrutura completa entregue pelo incorporador. ";
  const { trechos } = dividirEmTrechos(`## Seção\n\n${frase.repeat(60)}`);
  assert.ok(trechos.length > 1);
  for (const t of trechos) assert.ok(t.conteudo.length <= MAX_CHARS_TRECHO * 1.25);
});

test("o texto embedado leva a seção, mas não o nome do documento", () => {
  assert.equal(textoParaEmbedding("A > B", "corpo"), "A > B\n\ncorpo");
});
