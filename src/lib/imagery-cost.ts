// Espelho de supabase/functions/_shared/imagery-cost.ts.
// O bundle do Vite não consegue importar do diretório de funções Deno, então as
// constantes são duplicadas — a fonte da verdade é o arquivo do backend, que é
// quem de fato aplica a cota. Ao mudar um valor lá, mude aqui também.

// Preço de tabela do Google (API direta), verificado em 2026-07-29.
// Espelha supabase/functions/_shared/imagery-cost.ts.
export const COST_IMAGE_PRO = 0.134;
export const COST_IMAGE_FLASH = 0.134;
export const COST_VALIDATE = 0.003;
export const COST_PLAN = 0.002;

export const PRO_IMAGE_TYPES = ["paisagem", "arquitetura", "agua"];

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
  const proSlides = Math.ceil(slides / 2);
  const flashSlides = slides - proSlides;
  const estimado =
    COST_PLAN +
    proSlides * (COST_IMAGE_PRO + COST_VALIDATE) +
    flashSlides * (COST_IMAGE_FLASH + COST_VALIDATE);
  const maximo = COST_PLAN + slides * (COST_IMAGE_PRO + COST_VALIDATE) * 2;
  return { estimado: Number(estimado.toFixed(4)), maximo: Number(maximo.toFixed(4)) };
}

/**
 * Estimativa precisa, usada depois do planejamento: já se sabe quais slides
 * pedem imagem e qual modelo cada tipo aciona.
 */
export function estimatePlannedCost(
  slides: { needs_image?: boolean | null; image_type?: string | null }[],
): CostEstimate {
  let estimado = 0;
  let maximo = 0;
  for (const slide of slides) {
    if (slide.needs_image === false) continue;
    const imageCost = PRO_IMAGE_TYPES.includes(slide.image_type ?? "paisagem")
      ? COST_IMAGE_PRO
      : COST_IMAGE_FLASH;
    estimado += imageCost + COST_VALIDATE;
    // O orchestrate permite no máximo 1 retry por slide.
    maximo += (imageCost + COST_VALIDATE) * 2;
  }
  return { estimado: Number(estimado.toFixed(4)), maximo: Number(maximo.toFixed(4)) };
}

export function formatUsd(value: number): string {
  return `US$ ${value.toFixed(2)}`;
}
