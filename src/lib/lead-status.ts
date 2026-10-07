import type { Tone } from "@/components/ds/pill";
import { LEAD_STATUS_COLUMNS, type LeadOrigem, type LeadStatus } from "@/lib/types";

/** Tom de cada etapa do funil, para Pill e gráficos. Um mapa só para o painel inteiro. */
export const STATUS_TONE: Record<LeadStatus, Tone> = {
  novo: "neutral",
  qualificado: "info",
  agendado: "accent",
  visitou: "accent",
  proposta: "warning",
  fechado: "success",
  perdido: "danger",
};

export const STATUS_LABEL = Object.fromEntries(
  LEAD_STATUS_COLUMNS.map((s) => [s.value, s.label]),
) as Record<LeadStatus, string>;

/**
 * Todas as origens que existem no banco. LEAD_ORIGEM_OPTIONS (types.ts) lista
 * só as quatro do formulário manual e deixa de fora as duas dos extratores,
 * que então apareceriam como "sem origem".
 */
export const ORIGENS: { value: LeadOrigem; label: string; importada: boolean }[] = [
  { value: "lp", label: "Landing Page", importada: false },
  { value: "whatsapp", label: "WhatsApp", importada: false },
  { value: "indicacao", label: "Indicação", importada: false },
  { value: "instagram", label: "Instagram", importada: false },
  { value: "whatsapp_contato", label: "Contatos do WhatsApp", importada: true },
  { value: "google_maps", label: "Google Maps", importada: true },
];

export const ORIGEM_LABEL = Object.fromEntries(ORIGENS.map((o) => [o.value, o.label])) as Record<
  LeadOrigem,
  string
>;

/** Origens importadas em lote por extratores: não medem demanda do dia. */
export const ORIGENS_IMPORTADAS = ORIGENS.filter((o) => o.importada).map((o) => o.value);

/** Etapas em que o lead ainda está em negociação (nem fechado, nem perdido). */
export const STATUS_EM_ANDAMENTO: LeadStatus[] = [
  "novo",
  "qualificado",
  "agendado",
  "visitou",
  "proposta",
];
