// Rodar: node --test "supabase/functions/_shared/*.test.ts"
//
// Cada campo de estilo do painel do agente precisa mudar o prompt (issue #61).

import { test } from "node:test";
import assert from "node:assert/strict";
import { ESTILO_PADRAO, TONS_DE_VOZ, blocoEstiloAgente } from "./estilo-agente.ts";

test("valores padrão não mudam o prompt", () => {
  assert.equal(blocoEstiloAgente(ESTILO_PADRAO), "");
  assert.equal(blocoEstiloAgente(null), "");
  assert.equal(blocoEstiloAgente({}), "");
});

test("tom_voz: cada tom fora do padrão gera instrução própria", () => {
  const blocos = new Set<string>();
  for (const tom of TONS_DE_VOZ) {
    if (tom === ESTILO_PADRAO.tom_voz) continue;
    const bloco = blocoEstiloAgente({ ...ESTILO_PADRAO, tom_voz: tom });
    assert.match(bloco, /PREFERÊNCIAS DE ESTILO/);
    assert.match(bloco, /Tom de voz:/);
    blocos.add(bloco);
  }
  assert.equal(blocos.size, TONS_DE_VOZ.length - 1, "tons diferentes, instruções diferentes");
  assert.match(blocoEstiloAgente({ tom_voz: "formal" }), /formal/);
  assert.match(blocoEstiloAgente({ tom_voz: "informal" }), /informal/);
  assert.match(blocoEstiloAgente({ tom_voz: "amigavel" }), /amigável/);
});

test("tom_voz inválido é tratado como o padrão", () => {
  assert.equal(blocoEstiloAgente({ tom_voz: "sarcastico" }), "");
  assert.equal(blocoEstiloAgente({ tom_voz: null }), "");
});

test("usar_emojis: liberar acrescenta a exceção à regra de nenhum emoji", () => {
  const bloco = blocoEstiloAgente({ ...ESTILO_PADRAO, usar_emojis: true });
  assert.match(bloco, /Emojis: a equipe liberou/);
  assert.match(bloco, /NENHUM emoji/);
  assert.equal(blocoEstiloAgente({ ...ESTILO_PADRAO, usar_emojis: false }), "");
});

test("ser_breve: desligar pede respostas mais completas, mantendo o ||", () => {
  const bloco = blocoEstiloAgente({ ...ESTILO_PADRAO, ser_breve: false });
  assert.match(bloco, /respostas mais completas/);
  assert.match(bloco, /\|\|/);
  assert.equal(blocoEstiloAgente({ ...ESTILO_PADRAO, ser_breve: true }), "");
});

test("campos combinados: uma linha por preferência, um cabeçalho só", () => {
  const bloco = blocoEstiloAgente({ tom_voz: "informal", usar_emojis: true, ser_breve: false });
  assert.equal(bloco.match(/PREFERÊNCIAS DE ESTILO/g)?.length, 1);
  assert.equal(bloco.split("\n").filter((l) => l.startsWith("- ")).length, 3);
});
