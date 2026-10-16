// Leitura de uma mensagem recebida pela Evolution: quem mandou e o que mandou.
//
// Funções puras (sem Deno, sem rede), para rodar nos testes com node:test.
//
// Dois problemas que isto resolve (issue #55):
//   - Contatos @lid: o WhatsApp passou a identificar alguns contatos por um id
//     interno (LID), que NÃO é telefone. A Evolution v2 manda o telefone real
//     em `remoteJidAlt` (ou `senderPn`, conforme a versão). Antes a mensagem
//     era descartada mesmo com o telefone disponível.
//   - Áudio e mídia sem legenda chegavam ao modelo como texto vazio, e a
//     Sophia respondia a uma mensagem que não leu.

export type TipoEntrada = "texto" | "audio" | "midia_sem_legenda" | "sem_conteudo";

type Registro = Record<string, any>;

/**
 * Telefone a partir de um JID ou número cru. Devolve null para @lid (id
 * interno, transformar os dígitos em telefone criaria leads falsos no CRM)
 * e para qualquer coisa fora de 10 a 15 dígitos.
 */
export function telefoneDoJid(jid: unknown): string | null {
  if (typeof jid !== "string" || !jid) return null;
  if (jid.includes("@lid")) return null;
  const digitos = jid
    .replace(/:\d+(?=@)/, "") // sufixo de dispositivo (5524...:12@s.whatsapp.net)
    .replace(/@s\.whatsapp\.net|@c\.us|@g\.us/g, "")
    .replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 15) return null;
  if (digitos.startsWith("55")) return digitos;
  return `55${digitos}`;
}

export interface RemetenteResolvido {
  telefone: string;
  /**
   * JID para gravar: o próprio remoteJid quando ele já é telefone; para @lid,
   * o JID de telefone (`<telefone>@s.whatsapp.net`), o mesmo que os envios
   * gravam — assim o eco de um envio nosso ainda casa.
   */
  jid: string;
  /** O contato veio como @lid e o telefone saiu de um campo alternativo. */
  viaAlternativo: boolean;
}

/**
 * Resolve o telefone do contato de um evento `messages.upsert`.
 *
 * Usa o `remoteJid` quando ele é telefone; senão tenta, em ordem,
 * `key.remoteJidAlt`, `remoteJidAlt`, `key.senderPn` e `senderPn`. Só devolve
 * null quando não há nenhuma alternativa com telefone.
 */
export function resolverRemetente(data: Registro | null | undefined): RemetenteResolvido | null {
  if (!data) return null;
  const key: Registro = data.key ?? {};
  const remoteJid = key.remoteJid;

  const direto = telefoneDoJid(remoteJid);
  if (direto) return { telefone: direto, jid: remoteJid, viaAlternativo: false };

  // Alternativas só fazem sentido quando o contato veio como @lid; um JID de
  // grupo ou malformado não ganha telefone de outro campo.
  if (typeof remoteJid !== "string" || !remoteJid.includes("@lid")) return null;

  for (const candidato of [key.remoteJidAlt, data.remoteJidAlt, key.senderPn, data.senderPn]) {
    const telefone = telefoneDoJid(candidato);
    if (telefone) return { telefone, jid: `${telefone}@s.whatsapp.net`, viaAlternativo: true };
  }
  return null;
}

/** Tira os envelopes (efêmera, visualização única, documento com legenda). */
function desembrulhar(message: Registro): Registro {
  let atual = message;
  for (let i = 0; i < 4; i++) {
    const interno =
      atual.ephemeralMessage?.message ??
      atual.viewOnceMessage?.message ??
      atual.viewOnceMessageV2?.message ??
      atual.viewOnceMessageV2Extension?.message ??
      atual.documentWithCaptionMessage?.message;
    if (!interno || typeof interno !== "object") break;
    atual = interno;
  }
  return atual;
}

/** Texto digitado pelo lead: corpo da mensagem ou legenda da mídia. */
export function extrairTexto(message: Registro | null | undefined): string {
  if (!message || typeof message !== "object") return "";
  const m = desembrulhar(message);
  const texto =
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    "";
  return typeof texto === "string" ? texto : "";
}

/** Há texto de verdade para o modelo ler? */
export function temTexto(texto: unknown): boolean {
  return typeof texto === "string" && texto.trim().length > 0;
}

/**
 * Classifica a mensagem para decidir o caminho no webhook:
 *   - texto: tem texto (inclusive legenda de mídia) → segue para a Sophia;
 *   - audio: sem texto, precisa de transcrição;
 *   - midia_sem_legenda: imagem, vídeo ou documento sem legenda → vendedor;
 *   - sem_conteudo: figurinha, reação, enquete etc. → só registra.
 */
export function classificarMensagem(
  message: Registro | null | undefined,
  messageType?: string | null,
): TipoEntrada {
  if (temTexto(extrairTexto(message))) return "texto";
  const m = message && typeof message === "object" ? desembrulhar(message) : {};
  const tipo = String(messageType ?? "");
  if (m.audioMessage || tipo === "audioMessage" || tipo === "pttMessage") return "audio";
  if (
    m.imageMessage ||
    m.videoMessage ||
    m.documentMessage ||
    m.ptvMessage ||
    [
      "imageMessage",
      "videoMessage",
      "documentMessage",
      "documentWithCaptionMessage",
      "ptvMessage",
    ].includes(tipo)
  ) {
    return "midia_sem_legenda";
  }
  return "sem_conteudo";
}

/** Nome legível do tipo de mídia, para avisos ao vendedor. */
export function descreverMidia(
  message: Registro | null | undefined,
  messageType?: string | null,
): string {
  const m = message && typeof message === "object" ? desembrulhar(message) : {};
  const tipo = String(messageType ?? "");
  if (m.imageMessage || tipo === "imageMessage") return "uma imagem";
  if (m.videoMessage || m.ptvMessage || tipo === "videoMessage" || tipo === "ptvMessage")
    return "um vídeo";
  if (
    m.documentMessage ||
    tipo.startsWith("documentMessage") ||
    tipo === "documentWithCaptionMessage"
  ) {
    return "um documento";
  }
  if (m.audioMessage || tipo === "audioMessage") return "um áudio";
  return "uma mídia";
}

/** Base64 da mídia quando a Evolution já o manda no webhook (opção webhook_base64). */
export function base64NoPayload(data: Registro | null | undefined): string | null {
  const b64 = data?.message?.base64 ?? data?.base64;
  return typeof b64 === "string" && b64.length > 0 ? b64 : null;
}
