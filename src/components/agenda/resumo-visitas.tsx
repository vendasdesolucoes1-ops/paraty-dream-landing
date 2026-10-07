import { useMemo } from "react";
import type { VisitaStatus, VisitaWithRelations } from "@/lib/types";
import { STATUS_DOT, STATUS_LABELS, STATUS_ORDEM } from "@/components/agenda/visita-status";
import { cn } from "@/lib/utils";

/**
 * Faixa de leitura do período: quantas visitas e quantas em cada estado. As
 * bolinhas são as mesmas cores dos eventos, então também servem de legenda.
 */
export function ResumoVisitas({
  visitas,
  className,
}: {
  visitas: VisitaWithRelations[];
  className?: string;
}) {
  const { total, porStatus } = useMemo(() => {
    const contagem = new Map<VisitaStatus, number>();
    for (const v of visitas) contagem.set(v.status, (contagem.get(v.status) ?? 0) + 1);
    return {
      total: visitas.length,
      porStatus: STATUS_ORDEM.filter((s) => contagem.has(s)).map((s) => ({
        status: s,
        n: contagem.get(s) ?? 0,
      })),
    };
  }, [visitas]);

  if (total === 0) return null;

  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[0.8125rem] text-muted-foreground",
        className,
      )}
    >
      <span>
        <strong className="num text-[0.9375rem] text-foreground">{total}</strong>{" "}
        {total === 1 ? "visita" : "visitas"} no período
      </span>
      {porStatus.map(({ status, n }) => (
        <span key={status} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("h-2 w-2 rounded-full", STATUS_DOT[status])} />
          {STATUS_LABELS[status]}
          <strong className="font-semibold tabular-nums text-foreground">{n}</strong>
        </span>
      ))}
    </p>
  );
}
