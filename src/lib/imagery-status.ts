import type { Tone } from "@/components/ds/pill";

/**
 * Estados do Imagery Engine, num lugar só.
 *
 * São DOIS domínios, não um: o post (imagery_posts.status) atravessa o
 * planejamento e a publicação; o slide (imagery_slides.status) atravessa a
 * geração de uma arte. Eles compartilham três palavras — generating, ready,
 * failed — e era aí que divergiam: "generating" era âmbar na galeria e azul na
 * tela de criação, a mesma etapa em duas cores conforme a aba aberta.
 *
 * Ficou `info` nos dois. Gerar é progresso normal, não aviso; `warning` é para
 * o que pede atenção de alguém, e uma arte sendo gerada não pede nada além de
 * esperar.
 */

/** imagery_posts.status — do briefing à publicação. */
export const POST_STATUS_TONE: Record<string, Tone> = {
  planning: "neutral",
  draft: "neutral",
  generating: "info",
  ready: "success",
  published: "info",
  failed: "danger",
};

export const POST_STATUS_LABEL: Record<string, string> = {
  planning: "Planejando",
  draft: "Rascunho",
  generating: "Gerando",
  ready: "Pronto",
  published: "Publicado",
  failed: "Falhou",
};

/**
 * imagery_slides.status — a geração de uma arte.
 *
 * `pending` e `queued` dividem o mesmo rótulo de propósito: a diferença entre
 * "o planejador inseriu" e "o orquestrador assumiu" é interna, e para quem
 * olha a tela as duas significam a mesma coisa — ainda não começou.
 */
export const SLIDE_STATUS_TONE: Record<string, Tone> = {
  pending: "neutral",
  queued: "neutral",
  generating: "info",
  validating: "info",
  composing: "info",
  ready: "success",
  failed: "danger",
};

export const SLIDE_STATUS_LABEL: Record<string, string> = {
  pending: "Na fila",
  queued: "Na fila",
  generating: "Gerando foto",
  validating: "Validando",
  composing: "Montando arte",
  ready: "Pronto",
  failed: "Falhou",
};
