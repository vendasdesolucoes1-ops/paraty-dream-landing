// Transcrição de áudio recebido no WhatsApp (issue #55).
//
// Baixa a mídia pela Evolution (ou usa o base64 que já veio no webhook) e
// transcreve na OpenAI. Qualquer falha devolve null: o webhook então pede ao
// lead que escreva e avisa o vendedor — nunca manda texto vazio ao modelo.

import { fetchComRetry } from "./http.ts";

const OPENAI_API_KEY = (Deno.env.get("OPENAI_API_KEY") ?? "")
  .trim()
  .replace(/[\r\n\t]/g, "")
  .replace(/[^\x20-\x7E]/g, "");

// Primeiro o modelo mais barato e recente; whisper-1 como reserva.
const MODELOS = ["gpt-4o-mini-transcribe", "whisper-1"];

/** Limite da OpenAI para o arquivo de áudio. */
const TAMANHO_MAXIMO_BYTES = 25 * 1024 * 1024;

interface InstanciaMidia {
  api_url: string;
  api_key: string;
  instance_name: string;
}

interface MidiaBaixada {
  base64: string;
  mimetype: string;
}

async function baixarMidia(
  instancia: InstanciaMidia,
  key: Record<string, unknown>,
): Promise<MidiaBaixada | null> {
  const resposta = await fetchComRetry(
    `${instancia.api_url}/chat/getBase64FromMediaMessage/${instancia.instance_name}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: instancia.api_key },
      body: JSON.stringify({ message: { key }, convertToMp4: false }),
    },
    // Leitura idempotente: retry é seguro.
    { timeoutMs: 20_000, retries: 1 },
  );
  if (!resposta.ok) {
    console.error("[transcricao] download da mídia falhou", { status: resposta.status });
    await resposta.body?.cancel();
    return null;
  }
  const corpo = await resposta.json().catch(() => null);
  const base64 = typeof corpo?.base64 === "string" ? corpo.base64 : null;
  if (!base64) return null;
  return { base64, mimetype: typeof corpo?.mimetype === "string" ? corpo.mimetype : "" };
}

function decodificarBase64(base64: string): Uint8Array<ArrayBuffer> {
  const limpo = base64.replace(/^data:[^,]*,/, "");
  const binario = atob(limpo);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function extensaoDoMime(mime: string): string {
  if (mime.includes("ogg") || mime.includes("opus")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("webm")) return "webm";
  return "ogg"; // nota de voz do WhatsApp
}

/**
 * Transcreve o áudio de uma mensagem. Devolve o texto, ou null se não houver
 * chave da OpenAI, a mídia não baixar ou a transcrição falhar/vier vazia.
 */
export async function transcreverAudio(
  instancia: InstanciaMidia,
  data: Record<string, any>,
  base64DoPayload: string | null,
): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;
  try {
    const midia: MidiaBaixada | null = base64DoPayload
      ? { base64: base64DoPayload, mimetype: data.message?.audioMessage?.mimetype ?? "" }
      : data.key
        ? await baixarMidia(instancia, data.key)
        : null;
    if (!midia) return null;

    const bytes = decodificarBase64(midia.base64);
    if (bytes.length === 0 || bytes.length > TAMANHO_MAXIMO_BYTES) return null;

    const mime = (midia.mimetype || data.message?.audioMessage?.mimetype || "audio/ogg")
      .split(";")[0]
      .trim();
    const arquivo = new Blob([bytes], { type: mime });

    for (const modelo of MODELOS) {
      const form = new FormData();
      form.append("file", arquivo, `audio.${extensaoDoMime(mime)}`);
      form.append("model", modelo);
      form.append("language", "pt");
      form.append("response_format", "json");

      const resposta = await fetchComRetry(
        "https://api.openai.com/v1/audio/transcriptions",
        { method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, body: form },
        { timeoutMs: 30_000, retries: 1 },
      ).catch((e) => e as Error);

      if (resposta instanceof Error) {
        console.error("[transcricao] OpenAI sem resposta", { modelo, erro: resposta.name });
        continue;
      }
      if (!resposta.ok) {
        console.error("[transcricao] OpenAI recusou", { modelo, status: resposta.status });
        await resposta.body?.cancel();
        continue;
      }
      const corpo = await resposta.json().catch(() => null);
      const texto = typeof corpo?.text === "string" ? corpo.text.trim() : "";
      // Só o tamanho no log (LGPD).
      console.log("[transcricao] ok", { modelo, tamanho: texto.length });
      return texto || null;
    }
    return null;
  } catch (e) {
    console.error("[transcricao] falhou:", (e as Error)?.name);
    return null;
  }
}
