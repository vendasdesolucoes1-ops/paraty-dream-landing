import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Seção do painel: título, descrição curta, ação à direita e o corpo.
 * Sem sombra e sem fundo próprio além do branco: o contorno de 1 px separa, e a
 * página respira. Listas encostam nas bordas (`flush`) e trazem os próprios
 * divisores.
 */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  flush = false,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Corpo sem padding lateral, para listas de linha inteira. */
  flush?: boolean;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border border-border bg-card text-card-foreground shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <header className="flex min-h-[4.5rem] flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
        <div className="min-w-[10rem] flex-1">
          <h2
            id={id}
            className="truncate font-sans text-[1rem] font-semibold leading-snug tracking-[-0.011em] text-foreground"
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 truncate text-[0.8125rem] leading-snug text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={cn("flex flex-1 flex-col pb-6", flush ? "px-0" : "px-6")}>{children}</div>
    </section>
  );
}

/** Link discreto do canto de um painel ("Ver agenda"). */
export const LINK_PAINEL =
  "-mx-2 rounded-md px-2 py-1 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
