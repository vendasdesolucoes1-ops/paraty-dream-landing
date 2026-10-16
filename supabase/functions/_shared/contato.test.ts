// Rodar: node --test "supabase/functions/_shared/*.test.ts"   (Node 22.18+; Bun e Deno também servem)
//
// Regras que protegem o número da empresa: opt-out reconhecido sem depender do
// modelo, e nome vindo de formulário público nunca vira texto arbitrário.

import { test } from "node:test";
import assert from "node:assert/strict";
import { chaveTelefone, ehPedidoDeParada } from "./contato-bloqueado.ts";
import { montarAbertura, primeiroNome } from "./primeiro-contato.ts";

test("pedido de parada: frases curtas e inequívocas", () => {
  for (const texto of [
    "Pare",
    "PARE!",
    "parar.",
    "Não quero mais",
    "nao quero mais receber",
    "me tira da lista",
    "Me tire da lista!!",
    "sair",
    "stop",
    "Pare de me mandar mensagem",
  ]) {
    assert.equal(ehPedidoDeParada(texto), true, texto);
  }
});

test("pedido de parada: conversa normal não vira opt-out", () => {
  for (const texto of [
    "para quem eu falo sobre a visita?",
    "pode parar de mandar o preço e manda a planta",
    "quero saber mais",
    "cancelar a visita de sábado",
    "",
    null,
    undefined,
  ]) {
    assert.equal(ehPedidoDeParada(texto), false, String(texto));
  }
});

test("chave de telefone: mesmos 10 dígitos com e sem máscara", () => {
  assert.equal(chaveTelefone("(24) 99999-1234"), chaveTelefone("5524999991234"));
  assert.equal(chaveTelefone("123"), null);
});

test("primeiro nome: aceita nomes reais, com acento e hífen", () => {
  assert.equal(primeiroNome("maria aparecida"), "Maria");
  assert.equal(primeiroNome("  JOÃO  Silva"), "João");
  assert.equal(primeiroNome("Ana-Clara Souza"), "Ana-clara");
});

test("primeiro nome: descarta link, número e texto livre", () => {
  assert.equal(primeiroNome("https://golpe.example"), "");
  assert.equal(primeiroNome("Clique:"), "");
  assert.equal(primeiroNome("12345"), "");
  assert.equal(primeiroNome("Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), "");
  assert.equal(primeiroNome(null), "");
});

test("abertura: nome inválido cai na saudação sem nome", () => {
  const partes = montarAbertura({ nome: "www.golpe.example ganhe", metragem: null, tipo: null });
  assert.equal(partes[0], "Oi! Aqui é a Sophia, do Moradas de Paraty.");
});
