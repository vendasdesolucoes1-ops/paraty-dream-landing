// Rodar: node --test "supabase/functions/_shared/meta-alcance.test.ts"
//
// Alcance e frequência do período, ao vivo: validação do pedido e leitura por
// nível (com paginação) e da conta.

import { test } from "node:test";
import assert from "node:assert/strict";
import { MetaGraphClient } from "./meta-graph.ts";
import { consultarAlcance, validarPedido } from "./meta-alcance.ts";

test("validarPedido: datas, ordem, tamanho e nível", () => {
  assert.deepEqual(validarPedido("2026-10-05", "2026-11-03", "conjunto"), {
    inicio: "2026-10-05",
    fim: "2026-11-03",
    nivel: "conjunto",
  });
  assert.equal(validarPedido("2026-10-05", "2026-11-03", null).toString().length > 0, true);
  assert.equal(typeof validarPedido("05/10/2026", "2026-11-03", "campanha"), "string");
  assert.equal(typeof validarPedido("2026-11-03", "2026-10-05", "campanha"), "string");
  assert.equal(typeof validarPedido("2020-01-01", "2026-11-03", "campanha"), "string");
  assert.equal(typeof validarPedido("2026-10-05", "2026-11-03", "pais"), "string");
});

test("consultarAlcance: conta + itens do nível, seguindo a paginação", async () => {
  const urls: URL[] = [];
  const cliente = new MetaGraphClient({
    config: {
      accessToken: "tok-de-teste-123456",
      appSecret: "secret-de-teste-123456",
      adAccountId: "act_9",
    },
    fetchImpl: (async (url: string) => {
      const u = new URL(String(url));
      urls.push(u);
      if (u.searchParams.get("level") === "account") {
        return new Response(JSON.stringify({ data: [{ reach: "20000", frequency: "2.1" }] }));
      }
      if (u.searchParams.get("after") === "p2") {
        return new Response(
          JSON.stringify({ data: [{ campaign_id: "c2", reach: "542", frequency: "1.25" }] }),
        );
      }
      return new Response(
        JSON.stringify({
          data: [{ campaign_id: "c1", reach: "9776", frequency: "1.91" }],
          paging: {
            next: "https://graph.facebook.com/v26.0/act_9/insights?after=p2&level=campaign",
          },
        }),
      );
    }) as typeof fetch,
    dormir: async () => {},
    log: () => {},
  });

  const r = await consultarAlcance(cliente, {
    inicio: "2026-10-05",
    fim: "2026-11-03",
    nivel: "campanha",
  });
  assert.deepEqual(r.conta, { alcance: 20000, frequencia: 2.1 });
  assert.deepEqual(r.itens.c1, { alcance: 9776, frequencia: 1.91 });
  assert.deepEqual(r.itens.c2, { alcance: 542, frequencia: 1.25 });
  const nivel = urls.find((u) => u.searchParams.get("level") === "campaign")!;
  assert.equal(nivel.searchParams.get("fields"), "campaign_id,reach,frequency");
  assert.equal(nivel.searchParams.get("time_range"), '{"since":"2026-10-05","until":"2026-11-03"}');
});
