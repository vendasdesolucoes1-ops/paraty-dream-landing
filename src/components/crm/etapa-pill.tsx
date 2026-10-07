import { cn } from "@/lib/utils";
import type { LeadStatus } from "@/lib/types";
import { ETAPA_COR, ETAPA_ROTULO } from "@/components/crm/etapas";

/** Bolinha da etapa. Decorativa: o nome da etapa sempre vem em texto ao lado. */
export function EtapaDot({ etapa, className }: { etapa: LeadStatus; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("h-2 w-2 shrink-0 rounded-full", ETAPA_COR[etapa], className)}
    />
  );
}

/** Etiqueta da etapa (bolinha + nome) para cabeçalhos e listas. */
export function EtapaPill({ etapa, className }: { etapa: LeadStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-2.5 py-0.5 text-[0.72rem] font-medium leading-5 text-foreground",
        className,
      )}
    >
      <EtapaDot etapa={etapa} className="h-1.5 w-1.5" />
      {ETAPA_ROTULO[etapa] ?? etapa}
    </span>
  );
}
