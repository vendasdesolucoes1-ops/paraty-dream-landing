import { cn } from "@/lib/utils";

const COR: Record<string, { ponto: string; anel: string }> = {
  success: { ponto: "bg-success", anel: "bg-success/50" },
  warning: { ponto: "bg-warning", anel: "bg-warning/50" },
  danger: { ponto: "bg-danger", anel: "bg-danger/50" },
  info: { ponto: "bg-info", anel: "bg-info/50" },
  neutral: { ponto: "bg-muted-foreground/50", anel: "bg-muted-foreground/30" },
};

/**
 * Indicador de estado: um ponto com anel que pulsa quando `vivo`. Só cor de
 * token; o anel é cortado com "reduzir movimento".
 */
export function PontoVivo({
  tom = "neutral",
  vivo = false,
  className,
}: {
  tom?: "success" | "warning" | "danger" | "info" | "neutral";
  vivo?: boolean;
  className?: string;
}) {
  const c = COR[tom];
  return (
    <span aria-hidden className={cn("relative inline-flex h-2.5 w-2.5 shrink-0", className)}>
      {vivo ? (
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full motion-safe:animate-ping",
            c.anel,
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", c.ponto)} />
    </span>
  );
}
