import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Faixa "Para ligar a Sophia falta: …", perto do botão de ativar. */
export function PendenciasAtivacao({
  pendencias,
  className,
}: {
  pendencias: string[];
  className?: string;
}) {
  if (pendencias.length === 0) return null;
  return (
    <div
      role="alert"
      className={cn(
        "animate-swap flex gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-foreground">Para ligar a Sophia falta:</p>
        <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
          {pendencias.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
