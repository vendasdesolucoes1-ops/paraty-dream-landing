// Saldo da conta de anúncios, consultado ao vivo na Meta (sem gravar no banco).
//
// A tela de Marketing chama a função meta-saldo a cada minuto. Uma chamada faz
// três leituras na Graph API: os dados da conta (saldo, limite, forma de
// pagamento) e o gasto de hoje e dos últimos 7 dias, que dão o ritmo de gasto
// e a estimativa de quantos dias o saldo pré-pago ainda dura.
//
// Valores monetários da conta (balance, amount_spent, spend_cap) vêm em
// centavos, em string. O saldo de conta pré-paga só existe no texto da forma de
// pagamento (funding_source_details.display_string), por isso é extraído dali.
import { numeroOuNulo } from "./meta-actions.ts";
import { exigirAtivo, type MetaGraphClient } from "./meta-graph.ts";

export const CAMPOS_SALDO = [
  "name",
  "currency",
  "account_status",
  "disable_reason",
  "balance",
  "amount_spent",
  "spend_cap",
  "is_prepay_account",
  "funding_source_details{display_string,type}",
].join(",");

/** account_status da Meta → rótulo curto. */
export const STATUS_CONTA: Record<number, string> = {
  1: "Ativa",
  2: "Desativada",
  3: "Pagamento pendente",
  7: "Em análise de risco",
  8: "Liquidação pendente",
  9: "Em período de carência",
  100: "Encerramento pendente",
  101: "Encerrada",
};

export type SaldoConta = {
  contaId: string;
  nome: string | null;
  moeda: string | null;
  status: number | null;
  statusRotulo: string | null;
  /** Conta pré-paga (créditos adicionados antes) ou pós-paga (cobrança no cartão/boleto depois). */
  prepaga: boolean;
  /** Pré-paga: créditos ainda disponíveis. Null quando a Meta não informa. */
  saldoDisponivel: number | null;
  /** Pós-paga: gasto acumulado que ainda não foi cobrado. */
  aCobrar: number | null;
  gastoTotal: number | null;
  /** Limite de gasto da conta (null = sem limite). */
  limiteGasto: number | null;
  restanteLimite: number | null;
  gastoHoje: number | null;
  mediaDiaria7d: number | null;
  /** Dias que o saldo disponível e o restante do limite (o menor) cobrem no ritmo dos últimos 7 dias. */
  diasRestantes: number | null;
  formaPagamento: string | null;
  consultadoEm: string;
};

const centavos = (v: unknown): number | null => {
  const n = numeroOuNulo(v);
  return n === null ? null : n / 100;
};

/**
 * Extrai o valor de um texto como "Saldo disponível (R$ 1.234,56 BRL)" ou
 * "Available balance (R$1,234.56 BRL)". O último separador seguido de 1–2
 * dígitos é o decimal; os demais são de milhar.
 */
export function valorDoTexto(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const m = texto.match(/-?\d[\d.,\s]*\d|-?\d/);
  if (!m) return null;
  const bruto = m[0].replace(/\s/g, "");
  const dec = bruto.match(/[.,](\d{1,2})$/);
  const inteiro = (dec ? bruto.slice(0, -dec[0].length) : bruto).replace(/[.,]/g, "");
  const n = Number(dec ? `${inteiro}.${dec[1]}` : inteiro);
  return Number.isFinite(n) ? n : null;
}

const arred = (n: number) => Math.round(n * 100) / 100;

export function montarSaldo(
  contaId: string,
  conta: Record<string, unknown>,
  gastoHoje: number | null,
  gasto7d: number | null,
  agora = new Date(),
): SaldoConta {
  const fonte = (conta.funding_source_details ?? {}) as { display_string?: string };
  const formaPagamento = typeof fonte.display_string === "string" ? fonte.display_string : null;
  const prepaga = conta.is_prepay_account === true;
  const status = typeof conta.account_status === "number" ? conta.account_status : null;

  const gastoTotal = centavos(conta.amount_spent);
  // spend_cap "0" significa sem limite.
  const capBruto = centavos(conta.spend_cap);
  const limiteGasto = capBruto && capBruto > 0 ? capBruto : null;
  const restanteLimite =
    limiteGasto !== null && gastoTotal !== null
      ? arred(Math.max(0, limiteGasto - gastoTotal))
      : null;

  const saldoDisponivel = prepaga ? valorDoTexto(formaPagamento) : null;
  const aCobrar = prepaga ? null : centavos(conta.balance);

  const mediaDiaria7d = gasto7d !== null ? arred(gasto7d / 7) : null;
  // O que acabar primeiro para os anúncios: o saldo pré-pago ou o limite de gasto.
  const candidatos = [saldoDisponivel, restanteLimite].filter((v): v is number => v !== null);
  const base = candidatos.length ? Math.min(...candidatos) : null;
  const diasRestantes =
    base !== null && mediaDiaria7d !== null && mediaDiaria7d > 0
      ? Math.floor((base / mediaDiaria7d) * 10) / 10
      : null;

  return {
    contaId,
    nome: typeof conta.name === "string" ? conta.name : null,
    moeda: typeof conta.currency === "string" ? conta.currency : null,
    status,
    statusRotulo: status !== null ? (STATUS_CONTA[status] ?? `Status ${status}`) : null,
    prepaga,
    saldoDisponivel,
    aCobrar,
    gastoTotal,
    limiteGasto,
    restanteLimite,
    gastoHoje,
    mediaDiaria7d,
    diasRestantes,
    formaPagamento,
    consultadoEm: agora.toISOString(),
  };
}

async function gastoDoPeriodo(
  cliente: MetaGraphClient,
  contaId: string,
  datePreset: "today" | "last_7d",
): Promise<number | null> {
  const r = await cliente.get<{ data?: { spend?: string }[] }>(`${contaId}/insights`, {
    date_preset: datePreset,
    fields: "spend",
    level: "account",
  });
  // Sem gasto no período a Meta devolve data: [] — isso é zero, não "sem dado".
  const linha = r.data?.[0];
  return linha ? (numeroOuNulo(linha.spend) ?? 0) : 0;
}

export async function consultarSaldo(
  cliente: MetaGraphClient,
  agora = new Date(),
): Promise<SaldoConta> {
  const contaId = exigirAtivo(cliente.config, "adAccountId");
  const [conta, hoje, semana] = await Promise.all([
    cliente.get<Record<string, unknown>>(contaId, { fields: CAMPOS_SALDO }),
    gastoDoPeriodo(cliente, contaId, "today"),
    gastoDoPeriodo(cliente, contaId, "last_7d"),
  ]);
  return montarSaldo(contaId, conta, hoje, semana, agora);
}
