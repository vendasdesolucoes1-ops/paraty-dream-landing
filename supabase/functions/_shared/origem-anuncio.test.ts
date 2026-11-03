// Rodar: node --test "supabase/functions/_shared/origem-anuncio.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { extrairOrigemAnuncio, registrarOrigemAnuncio } from "./origem-anuncio.ts";

const ad = {
  title: "Lote pronto em Paraty",
  sourceType: "ad",
  sourceId: "120252374467960505",
  sourceUrl: "https://fb.me/abc",
  ctwaClid: "Afd-123",
};

test("acha o anúncio no contextInfo do topo, da mensagem estendida ou da imagem", () => {
  const esperado = {
    anuncioId: "120252374467960505",
    ctwaClid: "Afd-123",
    titulo: "Lote pronto em Paraty",
    url: "https://fb.me/abc",
  };
  assert.deepEqual(extrairOrigemAnuncio({ contextInfo: { externalAdReply: ad } }), esperado);
  assert.deepEqual(
    extrairOrigemAnuncio({
      message: { extendedTextMessage: { text: "Oi", contextInfo: { externalAdReply: ad } } },
    }),
    esperado,
  );
  assert.deepEqual(
    extrairOrigemAnuncio({ message: { imageMessage: { contextInfo: { externalAdReply: ad } } } }),
    esperado,
  );
});

test("mensagem comum, link compartilhado ou sem id não são anúncio", () => {
  assert.equal(extrairOrigemAnuncio({ message: { conversation: "Oi" } }), null);
  assert.equal(
    extrairOrigemAnuncio({ contextInfo: { externalAdReply: { ...ad, sourceType: "url" } } }),
    null,
  );
  assert.equal(
    extrairOrigemAnuncio({ contextInfo: { externalAdReply: { title: "x", sourceType: "ad" } } }),
    null,
  );
  assert.equal(extrairOrigemAnuncio(null), null);
});

test("registrar chama o banco só quando veio de anúncio e nunca lança", async () => {
  const chamadas: unknown[] = [];
  const ok = {
    rpc: async (fn: string, args: Record<string, unknown>) => (
      chamadas.push([fn, args]),
      { error: null }
    ),
  };
  assert.equal(
    await registrarOrigemAnuncio(ok, "L1", { contextInfo: { externalAdReply: ad } }),
    true,
  );
  assert.equal(await registrarOrigemAnuncio(ok, "L1", { message: { conversation: "Oi" } }), false);
  assert.deepEqual(chamadas, [
    [
      "registrar_origem_anuncio",
      {
        p_lead_id: "L1",
        p_anuncio_id: "120252374467960505",
        p_ctwa_clid: "Afd-123",
        p_titulo: "Lote pronto em Paraty",
        p_url: "https://fb.me/abc",
      },
    ],
  ]);
  const quebrado = {
    rpc: async () => {
      throw new Error("rede");
    },
  };
  assert.equal(
    await registrarOrigemAnuncio(quebrado, "L1", { contextInfo: { externalAdReply: ad } }),
    false,
  );
});
