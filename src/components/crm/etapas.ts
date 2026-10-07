import { LEAD_STATUS_COLUMNS, type LeadStatus } from "@/lib/types";

/**
 * Cor de cada etapa do funil, só por token. A bolinha é o único lugar onde a
 * etapa ganha cor: o resto do quadro fica neutro para o olho achar o que mudou.
 */
export const ETAPA_COR: Record<LeadStatus, string> = {
  novo: "bg-info",
  qualificado: "bg-chart-3",
  agendado: "bg-warning",
  visitou: "bg-chart-6",
  proposta: "bg-chart-2",
  fechado: "bg-success",
  perdido: "bg-danger",
};

export const ETAPA_ROTULO = Object.fromEntries(
  LEAD_STATUS_COLUMNS.map((c) => [c.value, c.label]),
) as Record<LeadStatus, string>;
