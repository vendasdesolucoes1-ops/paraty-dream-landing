import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Filtro em forma de pílula, com contagem. `ativo` marca a escolha atual. */
export function Chip({
  ativo,
  onClick,
  contagem,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  contagem?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[0.8125rem] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15",
        ativo
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {children}
      {contagem !== undefined ? (
        <span
          className={cn(
            "rounded-full px-1.5 text-[0.7rem] leading-[1.15rem] tabular-nums",
            ativo ? "bg-background/20" : "bg-muted",
          )}
        >
          {contagem}
        </span>
      ) : null}
    </button>
  );
}
