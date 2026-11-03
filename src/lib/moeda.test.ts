// Rodar: node --test "src/lib/moeda.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatarBRL, formatarMoeda, paraNumero } from "./moeda.ts";

/** Intl usa espaço não separável entre "R$" e o número. */
const nbsp = (s: string) => s.replace(/\u00a0/g, " ");

test("formatarBRL: sempre R$ com 2 casas", () => {
  assert.equal(nbsp(formatarBRL(1234.56)), "R$ 1.234,56");
  assert.equal(nbsp(formatarBRL(1234.5)), "R$ 1.234,50");
  assert.equal(nbsp(formatarBRL(10)), "R$ 10,00");
  assert.equal(nbsp(formatarBRL(0.005)), "R$ 0,01");
  assert.equal(nbsp(formatarBRL(0)), "R$ 0,00");
  assert.equal(nbsp(formatarBRL(1_000_000)), "R$ 1.000.000,00");
  assert.match(nbsp(formatarBRL(-5)), /^-R\$ 5,00$/);
});

test("formatarBRL: strings do Postgres numeric", () => {
  assert.equal(nbsp(formatarBRL("12.5")), "R$ 12,50");
  assert.equal(nbsp(formatarBRL(" 1234.567 ")), "R$ 1.234,57");
});

test("formatarBRL: vazio vira travessão", () => {
  assert.equal(formatarBRL(null), "—");
  assert.equal(formatarBRL(undefined), "—");
  assert.equal(formatarBRL(Number.NaN), "—");
  assert.equal(formatarBRL(Number.POSITIVE_INFINITY), "—");
  assert.equal(formatarBRL(""), "—");
  assert.equal(formatarBRL("abc"), "—");
  assert.equal(paraNumero("abc"), null);
});

test("formatarMoeda: BRL por padrão, outras moedas com 2 casas", () => {
  assert.equal(nbsp(formatarMoeda(1234.5)), "R$ 1.234,50");
  assert.equal(nbsp(formatarMoeda(1234.5, "brl")), "R$ 1.234,50");
  assert.equal(nbsp(formatarMoeda(10, "USD")), "US$ 10,00");
  assert.equal(nbsp(formatarMoeda(10, "XYZ-invalida")), "R$ 10,00");
  assert.equal(formatarMoeda(null, "USD"), "—");
});
