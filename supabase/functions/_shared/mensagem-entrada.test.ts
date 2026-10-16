// Rodar: node --test "supabase/functions/_shared/*.test.ts"   (Node 22.18+; Bun e Deno também servem)
//
// Mensagem recebida (issue #55): contatos @lid com telefone alternativo não são
// descartados, e áudio/mídia sem legenda nunca viram texto vazio para o modelo.
// Telefones sintéticos.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  base64NoPayload,
  classificarMensagem,
  descreverMidia,
  extrairTexto,
  resolverRemetente,
  telefoneDoJid,
  temTexto,
} from "./mensagem-entrada.ts";

test("telefoneDoJid: JID de telefone, número cru e sufixo de dispositivo", () => {
  assert.equal(telefoneDoJid("5524999990000@s.whatsapp.net"), "5524999990000");
  assert.equal(telefoneDoJid("5524999990000:12@s.whatsapp.net"), "5524999990000");
  assert.equal(telefoneDoJid("24999990000@s.whatsapp.net"), "5524999990000");
  assert.equal(telefoneDoJid("5524999990000"), "5524999990000");
});

test("telefoneDoJid: @lid, vazio e tamanhos inválidos não viram telefone", () => {
  assert.equal(telefoneDoJid("123456789012345@lid"), null);
  assert.equal(telefoneDoJid(""), null);
  assert.equal(telefoneDoJid(undefined), null);
  assert.equal(telefoneDoJid("12345@s.whatsapp.net"), null);
  assert.equal(telefoneDoJid("1234567890123456@s.whatsapp.net"), null);
});

test("resolverRemetente: remoteJid de telefone é usado direto", () => {
  const r = resolverRemetente({ key: { remoteJid: "5524999990000@s.whatsapp.net" } });
  assert.deepEqual(r, {
    telefone: "5524999990000",
    jid: "5524999990000@s.whatsapp.net",
    viaAlternativo: false,
  });
});

test("resolverRemetente: @lid usa remoteJidAlt da key", () => {
  const r = resolverRemetente({
    key: { remoteJid: "111122223333444@lid", remoteJidAlt: "5524999990000@s.whatsapp.net" },
  });
  assert.deepEqual(r, {
    telefone: "5524999990000",
    jid: "5524999990000@s.whatsapp.net",
    viaAlternativo: true,
  });
});

test("resolverRemetente: @lid usa remoteJidAlt ou senderPn fora da key", () => {
  assert.equal(
    resolverRemetente({
      key: { remoteJid: "111122223333444@lid" },
      remoteJidAlt: "5524999990001@s.whatsapp.net",
    })?.telefone,
    "5524999990001",
  );
  assert.equal(
    resolverRemetente({
      key: { remoteJid: "111122223333444@lid", senderPn: "5524999990002@s.whatsapp.net" },
    })?.telefone,
    "5524999990002",
  );
  assert.equal(
    resolverRemetente({ key: { remoteJid: "111122223333444@lid" }, senderPn: "5524999990003" })
      ?.telefone,
    "5524999990003",
  );
});

test("resolverRemetente: @lid sem alternativa (ou com alternativa @lid) é descartado", () => {
  assert.equal(resolverRemetente({ key: { remoteJid: "111122223333444@lid" } }), null);
  assert.equal(
    resolverRemetente({
      key: { remoteJid: "111122223333444@lid", remoteJidAlt: "999988887777666@lid" },
    }),
    null,
  );
  assert.equal(resolverRemetente({}), null);
  assert.equal(resolverRemetente(undefined), null);
});

test("extrairTexto: conversa, texto estendido, legendas e envelopes", () => {
  assert.equal(extrairTexto({ conversation: "Oi" }), "Oi");
  assert.equal(extrairTexto({ extendedTextMessage: { text: "Quero saber" } }), "Quero saber");
  assert.equal(extrairTexto({ imageMessage: { caption: "esse lote" } }), "esse lote");
  assert.equal(extrairTexto({ videoMessage: { caption: "olha" } }), "olha");
  assert.equal(
    extrairTexto({
      documentWithCaptionMessage: { message: { documentMessage: { caption: "contrato" } } },
    }),
    "contrato",
  );
  assert.equal(
    extrairTexto({ ephemeralMessage: { message: { conversation: "sumindo" } } }),
    "sumindo",
  );
  assert.equal(extrairTexto({ audioMessage: { seconds: 5 } }), "");
  assert.equal(extrairTexto(undefined), "");
});

test("classificarMensagem: texto, legenda conta como texto", () => {
  assert.equal(classificarMensagem({ conversation: "Oi" }, "conversation"), "texto");
  assert.equal(classificarMensagem({ imageMessage: { caption: "esse" } }, "imageMessage"), "texto");
});

test("classificarMensagem: áudio", () => {
  assert.equal(classificarMensagem({ audioMessage: { ptt: true } }, "audioMessage"), "audio");
  assert.equal(classificarMensagem({}, "audioMessage"), "audio");
});

test("classificarMensagem: mídia sem legenda (ou só com espaços)", () => {
  assert.equal(classificarMensagem({ imageMessage: {} }, "imageMessage"), "midia_sem_legenda");
  assert.equal(classificarMensagem({ imageMessage: { caption: "   " } }), "midia_sem_legenda");
  assert.equal(classificarMensagem({ videoMessage: {} }), "midia_sem_legenda");
  assert.equal(classificarMensagem({ documentMessage: {} }), "midia_sem_legenda");
});

test("classificarMensagem: figurinha, reação e vazio não são texto", () => {
  assert.equal(classificarMensagem({ stickerMessage: {} }, "stickerMessage"), "sem_conteudo");
  assert.equal(classificarMensagem({ reactionMessage: { text: "👍" } }), "sem_conteudo");
  assert.equal(classificarMensagem({ conversation: "  \n " }), "sem_conteudo");
  assert.equal(classificarMensagem(undefined), "sem_conteudo");
});

test("temTexto: só texto com conteúdo visível", () => {
  assert.equal(temTexto("oi"), true);
  assert.equal(temTexto("   "), false);
  assert.equal(temTexto(""), false);
  assert.equal(temTexto(null), false);
  assert.equal(temTexto(undefined), false);
});

test("descreverMidia e base64NoPayload", () => {
  assert.equal(descreverMidia({ imageMessage: {} }), "uma imagem");
  assert.equal(descreverMidia({ videoMessage: {} }), "um vídeo");
  assert.equal(descreverMidia({ documentMessage: {} }), "um documento");
  assert.equal(descreverMidia({}, "stickerMessage"), "uma mídia");
  assert.equal(base64NoPayload({ message: { base64: "AAAA" } }), "AAAA");
  assert.equal(base64NoPayload({ message: {} }), null);
});
