// Acervo de fundos do Imagery Engine.
//
// A fonte primária de imagem do Moradas é foto REAL do empreendimento (aéreas
// do loteamento, o rio, Paraty histórica), subida manualmente no painel Marca.
// Imagem gerada por IA é exceção, usada só quando não há foto compatível.

/**
 * Marca dona do acervo. Este projeto Supabase é exclusivo do Moradas — o
 * isolamento real entre clientes VS é a fronteira do projeto, não esta coluna.
 * Ela existe para que todo SELECT já nasça filtrado: se o engine for replicado
 * num banco compartilhado, a barreira não precisa ser lembrada depois.
 */
export const BRAND_SLUG = "moradas_paraty";

/** Prefixo do acervo dentro do bucket privado "imagery". */
export const ACERVO_PREFIX = "acervo";

export const ACERVO_TAGS = [
  "aerea",
  "paisagem",
  "arquitetura",
  "agua",
  "detalhe",
  "vida",
] as const;

export type AcervoTag = (typeof ACERVO_TAGS)[number];

/**
 * Tags elegíveis ao auto-arquivamento de imagens geradas. "vida" fica de fora:
 * é a única direção que descreve pessoas, e o acervo automático não deve
 * acumular material com gente identificável.
 */
export const AUTO_ARQUIVO_TAGS: string[] = ["aerea", "paisagem", "arquitetura", "agua", "detalhe"];

/** Nota mínima do validator para uma imagem gerada entrar no acervo. */
export const AUTO_ARQUIVO_NOTA_MINIMA = 8;
