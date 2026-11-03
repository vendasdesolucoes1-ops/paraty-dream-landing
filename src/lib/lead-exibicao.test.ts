import { test } from "node:test";
import assert from "node:assert/strict";
import { cidadeValida, nomeExibicao, nomeInvalido, resumoRespostas } from "./lead-exibicao.ts";

test("nomes que não identificam a pessoa viram Sem nome", () => {
  for (const n of [
    "5511964804571",
    "marcelomax305",
    "natalinoflavio1@gmail.com",
    "ht5175056",
    "",
    null,
  ]) {
    assert.equal(nomeInvalido(n), true, String(n));
  }
  assert.equal(nomeExibicao({ nome: "codigo3" }), "Sem nome");
});

test("nomes de verdade passam", () => {
  for (const n of ["Marjorie", "José da Silva", "Elton", "MUDDGO", "Ana Paula"]) {
    assert.equal(nomeInvalido(n), false, n);
  }
  assert.equal(nomeExibicao({ nome: " Gilson " }), "Gilson");
});

test("cidades inválidas somem", () => {
  assert.equal(cidadeValida("sim"), null);
  assert.equal(cidadeValida("fulano@gmail.com"), null);
  assert.equal(cidadeValida("Rio Claro"), "Rio Claro");
  assert.equal(cidadeValida("sp"), "sp");
});

test("resumo das respostas do formulário", () => {
  assert.equal(
    resumoRespostas({ prazo_compra: "Nos próximos 3 meses", quer_visitar: "Sim, quero visitar" }),
    "Compra em 3 meses · Quer visitar",
  );
  assert.equal(
    resumoRespostas({ prazo_compra: "Ainda estou só pesquisando", quer_visitar: "Ainda não" }),
    "Só pesquisando",
  );
  assert.equal(resumoRespostas({}), null);
});
