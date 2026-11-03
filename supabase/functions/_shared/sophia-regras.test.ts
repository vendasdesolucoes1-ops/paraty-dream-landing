import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparHistorico,
  descreverVisita,
  instanteDaVisita,
  lerConsultor,
  mensagemDoHistorico,
  nomeDoConsultor,
  pediuAtendimentoHumano,
  textoCondicao,
} from "./sophia-regras.ts";

const PALAVRAS = ["atendente", "humano", "falar com alguém", "corretor"];

test("transferência: pedido de verdade transfere", () => {
  for (const t of [
    "Quero falar com um corretor",
    "quero falar com uma pessoa",
    "Me passa pra um atendente por favor",
    "prefiro um humano",
    "corretor",
    "posso falar com o corretor?",
    "Gostaria de falar com alguém",
  ]) {
    assert.equal(pediuAtendimentoHumano(t, PALAVRAS), true, t);
  }
});

test("transferência: palavra solta não transfere", () => {
  for (const t of [
    "Meu corretor me indicou vocês",
    "minha corretora falou bem do loteamento",
    "sou corretor de imóveis e tenho clientes interessados em lotes grandes",
    "o atendimento de vocês é muito bom, obrigado pela atenção",
    "humanos e pets são bem-vindos no condomínio?",
  ]) {
    assert.equal(pediuAtendimentoHumano(t, PALAVRAS), false, t);
  }
});

test("histórico: só a Sophia vira assistant; equipe e disparo viram nota", () => {
  assert.deepEqual(mensagemDoHistorico({ from_me: false, autor: "lead", content: "oi" }), {
    role: "user",
    content: "oi",
  });
  assert.equal(
    mensagemDoHistorico({ from_me: true, autor: "sophia", content: "Olá" })?.role,
    "assistant",
  );
  const equipe = mensagemDoHistorico({
    from_me: true,
    autor: "equipe_celular",
    content: "te ligo já",
  });
  assert.equal(equipe?.role, "system");
  assert.match(equipe!.content, /EQUIPE respondeu \(pelo celular\)/);
  assert.match(equipe!.content, /não foi você/);
  const antigo = mensagemDoHistorico({ from_me: true, autor: null, content: "Bom dia" });
  assert.equal(antigo?.role, "system");
  assert.equal(mensagemDoHistorico({ from_me: false, content: "  " }), null);
});

test("histórico: agrupa lead e Sophia, não agrupa notas", () => {
  const r = agruparHistorico([
    { role: "user", content: "oi" },
    { role: "user", content: "tudo bem?" },
    { role: "system", content: "a" },
    { role: "system", content: "b" },
    { role: "assistant", content: "Olá" },
  ]);
  assert.equal(r.length, 4);
  assert.equal(r[0].content, "oi\ntudo bem?");
});

test("condição comercial", () => {
  assert.equal(
    textoCondicao({ entrada_percentual: "10.00", parcelas_max: 240 }),
    "10% de entrada e o restante em até 240x direto com a loteadora, sem banco, sujeito a análise",
  );
  assert.equal(
    textoCondicao({ entrada_percentual: 12.5, parcelas_max: 120 })?.startsWith("12,5%"),
    true,
  );
  assert.equal(textoCondicao(null), null);
});

test("consultor", () => {
  assert.equal(
    lerConsultor('{"nome":"Fernando Silva","telefone":"(24) 99999-0000"}')?.telefone,
    "24999990000",
  );
  assert.equal(lerConsultor("{}"), null);
  assert.equal(nomeDoConsultor({ nome: "Fernando Silva" }), "Fernando");
  assert.equal(nomeDoConsultor(null), "um consultor da equipe");
});

test("visita: texto e instante", () => {
  assert.equal(descreverVisita("2026-11-07", "10:00"), "sábado, 07/11 às 10h");
  assert.equal(descreverVisita("2026-11-07", "14:30"), "sábado, 07/11 às 14h30");
  assert.equal(instanteDaVisita("2026-11-07", "10:00")?.toISOString(), "2026-11-07T13:00:00.000Z");
  assert.equal(instanteDaVisita("07/11", "10:00"), null);
});
