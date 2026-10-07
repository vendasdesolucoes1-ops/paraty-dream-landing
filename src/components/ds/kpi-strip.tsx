import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { useContagem } from "@/hooks/use-contagem";
import { formatNumero } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Faixa de indicadores: uma única superfície dividida em células, em vez de
 * quatro cartões soltos. Lê como uma linha de placar, e o número (serifa da
 * marca) é o que o olho pega primeiro.
 */
export function KpiStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-[var(--shadow-card)] lg:grid-cols-4">
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
  const exibido = useContagem(value);
  const miolo = (
    <>
      {destaque ? (
        <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-accent" />
      ) : null}
      <span className="flex items-center justify-between text-[0.8125rem] font-medium text-muted-foreground">
        {label}
        {to ? (
          <ArrowUpRight
            aria-hidden
            className="h-4 w-4 -translate-x-1 translate-y-1 opacity-0 transition-all duration-200 ease-[var(--ease-out)] group-hover/kpi:translate-x-0 group-hover/kpi:translate-y-0 group-hover/kpi:opacity-100 group-focus-visible/kpi:translate-x-0 group-focus-visible/kpi:translate-y-0 group-focus-visible/kpi:opacity-100"
          />
        ) : null}
      </span>
      {loading ? (
        <div className="mt-4 space-y-3" aria-hidden>
          <div className="h-11 w-20 animate-pulse rounded-md bg-muted" />
          <div className="h-3.5 w-28 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-end justify-between gap-3">
            <span
              className="num-display text-[3rem] leading-[0.95] text-foreground"
              aria-label={value === null || value === undefined ? undefined : formatNumero(value)}
            >
              {exibido === null
                ? value === null || value === undefined
                  ? "—"
                  : formatNumero(0)
                : formatNumero(exibido)}
            </span>
            {children}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
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

  const base = "group/kpi relative flex flex-col bg-card p-6";
  if (!to) return <div className={base}>{miolo}</div>;
  return (
    <Link
      to={to}
      className={cn(
        base,
        "transition-colors duration-150 hover:bg-muted/60 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      )}
    >
      {miolo}
    </Link>
  );
}
