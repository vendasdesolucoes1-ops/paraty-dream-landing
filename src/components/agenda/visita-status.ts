import type { Tone } from "@/components/ds/pill";
import type { VisitaStatus } from "@/lib/types";

export const STATUS_LABELS: Record<VisitaStatus, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  no_show: "No-show",
};

/** Ordem em que os estados aparecem em legendas e resumos. */
export const STATUS_ORDEM: VisitaStatus[] = [
  "agendada",
  "confirmada",
  "realizada",
  "no_show",
  "cancelada",
];

/**
 * Cor por estado, só por token: agendada = info, confirmada = success,
 * realizada = neutra (já passou), no-show = warning, cancelada = danger.
 */
export const STATUS_TONE: Record<VisitaStatus, Tone> = {
  agendada: "info",
  confirmada: "success",
  realizada: "neutral",
  cancelada: "danger",
  no_show: "warning",
};

/** Bolinha de legenda. */
export const STATUS_DOT: Record<VisitaStatus, string> = {
  agendada: "bg-info",
  confirmada: "bg-success",
  realizada: "bg-muted-foreground/60",
  cancelada: "bg-danger",
  no_show: "bg-warning",
};

/** Filete lateral do cartão de visita. */
export const STATUS_BARRA: Record<VisitaStatus, string> = {
  agendada: "bg-info",
  confirmada: "bg-success",
  realizada: "bg-chart-muted",
  cancelada: "bg-danger",
  no_show: "bg-warning",
};

/** Etiqueta compacta de evento no calendário: fundo suave, texto e filete do estado. */
export const STATUS_EVENTO: Record<VisitaStatus, string> = {
  agendada: "border-info bg-info-soft text-info",
  confirmada: "border-success bg-success-soft text-success",
  realizada: "border-chart-muted bg-muted text-muted-foreground",
  cancelada: "border-danger bg-danger-soft text-danger",
  no_show: "border-warning bg-warning-soft text-warning",
};
