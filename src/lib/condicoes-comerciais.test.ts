// Rodar: node --test "src/lib/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { erroDoRascunho } from "./condicoes-comerciais.ts";

const base = { id: null, nome: "Lançamento", entrada: "10", parcelas: "240", observacao: "" };

test("rascunho válido", () => {
  assert.equal(erroDoRascunho(base), null);
  assert.equal(erroDoRascunho({ ...base, entrada: "7,5" }), null);
});

test("limites iguais aos do banco", () => {
  assert.ok(erroDoRascunho({ ...base, nome: " " }));
  assert.ok(erroDoRascunho({ ...base, entrada: "101" }));
  assert.ok(erroDoRascunho({ ...base, entrada: "" }));
  assert.ok(erroDoRascunho({ ...base, parcelas: "0" }));
  assert.ok(erroDoRascunho({ ...base, parcelas: "481" }));
  assert.ok(erroDoRascunho({ ...base, parcelas: "12.5" }));
});
