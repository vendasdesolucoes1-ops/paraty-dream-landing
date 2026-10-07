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
        "flex min-w-0 flex-col rounded-xl border border-border bg-card text-card-foreground",
        className,
      )}
    >
      <header className="flex min-h-[3.75rem] items-center justify-between gap-4 px-5 py-3.5">
        <div className="min-w-0">
          <h2
            id={id}
            className="truncate font-sans text-[0.95rem] font-semibold tracking-tight text-foreground"
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 truncate text-[0.8rem] text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={cn("flex flex-1 flex-col pb-4", flush ? "px-0" : "px-5")}>{children}</div>
    </section>
  );
}

/** Link discreto do canto de um painel ("Ver agenda"). */
export const LINK_PAINEL =
  "text-[0.8rem] font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded";
