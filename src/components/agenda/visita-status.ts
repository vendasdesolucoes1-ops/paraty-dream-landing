import type { VisitaStatus } from "@/lib/types";

// Refined, desaturated status palette — muted tones that sit well against the
// forest/sand/ivory design system (no loud generic colors).
// agendada = azul acinzentado · confirmada = verde · realizada = cinza opaco
// cancelada = vermelho terracota · no_show = laranja queimado
export const STATUS_STYLES: Record<VisitaStatus, string> = {
  agendada: "bg-[#e4e8ee] text-[#45566d] hover:bg-[#e4e8ee]",
  confirmada: "bg-[#dcebe1] text-[#356b47] hover:bg-[#dcebe1]",
  realizada: "bg-[#ecebe5] text-[#8a8578] hover:bg-[#ecebe5]",
  cancelada: "bg-[#efe0d9] text-[#9c4a2f] hover:bg-[#efe0d9]",
  no_show: "bg-[#f3e6d2] text-[#a5561b] hover:bg-[#f3e6d2]",
};

// Solid dot/border tint per status, for compact calendar chips.
export const STATUS_DOT: Record<VisitaStatus, string> = {
  agendada: "#7688a3",
  confirmada: "#4f8a63",
  realizada: "#a8a294",
  cancelada: "#b3673f",
  no_show: "#c07a2c",
};

export const STATUS_LABELS: Record<VisitaStatus, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  no_show: "No-show",
};

// Stable per-salesperson accent color so each vendedor's visits are
// recognizable at a glance without reading the name. Muted, palette-friendly.
const VENDOR_COLORS = [
  "#4f7a63", // forest green
  "#b08a4a", // gold/ochre
  "#6b7f9e", // slate blue
  "#a5633f", // terracotta
  "#7a6a95", // muted purple
  "#4f8790", // teal
  "#9c7b52", // sand brown
  "#8a5a6a", // dusty rose
];

export function vendorColor(vendedorId: string | null | undefined): string {
  if (!vendedorId) return "#c9c2b4"; // neutral for unassigned
  let hash = 0;
  for (let i = 0; i < vendedorId.length; i++) {
    hash = (hash * 31 + vendedorId.charCodeAt(i)) >>> 0;
  }
  return VENDOR_COLORS[hash % VENDOR_COLORS.length];
}

export function vendorInitials(nome: string | null | undefined): string {
  if (!nome) return "?";
  const parts = nome.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
