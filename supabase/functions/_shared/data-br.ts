// Datas no fuso de Paraty, compartilhadas entre a conversa e a extração.
//
// Vive aqui porque as duas pontas precisam da MESMA noção de "hoje": a Sophia,
// para não confirmar um dia da semana que não corresponde à data, e a extração
// da visita, para resolver "sábado" numa data absoluta. Duas implementações
// divergiriam no primeiro ajuste de fuso.

export const FUSO = "America/Sao_Paulo";

/** "2026-08-05" no fuso de Paraty. */
export function dataISOEmSaoPaulo(momento: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(momento);
}

/** "quarta-feira" — o dia da semana de um instante, no fuso de Paraty. */
export function diaSemanaEmSaoPaulo(momento: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    weekday: "long",
  }).format(momento);
}

/** "2026-08-05" e "quarta-feira", para ancorar o modelo. */
export function hojeEmSaoPaulo(agora: Date): { data: string; diaSemana: string } {
  return { data: dataISOEmSaoPaulo(agora), diaSemana: diaSemanaEmSaoPaulo(agora) };
}

/**
 * Normaliza um nome de dia da semana para comparação: sem acento, sem
 * "-feira", minúsculo. "Sábado" e "sabado" e "sábado-feira" viram "sabado".
 */
export function normalizarDiaSemana(bruto: string | null | undefined): string {
  return String(bruto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/-?\s*feira/g, "")
    .trim();
}
