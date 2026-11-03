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
  nutricao: "neutral",
};

export const STATUS_LABEL = Object.fromEntries(
  LEAD_STATUS_COLUMNS.map((s) => [s.value, s.label]),
) as Record<LeadStatus, string>;

/**
 * A lista única de origens, na ordem em que aparecem em filtros, chips,
 * relatórios e ficha. `automatica`: o sistema registra sozinho (a tela só
 * mostra, não troca). `importada`: veio em lote de um extrator.
 */
export const ORIGENS: {
  value: LeadOrigem;
  label: string;
  importada: boolean;
  automatica: boolean;
}[] = [
  { value: "formulario_meta", label: "Formulário Meta", importada: false, automatica: true },
  { value: "anuncio_whatsapp", label: "Anúncio WhatsApp", importada: false, automatica: true },
  { value: "whatsapp", label: "WhatsApp", importada: false, automatica: false },
  { value: "instagram", label: "Instagram", importada: false, automatica: false },
  { value: "lp", label: "Landing Page", importada: false, automatica: true },
  { value: "indicacao", label: "Indicação", importada: false, automatica: false },
  { value: "manual", label: "Cadastro manual", importada: false, automatica: false },
  { value: "whatsapp_contato", label: "Contatos do WhatsApp", importada: true, automatica: true },
  { value: "google_maps", label: "Google Maps", importada: true, automatica: true },
];

/** Nome amigável de qualquer origem (inclusive valores antigos/desconhecidos). */
export function rotuloOrigem(origem: string | null | undefined): string {
  if (!origem) return "Sem origem";
  return ORIGENS.find((o) => o.value === origem)?.label ?? origem;
}

/** Origem registrada pelo sistema: a ficha mostra, mas não deixa trocar. */
export function origemAutomatica(origem: string | null | undefined): boolean {
  return !!origem && !!ORIGENS.find((o) => o.value === origem)?.automatica;
}

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
