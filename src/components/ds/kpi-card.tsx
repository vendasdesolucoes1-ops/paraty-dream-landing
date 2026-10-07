import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { formatNumero } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Indicador do topo da tela: um número, o que ele é e uma linha de contexto
 * (comparação ou próximo passo). Quando tem destino, o card inteiro é o link:
 * o número que chama atenção é exatamente onde a pessoa clica.
 */
export function KpiCard({
  label,
  value,
  context,
  icon: Icon,
  to,
  search,
  loading,
  highlight = false,
}: {
  label: string;
  value: number | null | undefined;
  context?: ReactNode;
  icon: LucideIcon;
  /** Rota do painel para onde o card leva. */
  to?: "/dashboard/crm" | "/dashboard/agenda" | "/dashboard/lotes";
  search?: Record<string, string>;
  loading?: boolean;
  /** Destaca o card quando o número pede ação (ex.: visitas hoje > 0). */
  highlight?: boolean;
}) {
  const conteudo = (
    <>
      <div className="flex flex-1 items-start justify-between gap-3">
        <span className="text-[0.8rem] font-medium leading-snug text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md",
            highlight ? "bg-accent/20 text-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      {loading ? (
        <div className="mt-3 space-y-2" aria-hidden>
          <div className="h-8 w-16 animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-28 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <>
          <p className="mt-2 font-sans text-[2rem] font-semibold leading-none tracking-tight tabular-nums text-foreground">
            {value === null || value === undefined ? "—" : formatNumero(value)}
          </p>
          {context ? (
            <p className="mt-2 truncate text-[0.78rem] text-muted-foreground">{context}</p>
          ) : null}
        </>
      )}
    </>
  );

  const base =
    "flex flex-col rounded-lg border bg-card p-4 shadow-[var(--shadow-card)] transition-[border-color,box-shadow,transform] duration-200";

  if (!to) {
    return <div className={cn(base, "border-border")}>{conteudo}</div>;
  }

  return (
    <Link
      to={to}
      search={search}
      className={cn(
        base,
        "border-border hover:-translate-y-px hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0",
        highlight && "border-accent/60",
      )}
    >
      {conteudo}
    </Link>
  );
}
