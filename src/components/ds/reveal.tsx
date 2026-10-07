import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Entrada de bloco: sobe 10 px e aparece, em cascata (`ordem` × 70 ms). Só
 * roda uma vez, quando a tela monta; atualizações de dados não reanimam.
 */
export function Reveal({
  ordem = 0,
  className,
  children,
}: {
  ordem?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("animate-rise", className)}
      style={{ "--atraso": `${ordem * 70}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
