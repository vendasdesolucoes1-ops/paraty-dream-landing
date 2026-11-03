// Rodar: node --test "supabase/functions/_shared/meta-saldo.test.ts"
//
// Saldo ao vivo da conta de anúncios: leitura dos valores da Meta (centavos,
// texto da forma de pagamento), estimativa de dias e as chamadas à Graph API.

import { test } from "node:test";
import assert from "node:assert/strict";
import { MetaGraphClient } from "./meta-graph.ts";
import { consultarSaldo, montarSaldo, valorDoTexto } from "./meta-saldo.ts";

const AGORA = new Date("2026-11-03T15:00:00Z");

test("valorDoTexto: formatos brasileiro e americano", () => {
  assert.equal(valorDoTexto("Saldo disponível (R$ 1.234,56 BRL)"), 1234.56);
  assert.equal(valorDoTexto("Available balance (R$1,234.56 BRL)"), 1234.56);
  assert.equal(valorDoTexto("Saldo disponível (R$50,00 BRL)"), 50);
  assert.equal(valorDoTexto("Saldo disponível (R$ 12.000 BRL)"), 12000);
  assert.equal(valorDoTexto("Visa *1234"), 1234);
  assert.equal(valorDoTexto("sem número"), null);
  assert.equal(valorDoTexto(null), null);
});

test("pré-paga: saldo vem do texto e a estimativa usa a média de 7 dias", () => {
  const s = montarSaldo(
    "act_9",
    {
      name: "Moradas",
      currency: "BRL",
      account_status: 1,
      is_prepay_account: true,
      balance: "0",
      amount_spent: "123456",
      spend_cap: "0",
      funding_source_details: { display_string: "Saldo disponível (R$ 350,00 BRL)", type: 20 },
    },
    48.2,
    350,
    AGORA,
  );
  assert.equal(s.prepaga, true);
  assert.equal(s.saldoDisponivel, 350);
  assert.equal(s.aCobrar, null);
  assert.equal(s.gastoTotal, 1234.56);
  assert.equal(s.limiteGasto, null, "spend_cap 0 = sem limite");
  assert.equal(s.mediaDiaria7d, 50);
  assert.equal(s.diasRestantes, 7);
  assert.equal(s.statusRotulo, "Ativa");
  assert.equal(s.consultadoEm, AGORA.toISOString());
});

test("pós-paga: a cobrar vem de balance e os dias saem do limite de gasto", () => {
  const s = montarSaldo(
    "act_9",
    {
      currency: "BRL",
      account_status: 3,
      is_prepay_account: false,
      balance: "8990",
      amount_spent: "90000",
      spend_cap: "100000",
      funding_source_details: { display_string: "Visa *1234" },
    },
    0,
    70,
    AGORA,
  );
  assert.equal(s.saldoDisponivel, null, "o número do cartão não vira saldo");
  assert.equal(s.aCobrar, 89.9);
  assert.equal(s.limiteGasto, 1000);
  assert.equal(s.restanteLimite, 100);
  assert.equal(s.diasRestantes, 10);
  assert.equal(s.statusRotulo, "Pagamento pendente");
  assert.equal(s.formaPagamento, "Visa *1234");
});

test("sem gasto recente não há estimativa de dias", () => {
  const s = montarSaldo(
    "act_9",
    { is_prepay_account: true, funding_source_details: { display_string: "Saldo (R$ 10,00)" } },
    0,
    0,
    AGORA,
  );
  assert.equal(s.diasRestantes, null);
  assert.equal(s.mediaDiaria7d, 0);
});

test("consultarSaldo: lê a conta e o gasto de hoje e de 7 dias", async () => {
  const chamadas: URL[] = [];
  const cliente = new MetaGraphClient({
    config: {
      accessToken: "tok-de-teste-123456",
      appSecret: "secret-de-teste-123456",
      adAccountId: "act_9",
    },
    fetchImpl: (async (url: string) => {
      const u = new URL(String(url));
      chamadas.push(u);
      if (u.pathname.endsWith("/act_9")) {
        return new Response(
          JSON.stringify({
            id: "act_9",
            currency: "BRL",
            account_status: 1,
            is_prepay_account: true,
            amount_spent: "5000",
            spend_cap: "0",
            funding_source_details: { display_string: "Saldo disponível (R$ 200,00 BRL)" },
          }),
        );
      }
      const preset = u.searchParams.get("date_preset");
      const data = preset === "today" ? [] : [{ spend: "140.00" }];
      return new Response(JSON.stringify({ data }));
    }) as typeof fetch,
    dormir: async () => {},
    log: () => {},
  });

  const s = await consultarSaldo(cliente, AGORA);
  assert.equal(chamadas.length, 3);
  assert.equal(s.gastoHoje, 0, "sem linhas hoje = zero gasto");
  assert.equal(s.mediaDiaria7d, 20);
  assert.equal(s.saldoDisponivel, 200);
  assert.equal(s.diasRestantes, 10);
  for (const u of chamadas) {
    assert.ok(u.searchParams.get("appsecret_proof"), "toda chamada é assinada");
  }
});

test("pré-paga com limite: os dias usam o que acabar primeiro", () => {
  const s = montarSaldo(
    "act_9",
    {
      is_prepay_account: true,
      amount_spent: "111249",
      spend_cap: "135732",
      funding_source_details: { display_string: "Saldo disponível (R$278,69 BRL)" },
    },
    13.35,
    389.76,
    AGORA,
  );
  assert.equal(s.saldoDisponivel, 278.69);
  assert.equal(s.restanteLimite, 244.83);
  assert.equal(s.mediaDiaria7d, 55.68);
  assert.equal(s.diasRestantes, 4.3, "244,83 / 55,68");
});
