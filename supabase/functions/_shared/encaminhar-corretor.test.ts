import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decidirEncaminhamento,
  mensagemEncaminhamento,
  metragemNaMensagem,
  pediuPreco,
  primeiroNome,
  respostaComEncaminhamento,
} from "./encaminhar-corretor.ts";

const base = { lead: {}, registradoAgora: {}, mensagensAnteriores: [] as string[] };

test("detecta pedido de preço sem pegar condomínio", () => {
  assert.ok(pediuPreco("Quanto custa o lote?"));
  assert.ok(pediuPreco("me passa o valor"));
  assert.ok(pediuPreco("qual o preço do de 360?"));
  assert.ok(pediuPreco("tem parcelamento?"));
  assert.ok(!pediuPreco("qual o valor do condomínio?"));
  assert.ok(!pediuPreco("oi, vi o anúncio"));
});

test("metragem só quando a mensagem fala de tamanho", () => {
  assert.equal(metragemNaMensagem("uns 360m²"), 360);
  assert.equal(metragemNaMensagem("12x30"), 360);
  assert.equal(metragemNaMensagem("450"), 450);
  assert.equal(metragemNaMensagem("sou de 2024"), null);
  assert.equal(metragemNaMensagem("Carlos, sou de Taubaté"), null);
});

test("conversa do teste a: interesse + tamanho encaminha na 4ª resposta", () => {
  const d = decidirEncaminhamento({
    ...base,
    lead: { nome: "Carlos", cidade: "Taubaté", objetivo: "moradia" },
    mensagem: "uns 360m²",
  });
  assert.equal(d.encaminhar, true);
  assert.equal(d.metragem, 360);
});

test("sem tamanho e sem preço continua conversando", () => {
  const d = decidirEncaminhamento({
    ...base,
    lead: { nome: "Carlos", cidade: "Taubaté" },
    mensagem: "quero construir casa",
  });
  assert.equal(d.encaminhar, false);
});

test("conversa do teste b: preço insistido encaminha na 2ª vez", () => {
  const primeira = decidirEncaminhamento({ ...base, mensagem: "Quanto custa o lote?" });
  assert.equal(primeira.encaminhar, false, "1ª vez sem nenhum outro dado: oferece os caminhos");
  const segunda = decidirEncaminhamento({
    ...base,
    mensagem: "Não quero visita, só me fala o preço",
    mensagensAnteriores: ["Quanto custa o lote?"],
  });
  assert.equal(segunda.encaminhar, true);
  assert.equal(segunda.pediuPreco, true);
});

test("conversa do teste c: interesse + 450m² + preço encaminha na hora", () => {
  const d = decidirEncaminhamento({
    ...base,
    mensagem: "Tenho interesse num terreno de 450m², me passa o valor",
  });
  assert.equal(d.encaminhar, true);
  assert.equal(d.metragem, 450);
});

test("lead do anúncio que quer visitar e pergunta o preço encaminha", () => {
  const d = decidirEncaminhamento({
    ...base,
    lead: { quer_visitar: "Sim, quero visitar" },
    mensagem: "qual o valor?",
  });
  assert.equal(d.encaminhar, true);
});

test("tamanho registrado agora pela Sophia conta", () => {
  const d = decidirEncaminhamento({
    ...base,
    lead: { objetivo: "investimento" },
    registradoAgora: { metragem_interesse: "300" },
    mensagem: "pode ser",
  });
  assert.equal(d.encaminhar, true);
});

test("mensagem de encaminhamento", () => {
  assert.equal(
    mensagemEncaminhamento({
      primeiroNome: "Carlos",
      corretor: "Renan",
      metragem: 360,
      pediuPreco: false,
    }),
    "Carlos, vou passar seu contato para o Renan, nosso corretor, que te chama aqui mesmo com as opções de lotes de 360 m² e os valores.",
  );
  assert.equal(
    mensagemEncaminhamento({
      primeiroNome: null,
      corretor: null,
      metragem: null,
      pediuPreco: true,
    }),
    "Vou passar seu contato para um dos nossos corretores que te chama aqui mesmo com os valores e as condições.",
  );
});

test("resposta tira as perguntas do modelo e fecha com o encaminhamento", () => {
  const r = respostaComEncaminhamento(
    ["Temos lotes de 360 m² nas quadras 8 e 9.", "Prefere visitar ou fazer um vídeo?"],
    "Vou passar seu contato.",
  );
  assert.deepEqual(r, ["Temos lotes de 360 m² nas quadras 8 e 9.", "Vou passar seu contato."]);
});

test("primeiro nome", () => {
  assert.equal(primeiroNome("carlos silva"), "Carlos");
  assert.equal(primeiroNome("5512991519515"), null);
  assert.equal(primeiroNome("Lead de Teste (painel)"), null);
});
