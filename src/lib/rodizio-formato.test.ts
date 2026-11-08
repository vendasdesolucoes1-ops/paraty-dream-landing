// Rodar: node --test src/lib/rodizio-formato.test.ts   (Node 22.18+, que lê TypeScript)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lerLimite,
  motivoFilaParada,
  normalizarTelefone,
  podeReativar,
  type VendedorRodizio,
} from "./rodizio-formato.ts";

test("normalizarTelefone grava com 55 e recusa número curto", () => {
  assert.equal(normalizarTelefone("(24) 99999-1234"), "5524999991234");
  assert.equal(normalizarTelefone("5524999991234"), "5524999991234");
  assert.equal(normalizarTelefone("24 3333-1234"), "552433331234");
  assert.equal(normalizarTelefone(""), null);
  assert.equal(normalizarTelefone("9999-1234"), "invalido");
  // DDD 55 (RS) sem o código do país continua sendo lido como DDD.
  assert.equal(normalizarTelefone("55 99999-1234"), "5555999991234");
});

test("lerLimite aceita vazio (sem limite) e 1 a 500", () => {
  assert.equal(lerLimite(""), null);
  assert.equal(lerLimite(" 10 "), 10);
  assert.equal(lerLimite("0"), "invalido");
  assert.equal(lerLimite("501"), "invalido");
  assert.equal(lerLimite("2,5"), "invalido");
});

test("podeReativar só com login ativo ou sem login", () => {
  assert.equal(podeReativar({ ativo: false, login: "ativo" }), true);
  assert.equal(podeReativar({ ativo: false, login: "sem_login" }), true);
  assert.equal(podeReativar({ ativo: false, login: "excluido" }), false);
  assert.equal(podeReativar({ ativo: true, login: "ativo" }), false);
});

test("motivoFilaParada explica por que nenhum lead será entregue", () => {
  const v = (situacao: VendedorRodizio["situacao"]) => ({ situacao }) as VendedorRodizio;
  assert.match(motivoFilaParada({ ativo: false, vendedores: [v("na_fila")] }) ?? "", /desligado/);
  assert.equal(motivoFilaParada({ ativo: true, vendedores: [v("na_fila"), v("limite")] }), null);
  assert.match(motivoFilaParada({ ativo: true, vendedores: [v("limite")] }) ?? "", /limite/);
  assert.match(motivoFilaParada({ ativo: true, vendedores: [v("pausado")] }) ?? "", /Ninguém/);
});
