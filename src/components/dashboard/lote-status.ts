import type { Tone } from "@/components/ds/pill";
import type { LoteStatus } from "@/lib/types";

/** Disponível = success, reservado = warning, vendido = danger (só tokens). */
export const LOTE_STATUS_TONE: Record<LoteStatus, Tone> = {
  disponivel: "success",
  reservado: "warning",
  vendido: "danger",
};

/** Bolinha/barra sólida do estado, para legendas, resumos e itens de menu. */
export const LOTE_STATUS_DOT: Record<LoteStatus, string> = {
  disponivel: "bg-success",
  reservado: "bg-warning",
  vendido: "bg-danger",
};

export const LOTE_STATUS_LABELS: Record<LoteStatus, string> = {
  disponivel: "Disponível",
  reservado: "Reservado",
  vendido: "Vendido",
};
