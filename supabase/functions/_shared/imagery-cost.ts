// Tabela de custo do Imagery Engine e regras de teto de gasto.
// Os valores espelham o que imagery-generate-image e imagery-validate-image
// realmente registram em imagery_logs.custo_usd — se um mudar lá, mude aqui.

// Imagem: preço de tabela oficial do Google (API direta).
// Google list price oficial, verificado 2026-07-29.
//   flash: $30/1M tokens de output, 1290 tok/img  -> $0,039
//   pro:  $120/1M tokens de output, 1120 tok/img  -> $0,134
export const COST_IMAGE_PRO = 0.134;
export const COST_IMAGE_FLASH = 0.039;
// Validação: segue no gateway Lovable (conversão de crédito).
export const COST_VALIDATE = 0.003;
// Planner (gemini-2.5-pro, Google direto): estimativa a priori conservadora.
// O valor REAL é calculado no plan-post via usageMetadata e gravado em
// imagery_logs — o thinking do modelo faz o custo variar bastante.
export const COST_PLAN = 0.05;

// O modelo caro fica só na capa: é o slide que aparece no feed. Os internos
// ficam atrás de um swipe e sob sobreposição de texto, onde a diferença de
// fidelidade não compensa 3,4x o preço.
export const PRO_TEMPLATE_IDS = ["T01_CAPA"];

export function isProTemplate(templateId: string | null | undefined): boolean {
  return PRO_TEMPLATE_IDS.includes(templateId ?? "");
}

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
 * para estimar por faixa: sempre uma capa no modelo caro e o restante no
 * rápido. O teto soma 1 retry por slide (o limite que o orchestrate impõe).
 */
export function estimatePostCost(nSlides: number): CostEstimate {
  const slides = Math.max(1, Math.min(8, Math.floor(nSlides) || 1));

  const flashSlides = slides - 1;
  const capa = COST_IMAGE_PRO + COST_VALIDATE;
  const interno = COST_IMAGE_FLASH + COST_VALIDATE;

  const estimado = COST_PLAN + capa + flashSlides * interno;
  const maximo = COST_PLAN + (capa + flashSlides * interno) * 2;

  return {
    estimado: Number(estimado.toFixed(4)),
    maximo: Number(maximo.toFixed(4)),
  };
}
