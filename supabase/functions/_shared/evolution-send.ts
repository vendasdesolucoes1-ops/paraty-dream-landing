// Envio de texto pela Evolution API.
//
// Compartilhado porque a whatsapp-webhook (respostas do agente) e a
// lead-qualification (resumo para o vendedor) precisam do mesmo envio, e
// duplicar a montagem do request deixaria as duas divergirem no primeiro
// ajuste de rota ou de header.

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
