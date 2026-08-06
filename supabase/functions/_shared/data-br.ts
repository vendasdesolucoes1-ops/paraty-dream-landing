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
 * Os próximos N dias, cada um com o dia da semana JÁ CALCULADO aqui.
 *
 * Existe porque modelo de linguagem não faz aritmética de calendário de forma
 * confiável. Mesmo recebendo a data de hoje, ele erra o dia da semana de datas
 * futuras — em produção afirmou que 09/08 era sexta (era domingo) logo depois
 * de o lead ter dito corretamente que 07/08 era sexta. Não é falta de
 * informação nem de instrução: é uma conta que ele não sabe fazer.
 *
 * A saída vira uma tabela no prompt. Consultar uma linha pronta é recuperação,
 * não cálculo — e isso o modelo faz bem.
 *
 * Ancorado ao meio-dia UTC de cada dia para atravessar qualquer mudança de
 * offset sem pular ou repetir data.
 */
export function proximosDias(
  agora: Date,
  dias: number,
): Array<{ iso: string; ddmm: string; diaSemana: string }> {
  const hojeISO = dataISOEmSaoPaulo(agora);
  const [ano, mes, dia] = hojeISO.split("-").map(Number);
  const ancora = Date.UTC(ano, mes - 1, dia, 12, 0, 0);

  const linhas: Array<{ iso: string; ddmm: string; diaSemana: string }> = [];
  for (let i = 0; i < dias; i++) {
    const d = new Date(ancora + i * 86_400_000);
    const iso = dataISOEmSaoPaulo(d);
    const [, mm, dd] = iso.split("-");
    linhas.push({ iso, ddmm: `${dd}/${mm}`, diaSemana: diaSemanaEmSaoPaulo(d) });
  }
  return linhas;
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
