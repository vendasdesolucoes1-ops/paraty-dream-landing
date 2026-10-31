// Rodar: node --test "supabase/functions/_shared/meta-actions.test.ts"
//
// Parsing das listas de ações do /insights: o ponto mais fácil de errar a
// conta (contagem dobrada, string vs número, listas ausentes).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extrairPrincipais,
  inteiroDe,
  listaDeAcoes,
  numeroOuNulo,
  totalDeVideo,
  valorPrioritario,
} from "./meta-actions.ts";

test("valores vêm como string e viram número; vazio e lixo viram null", () => {
  assert.equal(numeroOuNulo("12.5"), 12.5);
  assert.equal(numeroOuNulo(3), 3);
  assert.equal(numeroOuNulo(""), null);
  assert.equal(numeroOuNulo(undefined), null);
  assert.equal(numeroOuNulo("x"), null);
  assert.equal(inteiroDe("7.9"), 7);
});

test("lista malformada ou ausente não quebra", () => {
  assert.deepEqual(listaDeAcoes(undefined), []);
  assert.deepEqual(listaDeAcoes("nao-lista"), []);
  assert.deepEqual(listaDeAcoes([null, { value: "1" }, { action_type: "a", value: "2" }]), [
    { action_type: "a", value: "2" },
  ]);
});

test("usa o primeiro tipo da prioridade e não soma tipos que repetem o mesmo evento", () => {
  const actions = [
    { action_type: "lead", value: "10" },
    { action_type: "onsite_conversion.lead_grouped", value: "10" },
    { action_type: "offsite_conversion.fb_pixel_lead", value: "4" },
    { action_type: "link_click", value: "120" },
    { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "6" },
  ];
  const p = extrairPrincipais(actions, null);
  assert.equal(p.leads, 10, "não pode virar 24");
  assert.equal(p.cliques_link, 120);
  assert.equal(p.mensagens_iniciadas, 6);
  assert.equal(p.compras, null);
  assert.equal(p.reservas, null);
});

test("cai para o tipo seguinte quando o primeiro não existe", () => {
  const p = extrairPrincipais([{ action_type: "offsite_conversion.fb_pixel_lead", value: "4" }], null);
  assert.equal(p.leads, 4);
  assert.equal(valorPrioritario([], ["lead"]), null);
});

test("compras e valor de compras vêm de actions e action_values", () => {
  const p = extrairPrincipais(
    [{ action_type: "purchase", value: "3" }],
    [{ action_type: "purchase", value: "1499.90" }],
  );
  assert.equal(p.compras, 3);
  assert.equal(p.valor_compras, 1499.9);
});

test("zero é um valor, não ausência", () => {
  assert.equal(extrairPrincipais([{ action_type: "lead", value: "0" }], null).leads, 0);
});

test("total de vídeo é o valor do primeiro item da lista de video_view", () => {
  assert.equal(totalDeVideo([{ action_type: "video_view", value: "250" }]), 250);
  assert.equal(totalDeVideo(undefined), null);
  assert.equal(totalDeVideo([]), null);
});
