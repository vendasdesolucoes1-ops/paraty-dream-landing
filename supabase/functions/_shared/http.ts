// fetch com timeout e retry, para chamadas a serviços externos.
//
// Sem timeout, uma OpenAI ou Evolution lenta prende a edge function até o
// limite da plataforma e o lead fica sem resposta, sem erro registrado.

export class TempoEsgotado extends Error {
  constructor(url: string, ms: number) {
    super(`Tempo esgotado (${ms} ms) em ${new URL(url).host}`);
    this.name = "TempoEsgotado";
  }
}

interface OpcoesFetch {
  /** Tempo máximo de cada tentativa. */
  timeoutMs: number;
  /** Tentativas extras depois da primeira. Padrão: 0 (sem retry). */
  retries?: number;
  /** Espera base entre tentativas; dobra a cada uma, com jitter. */
  backoffMs?: number;
}

/** Status que valem nova tentativa: limite de taxa e falhas do servidor. */
export function statusTransitorio(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Faz o fetch com timeout por tentativa. Repete em erro de rede, timeout e
 * status transitório. Devolve a última Response (mesmo com erro HTTP) para o
 * chamador decidir; lança só quando nenhuma tentativa obteve resposta.
 *
 * Não use retry em chamadas que não são idempotentes (envio de mensagem): uma
 * resposta perdida depois do envio duplicaria a mensagem.
 */
export async function fetchComRetry(
  url: string,
  init: RequestInit,
  { timeoutMs, retries = 0, backoffMs = 500 }: OpcoesFetch,
): Promise<Response> {
  let ultimoErro: unknown;
  for (let tentativa = 0; tentativa <= retries; tentativa++) {
    if (tentativa > 0) {
      const base = backoffMs * 2 ** (tentativa - 1);
      await dormir(base + Math.floor(Math.random() * base));
    }
    try {
      const resposta = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (statusTransitorio(resposta.status) && tentativa < retries) {
        ultimoErro = new Error(`HTTP ${resposta.status}`);
        await resposta.body?.cancel();
        continue;
      }
      return resposta;
    } catch (erro) {
      ultimoErro =
        erro instanceof DOMException && erro.name === "TimeoutError"
          ? new TempoEsgotado(url, timeoutMs)
          : erro;
    }
  }
  throw ultimoErro;
}
