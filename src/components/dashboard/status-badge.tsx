import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LoteStatus } from "@/lib/types";

const LOTE_STATUS_STYLES: Record<LoteStatus, string> = {
  disponivel: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  reservado: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  vendido: "bg-red-100 text-red-800 hover:bg-red-100",
};

const LOTE_STATUS_LABELS: Record<LoteStatus, string> = {
  disponivel: "Disponível",
  reservado: "Reservado",
  vendido: "Vendido",
};

export function LoteStatusBadge({ status }: { status: LoteStatus }) {
  return (
    <Badge className={cn("font-normal", LOTE_STATUS_STYLES[status])}>
      {LOTE_STATUS_LABELS[status]}
    </Badge>
  );
}
