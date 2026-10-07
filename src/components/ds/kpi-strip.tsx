import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { formatNumero } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Faixa de indicadores: uma única superfície dividida em células, em vez de
 * quatro cartões soltos. Lê como uma linha de placar, e o número (serifa da
 * marca) é o que o olho pega primeiro.
 */
export function KpiStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
      {children}
    </div>
  );
}

export function KpiCell({
  label,
  value,
  context,
  delta,
  to,
  loading,
  destaque = false,
  children,
}: {
  label: string;
  value: number | null | undefined;
  context?: ReactNode;
  /** Variação contra o período anterior; positiva aparece em verde. */
  delta?: { valor: number; rotulo: string } | null;
  to?: "/dashboard/crm" | "/dashboard/agenda" | "/dashboard/lotes";
  loading?: boolean;
  /** Barra dourada no topo: o número pede atenção. */
  destaque?: boolean;
  /** Mini-gráfico à direita do número. */
  children?: ReactNode;
}) {
  const miolo = (
    <>
      {destaque ? <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-accent" /> : null}
      <span className="text-[0.8rem] font-medium text-muted-foreground">{label}</span>
      {loading ? (
        <div className="mt-3 space-y-2.5" aria-hidden>
          <div className="h-10 w-20 animate-pulse rounded-md bg-muted" />
          <div className="h-3.5 w-28 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <>
          <div className="mt-1.5 flex items-end justify-between gap-3">
            <span className="num-display text-[2.9rem] leading-none text-foreground">
              {value === null || value === undefined ? "—" : formatNumero(value)}
            </span>
            {children}
          </div>
          <div className="mt-2.5 flex items-center gap-2 text-[0.78rem] text-muted-foreground">
            {delta ? (
              <span
                className={cn(
                  "font-medium tabular-nums",
                  delta.valor > 0 ? "text-success" : "text-muted-foreground",
                )}
              >
                {delta.valor > 0 ? "▲" : delta.valor < 0 ? "▼" : "="}{" "}
                {delta.valor === 0 ? "" : Math.abs(delta.valor)} {delta.rotulo}
              </span>
            ) : null}
            {context ? <span className="truncate">{context}</span> : null}
          </div>
        </>
      )}
    </>
  );

  const base = "relative flex flex-col bg-card p-5";
  if (!to) return <div className={base}>{miolo}</div>;
  return (
    <Link
      to={to}
      className={cn(
        base,
        "transition-colors hover:bg-muted/50 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      )}
    >
      {miolo}
    </Link>
  );
}
