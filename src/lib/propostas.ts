// Propostas (issue #58) e forecast de vendas. Tipadas aqui porque os tipos
// gerados do Supabase ainda não conhecem a tabela nem a função — a migration
// 20261017000200_propostas.sql é aplicada à mão.
import type { Tone } from "@/components/ds/pill";
import type { Lote } from "@/lib/types";

export type PropostaStatus = "rascunho" | "enviada" | "aceita" | "recusada" | "expirada";

export interface Proposta {
  id: string;
  lead_id: string;
  lote_id: string | null;
  valor_total: number;
  entrada: number | null;
  parcelas: number | null;
  condicoes: string | null;
  /** Calculada no banco: última versão do mesmo lead + lote, mais um. */
  versao: number;
  status: PropostaStatus;
  valida_ate: string | null;
  /** Preenchido pelo banco quando o status vira "aceita". */
  aceite_em: string | null;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface PropostaComLote extends Proposta {
  lote: Pick<Lote, "id" | "numero_lote" | "quadra" | "metragem"> | null;
}

export const PROPOSTA_STATUS_OPTIONS: { value: PropostaStatus; label: string; tone: Tone }[] = [
  { value: "rascunho", label: "Rascunho", tone: "neutral" },
  { value: "enviada", label: "Enviada", tone: "info" },
  { value: "aceita", label: "Aceita", tone: "success" },
  { value: "recusada", label: "Recusada", tone: "danger" },
  { value: "expirada", label: "Expirada", tone: "warning" },
];

export const PROPOSTA_STATUS_LABEL = Object.fromEntries(
  PROPOSTA_STATUS_OPTIONS.map((o) => [o.value, o.label]),
) as Record<PropostaStatus, string>;

export const PROPOSTA_STATUS_TONE = Object.fromEntries(
  PROPOSTA_STATUS_OPTIONS.map((o) => [o.value, o.tone]),
) as Record<PropostaStatus, Tone>;

/** Em negociação: são as que entram no forecast. */
export const PROPOSTA_ABERTA: PropostaStatus[] = ["rascunho", "enviada"];

/** Uma linha de `forecast_mensal`. O Postgres devolve numeric como string. */
export interface ForecastMes {
  mes: string;
  ponderado: number;
  em_aberto: number;
  realizado: number;
  propostas_abertas: number;
  compras: number;
}

export function normalizarForecast(
  linhas: Record<keyof ForecastMes, string | number>[],
): ForecastMes[] {
  return linhas.map((l) => ({
    mes: String(l.mes),
    ponderado: Number(l.ponderado) || 0,
    em_aberto: Number(l.em_aberto) || 0,
    realizado: Number(l.realizado) || 0,
    propostas_abertas: Number(l.propostas_abertas) || 0,
    compras: Number(l.compras) || 0,
  }));
}

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const moedaCompacta = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

export const formatMoeda = (n: number | null | undefined) => (n == null ? "—" : moeda.format(n));
export const formatMoedaCompacta = (n: number) => moedaCompacta.format(n);

/** "2026-11-01" → "nov/26". Lê a data como local para o fuso não voltar um mês. */
export function rotuloMes(iso: string): string {
  const [ano, mes] = iso.slice(0, 10).split("-").map(Number);
  const nome = new Date(ano, mes - 1, 1)
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", "");
  return `${nome}/${String(ano).slice(2)}`;
}

/** "Lote 12 · Quadra B" — o mesmo rótulo do diálogo de compra. */
export function rotuloLote(lote: Pick<Lote, "numero_lote" | "quadra"> | null): string {
  if (!lote) return "Sem lote definido";
  return lote.quadra
    ? `Lote ${lote.numero_lote} · Quadra ${lote.quadra}`
    : `Lote ${lote.numero_lote}`;
}

/**
 * "05/11/2026". Data pura ("2026-11-05") é lida como local — `new Date` a
 * trataria como UTC e mostraria o dia anterior no Brasil.
 */
export function formatDataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
    : new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
