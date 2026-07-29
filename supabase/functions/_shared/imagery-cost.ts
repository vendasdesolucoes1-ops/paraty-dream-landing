// Tabela de custo do Imagery Engine e regras de teto de gasto.
// Os valores espelham o que imagery-generate-image e imagery-validate-image
// realmente registram em imagery_logs.custo_usd — se um mudar lá, mude aqui.

// Imagem: preço de tabela do Google (API direta), verificado em 2026-07-29.
// Em 1K/2K os dois modelos custam o mesmo — o split deixou de ser econômico.
// Confira em ai.google.dev/gemini-api/docs/pricing ao revisar.
export const COST_IMAGE_PRO = 0.134;
export const COST_IMAGE_FLASH = 0.134;
// Texto: seguem no gateway Lovable, valores de conversão de crédito.
export const COST_VALIDATE = 0.003;
export const COST_PLAN = 0.002; // planner (texto)

// Tipos de imagem que o gerador roteia para o modelo de maior fidelidade.
export const PRO_IMAGE_TYPES = ["paisagem", "arquitetura", "agua"];

// Acima disto a UI exige confirmação explícita do usuário.
export const CONFIRM_THRESHOLD_USD = 0.8;
// Teto de gasto por usuário em 24h.
export const DAILY_BUDGET_USD = 5;

export interface CostEstimate {
  /** Cenário provável: mix de modelos, sem retry. */
  estimado: number;
  /** Pior caso: todo slide no modelo caro e com o retry permitido. */
  maximo: number;
}

/**
 * O planner é quem decide o tipo de cada imagem, então antes de planejar só dá
 * para estimar por faixa. O piso assume o modelo rápido; o teto assume o modelo
 * caro em todos os slides mais 1 retry cada (o limite que o orchestrate impõe).
 */
export function estimatePostCost(nSlides: number): CostEstimate {
  const slides = Math.max(1, Math.min(8, Math.floor(nSlides) || 1));

  // Mistura realista: as capas/paisagens caem no modelo caro, os detalhes não.
  const proSlides = Math.ceil(slides / 2);
  const flashSlides = slides - proSlides;
  const estimado =
    COST_PLAN +
    proSlides * (COST_IMAGE_PRO + COST_VALIDATE) +
    flashSlides * (COST_IMAGE_FLASH + COST_VALIDATE);

  const maximo = COST_PLAN + slides * (COST_IMAGE_PRO + COST_VALIDATE) * 2;

  return {
    estimado: Number(estimado.toFixed(4)),
    maximo: Number(maximo.toFixed(4)),
  };
}
