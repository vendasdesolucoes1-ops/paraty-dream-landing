// Rodar: node --test "supabase/functions/_shared/meta-leadgen.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  assinaturaValida,
  ehQualificado,
  eventosLeadgen,
  leadParaCrm,
  normalizarTelefone,
  objetivoDaFinalidade,
  perguntaDoCampo,
  tokenVerificacao,
} from "./meta-leadgen.ts";

test("assinatura do webhook: aceita a certa e recusa adulterada", async () => {
  const corpo = '{"object":"page","entry":[]}';
  const sig = "sha256=" + createHmac("sha256", "segredo").update(corpo).digest("hex");
  assert.equal(await assinaturaValida(corpo, sig, "segredo"), true);
  assert.equal(await assinaturaValida(corpo + " ", sig, "segredo"), false);
  assert.equal(await assinaturaValida(corpo, sig, "outro"), false);
  assert.equal(await assinaturaValida(corpo, null, "segredo"), false);
  assert.equal(await assinaturaValida(corpo, "sha1=abc", "segredo"), false);
});

test("token de verificação é estável e depende do app secret", async () => {
  const a = await tokenVerificacao("s1");
  assert.equal(a, await tokenVerificacao("s1"));
  assert.notEqual(a, await tokenVerificacao("s2"));
  assert.equal(a.length, 40);
});

test("lê só os eventos leadgen da Página", () => {
  const payload = {
    object: "page",
    entry: [
      {
        id: "1327646513772412",
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: 444,
              form_id: "f1",
              ad_id: "a1",
              page_id: "p",
              created_time: 1762000000,
            },
          },
          { field: "feed", value: { item: "post" } },
        ],
      },
    ],
  };
  assert.deepEqual(eventosLeadgen(payload), [
    { leadgen_id: "444", form_id: "f1", ad_id: "a1", page_id: "p", created_time: 1762000000 },
  ]);
  assert.deepEqual(eventosLeadgen({ object: "instagram", entry: [] }), []);
  assert.deepEqual(eventosLeadgen(null), []);
});

test("telefone vira 55 + DDD + número", () => {
  assert.equal(normalizarTelefone("+55 (12) 99123-4567"), "5512991234567");
  assert.equal(normalizarTelefone("12991234567"), "5512991234567");
  assert.equal(normalizarTelefone("(12) 3621-0000"), "551236210000");
  assert.equal(normalizarTelefone("012991234567"), "5512991234567");
  assert.equal(normalizarTelefone("<test lead: dummy data for phone_number>"), null);
  assert.equal(normalizarTelefone("+1 415 555 0100"), null);
});

test("reconhece as perguntas do formulário pelo nome do campo", () => {
  assert.equal(perguntaDoCampo("você_pretende_usar_o_lote_para:"), "finalidade");
  assert.equal(perguntaDoCampo("quando_pretende_comprar_seu_lote?"), "prazo_compra");
  assert.equal(perguntaDoCampo("como_prefere_pagar?"), "forma_pagamento");
  assert.equal(perguntaDoCampo("quer_agendar_uma_visita_ao_loteamento?"), "quer_visitar");
  assert.equal(perguntaDoCampo("full_name"), null);
});

test("regra de qualificado: 3 meses ou quer visitar", () => {
  assert.equal(ehQualificado("Nos próximos 3 meses", null), true);
  assert.equal(ehQualificado("nos_próximos_3_meses", "não_agora"), true);
  assert.equal(ehQualificado("Em até 1 ano", "Sim, quero visitar"), true);
  assert.equal(ehQualificado("Em até 1 ano", "Agora não"), false);
  assert.equal(ehQualificado(null, null), false);
});

test("finalidade → objetivo do CRM só quando é claro", () => {
  assert.equal(objetivoDaFinalidade("Construir para morar"), "moradia");
  assert.equal(objetivoDaFinalidade("Investimento"), "investimento");
  assert.equal(objetivoDaFinalidade("Casa de veraneio"), "temporada");
  assert.equal(objetivoDaFinalidade("Ainda não sei"), null);
});

test("converte o lead da Meta no registro do CRM", () => {
  const r = leadParaCrm(
    {
      id: "999",
      created_time: "2026-10-28T13:00:00+0000",
      form_id: "f1",
      ad_id: "a1",
      ad_name: "Video",
      adset_name: "Conjunto",
      campaign_id: "c1",
      campaign_name: "[MORADAS] Cadastro Formulário - Visita - Out/26",
      platform: "ig",
      field_data: [
        { name: "full_name", values: ["Maria Souza"] },
        { name: "phone_number", values: ["+5512991234567"] },
        { name: "email", values: ["Maria@Exemplo.com "] },
        { name: "city", values: ["Paraty"] },
        { name: "você_pretende_usar_o_lote_para:", values: ["construir_para_morar"] },
        { name: "quando_pretende_comprar_seu_lote?", values: ["nos_próximos_3_meses"] },
        { name: "como_prefere_pagar?", values: ["parcelado"] },
        { name: "quer_agendar_uma_visita_ao_loteamento?", values: ["ainda_não"] },
      ],
    },
    "[MORADAS] Form Visita Out26",
  );
  assert.equal(r.nome, "Maria Souza");
  assert.equal(r.telefone, "5512991234567");
  assert.equal(r.email, "maria@exemplo.com");
  assert.equal(r.cidade, "Paraty");
  assert.equal(r.finalidade, "Construir para morar");
  assert.equal(r.prazo_compra, "Nos próximos 3 meses");
  assert.equal(r.forma_pagamento, "Parcelado");
  assert.equal(r.quer_visitar, "Ainda não");
  assert.equal(r.objetivo, "moradia");
  assert.equal(r.qualificado, true);
  assert.equal(r.is_teste, false);
  assert.equal(r.campanha_id, "c1");
  assert.equal(r.conjunto_nome, "Conjunto");
  assert.equal(r.form_nome, "[MORADAS] Form Visita Out26");
});

test("lead da ferramenta de teste da Meta é marcado como teste", () => {
  const r = leadParaCrm({
    id: "1",
    field_data: [
      { name: "full_name", values: ["<test lead: dummy data for full_name>"] },
      { name: "phone_number", values: ["<test lead: dummy data for phone_number>"] },
    ],
  });
  assert.equal(r.is_teste, true);
  assert.equal(r.telefone, null);
});
