// Rodar: node --test "supabase/functions/_shared/*.test.ts"

import { test } from "node:test";
import assert from "node:assert/strict";
import { linhaCondicao, violacoesComerciais } from "./fatos-comerciais.ts";

const FATOS = { entrada_percentual: "10", parcelas_max: "240" };

test("condição aprovada passa", () => {
  assert.deepEqual(violacoesComerciais("Entrada de 10% e saldo em 240x.", FATOS), []);
});

test("parcela divergente é barrada", () => {
  assert.deepEqual(violacoesComerciais("Saldo em até 180x", FATOS), ["180x"]);
});

test("valor em reais nunca passa", () => {
  assert.deepEqual(violacoesComerciais("Lotes a partir de R$ 150 mil", FATOS), ["valor em reais"]);
});

test("sem fato aprovado, qualquer condição é barrada e o prompt manda não citar", () => {
  assert.deepEqual(violacoesComerciais("10% de entrada", {}), ["10%"]);
  assert.match(linhaCondicao({}), /NÃO CITE/);
});
