// Envio pela Evolution API: texto, mídia e áudio.
//
// Compartilhado porque a whatsapp-webhook (respostas do agente) e a
// lead-qualification (resumo para o vendedor) precisam do mesmo envio, e
// duplicar a montagem do request deixaria as duas divergirem no primeiro
// ajuste de rota ou de header.
//
// ROTAS DE MÍDIA — /message/sendMedia e /message/sendWhatsAppAudio são as da
// Evolution API v2 (a instância roda 2.3.7). Não foi possível verificar contra
// a instância deste projeto a partir do ambiente de desenvolvimento, que não
// alcança o host. Antes de usar em campanha real, confirmar com os dois curls
// do README da equipe — se a rota divergir, a correção é só aqui.

export async function sendWhatsAppText(
  apiUrl: string,
  apiKey: string,
  instanceName: string,
  number: string,
  text: string,
) {
  const response = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number, text }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Evolution sendText error: ${response.status} ${JSON.stringify(result)}`);
  }
  return result;
}

/** Tipos que a Evolution aceita em `mediatype`. Áudio tem rota própria. */
export type EvolutionMediaType = "image" | "video" | "document";

/**
 * Envia imagem, vídeo ou documento a partir de uma URL.
 *
 * URL e não base64: numa campanha de 200 contatos, base64 significaria empurrar
 * o arquivo inteiro 200 vezes pela rede, e o corpo de cada requisição cresceria
 * ~33% em cima do tamanho original. Com URL, a Evolution baixa uma vez por
 * envio de um link que já está hospedado.
 *
 * `caption` só vale para image e video — em document o WhatsApp ignora, então o
 * texto precisa ir em mensagem separada.
 */
export async function sendWhatsAppMedia(
  apiUrl: string,
  apiKey: string,
  instanceName: string,
  number: string,
  media: { url: string; tipo: EvolutionMediaType; nomeArquivo?: string; caption?: string },
) {
  const response = await fetch(`${apiUrl}/message/sendMedia/${instanceName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({
      number,
      mediatype: media.tipo,
      media: media.url,
      ...(media.nomeArquivo ? { fileName: media.nomeArquivo } : {}),
      ...(media.caption ? { caption: media.caption } : {}),
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Evolution sendMedia error: ${response.status} ${JSON.stringify(result)}`);
  }
  return result;
}

/**
 * Envia áudio como PTT (a "mensagem de voz" com a onda, não um anexo de áudio).
 *
 * Rota separada de propósito: mandar áudio por sendMedia entrega um arquivo
 * anexado, que o destinatário precisa abrir — a diferença é grande quando o
 * objetivo é soar como alguém falando.
 */
export async function sendWhatsAppAudio(
  apiUrl: string,
  apiKey: string,
  instanceName: string,
  number: string,
  audioUrl: string,
) {
  const response = await fetch(`${apiUrl}/message/sendWhatsAppAudio/${instanceName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number, audio: audioUrl }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `Evolution sendWhatsAppAudio error: ${response.status} ${JSON.stringify(result)}`,
    );
  }
  return result;
}
