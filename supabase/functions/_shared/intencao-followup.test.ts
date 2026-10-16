// Rodar: node --test "supabase/functions/_shared/*.test.ts"

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acaoDaIntencao,
  contemValores,
  decidirIntencao,
  lerClassificacao,
  lerRedacao,
  recusaDaRedacao,
  type Classificacao,
} from "./intencao-followup.ts";

const modelo = (intencao: string, confianca = 0.9) =>
  lerClassificacao(JSON.stringify({ intencao, confianca, motivo: "x" }));

test("palavra-chave de parada vence o modelo", () => {
  const c = decidirIntencao("SAIR", modelo("interessado"), false);
  assert.equal(c?.intencao, "opt_out");
  assert.equal(c?.origem, "palavra_chave");
  // E não gera aviso: a Sophia já bloqueia o contato.
  assert.equal(acaoDaIntencao(c as Classificacao).avisar, null);
});

test("intenção inválida ou JSON quebrado não classifica", () => {
  assert.equal(lerClassificacao("{}"), null);
  assert.equal(lerClassificacao("não é json"), null);
  assert.equal(lerClassificacao(JSON.stringify({ intencao: "comprar_agora", confianca: 1 })), null);
});

test("confiança fica entre 0 e 1", () => {
  assert.equal(modelo("duvida", 7)?.confianca, 1);
  assert.equal(modelo("duvida", -2)?.confianca, 0);
});

test("intenção de visita sem visita agendada vira interesse", () => {
  assert.equal(
    decidirIntencao("vou sim", modelo("confirma_visita"), false)?.intencao,
    "interessado",
  );
  assert.equal(
    decidirIntencao("vou sim", modelo("confirma_visita"), true)?.intencao,
    "confirma_visita",
  );
});

test("só confirmação com confiança alta age sozinha", () => {
  assert.equal(acaoDaIntencao(modelo("confirma_visita", 0.95)!).confirmarVisita, true);
  const incerta = acaoDaIntencao(modelo("confirma_visita", 0.5)!);
  assert.equal(incerta.confirmarVisita, false);
  assert.equal(incerta.avisar?.tipo, "visita_confirmacao_incerta");
});

test("reagendar e cancelar vão para um humano", () => {
  for (const i of ["reagendar_visita", "cancelar_visita"]) {
    const a = acaoDaIntencao(modelo(i)!);
    assert.equal(a.confirmarVisita, false);
    assert.ok(a.avisar);
  }
});

test("opt-out só do modelo não bloqueia: avisa o vendedor", () => {
  const a = acaoDaIntencao(modelo("opt_out")!);
  assert.equal(a.avisar?.tipo, "possivel_opt_out");
});

test("filtro de valores pega reais, parcelas, percentuais e mil", () => {
  for (const t of [
    "R$ 150 mil",
    "em 120x sem juros",
    "parcelas de 900",
    "entrada de 10%",
    "uns 200 mil",
  ]) {
    assert.ok(contemValores(t), t);
  }
  assert.ok(!contemValores("Oi Ana, tudo bem? Posso te ajudar com alguma dúvida?"));
});

test("redação com valores, a mais ou com marcas é recusada", () => {
  const tpl = ["Oi! Ficou alguma dúvida?"];
  const r = (partes: string[]) => recusaDaRedacao({ partes, motivo: "" }, tpl);
  assert.equal(r(["Oi Ana! Ficou alguma dúvida sobre o loteamento?"]), null);
  assert.equal(r(["Temos lotes a partir de R$ 90 mil"]), "texto com valores");
  assert.equal(r(["a", "b"]), "mais mensagens que o template");
  assert.equal(r(["Oi [VISITA_AGENDADA]"]), "marca ou variável no texto");
  assert.equal(r([]), "redação vazia");
});

test("lerRedacao descarta partes vazias", () => {
  assert.deepEqual(lerRedacao(JSON.stringify({ partes: ["  oi ", ""], motivo: "m" })), {
    partes: ["oi"],
    motivo: "m",
  });
  assert.equal(lerRedacao(JSON.stringify({ partes: [1] })), null);
});
