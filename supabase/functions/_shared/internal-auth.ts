// Guard das funções internas do Imagery Engine.
//
// imagery-generate-image, -validate-image e -compose-slide só devem ser
// invocadas pelo imagery-orchestrate — nunca diretamente pelo cliente. Elas são
// as etapas caras do pipeline (até US$ 0,04 por chamada), então exigem duas
// credenciais: o JWT do usuário que originou o pipeline E um segredo interno
// que apenas o orchestrate conhece.

const INTERNAL_FUNCTION_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

export const INTERNAL_HEADER = "x-internal-secret";

export function internalHeaders(): Record<string, string> {
  return { [INTERNAL_HEADER]: INTERNAL_FUNCTION_SECRET };
}

// Comparação em tempo constante: evita que a latência da resposta revele
// quantos caracteres do segredo o atacante já acertou.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function deny(status: number, error: string, headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

/**
 * Retorna uma Response quando a chamada deve ser recusada, ou null quando pode
 * seguir. Falha fechada: sem o secret configurado, nada roda.
 */
export function guardInternalCall(
  req: Request,
  corsHeaders: Record<string, string>,
): Response | null {
  if (!INTERNAL_FUNCTION_SECRET) {
    console.error("INTERNAL_FUNCTION_SECRET não configurado — recusando chamada interna.");
    return deny(503, "Função indisponível: segredo interno não configurado", corsHeaders);
  }

  // O JWT do usuário continua obrigatório: o segredo interno autentica a
  // origem da chamada, não o usuário por trás dela.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return deny(401, "Unauthorized", corsHeaders);

  const provided = req.headers.get(INTERNAL_HEADER) ?? "";
  if (!timingSafeEqual(provided, INTERNAL_FUNCTION_SECRET)) {
    return deny(403, "Forbidden: esta função só aceita chamadas internas do pipeline", corsHeaders);
  }

  return null;
}
