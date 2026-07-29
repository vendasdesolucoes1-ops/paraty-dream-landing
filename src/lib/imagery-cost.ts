// Espelho de supabase/functions/_shared/imagery-cost.ts.
// O bundle do Vite não consegue importar do diretório de funções Deno, então as
// constantes são duplicadas — a fonte da verdade é o arquivo do backend, que é
// quem de fato aplica a cota. Ao mudar um valor lá, mude aqui também.

// Google list price oficial, verificado 2026-07-29.
// Espelha supabase/functions/_shared/imagery-cost.ts.
//   flash: $30/1M tokens de output, 1290 tok/img  -> $0,039
//   pro:  $120/1M tokens de output, 1120 tok/img  -> $0,134
export const COST_IMAGE_PRO = 0.134;
export const COST_IMAGE_FLASH = 0.039;
export const COST_VALIDATE = 0.003;
// Planner (gemini-3-flash-preview): estimativa a priori; o real vem do
// usageMetadata.
export const COST_PLAN = 0.02;

// O modelo caro fica só na capa: é o slide que aparece no feed. Os internos
// ficam atrás de um swipe e sob sobreposição de texto, onde a diferença de
// fidelidade não compensa 3,4x o preço.
export const PRO_TEMPLATE_IDS = ["T01_CAPA"];

export function isProTemplate(templateId: string | null | undefined): boolean {
  return PRO_TEMPLATE_IDS.includes(templateId ?? "");
}

/** Comparado contra o PIOR caso da estimativa, não contra o provável. */
export const CONFIRM_THRESHOLD_USD = 0.8;
export const DAILY_BUDGET_USD = 5;

export interface CostEstimate {
  estimado: number;
  maximo: number;
}

/** Estimativa por faixa, quando ainda não se sabe o tipo de cada imagem. */
export function estimatePostCost(nSlides: number): CostEstimate {
  const slides = Math.max(1, Math.min(8, Math.floor(nSlides) || 1));
  // Sempre exatamente uma capa (pro); o restante vai no flash.
  const flashSlides = slides - 1;
  const capa = COST_IMAGE_PRO + COST_VALIDATE;
  const interno = COST_IMAGE_FLASH + COST_VALIDATE;
  const estimado = COST_PLAN + capa + flashSlides * interno;
  // Pior caso: 1 retry por slide (teto imposto pelo orchestrate).
  const maximo = COST_PLAN + (capa + flashSlides * interno) * 2;
  return { estimado: Number(estimado.toFixed(4)), maximo: Number(maximo.toFixed(4)) };
}

/**
 * Estimativa precisa, usada depois do planejamento: já se sabe quais slides
 * pedem imagem e qual modelo cada tipo aciona.
 */
export function estimatePlannedCost(
  slides: { needs_image?: boolean | null; template_id?: string | null }[],
): CostEstimate {
  let estimado = 0;
  let maximo = 0;
  for (const slide of slides) {
    if (slide.needs_image === false) continue;
    const imageCost = isProTemplate(slide.template_id) ? COST_IMAGE_PRO : COST_IMAGE_FLASH;
    estimado += imageCost + COST_VALIDATE;
    // O orchestrate permite no máximo 1 retry por slide.
    maximo += (imageCost + COST_VALIDATE) * 2;
  }
  return { estimado: Number(estimado.toFixed(4)), maximo: Number(maximo.toFixed(4)) };
}

export function formatUsd(value: number): string {
  return `US$ ${value.toFixed(2)}`;
}
