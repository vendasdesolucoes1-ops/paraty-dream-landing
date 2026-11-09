// Rodar: node --test "supabase/functions/_shared/*.test.ts"

import { test } from "node:test";
import assert from "node:assert/strict";
import { montarAviso } from "./aviso-vendedor.ts";

test("aviso do rodízio traz nome, telefone formatado, origem e link de conversa", () => {
  const texto = montarAviso(
    {
      nome: "Marcos Antonio",
      telefone: "5524999998888",
      origem: "formulario_meta",
      formulario_nome: "Form Visita Out26",
      cidade: "Paraty",
      objetivo: "moradia",
      metragem_interesse: 360,
    },
    false,
  );
  assert.match(texto, /^\*Novo lead para você\*/);
  assert.match(texto, /\*Nome:\* Marcos Antonio/);
  assert.match(texto, /\*WhatsApp:\* \(24\) 99999-8888/);
  assert.match(texto, /\*Origem:\* Formulário Meta — Form Visita Out26/);
  assert.match(texto, /\*Interesse:\* moradia · 360 m²/);
  assert.match(texto, /https:\/\/wa\.me\/5524999998888/);
  assert.match(texto, /rodízio/);
});

test("aviso manual muda o título e omite o que não foi informado", () => {
  const texto = montarAviso({ nome: "Ana", telefone: null, origem: null }, true);
  assert.match(texto, /^\*Lead atribuído a você\*/);
  assert.match(texto, /\*WhatsApp:\* não informado/);
  assert.doesNotMatch(texto, /Origem|Cidade|Interesse|wa\.me/);
});

test("número sem DDI ganha 55 no link", () => {
  assert.match(montarAviso({ nome: "B", telefone: "24999998888" }, false), /wa\.me\/5524999998888/);
});
