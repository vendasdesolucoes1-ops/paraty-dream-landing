import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Bloco da ficha: título pequeno em caixa-alta com fio, e os campos embaixo. */
export function Secao({
  titulo,
  children,
  className,
}: {
  titulo: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("min-w-0 space-y-4", className)}>
      <legend className="flex w-full items-center gap-3 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {titulo}
        <span aria-hidden className="h-px flex-1 bg-border" />
      </legend>
      {children}
    </fieldset>
  );
}

export function Campo({
  id,
  label,
  dica,
  children,
}: {
  id: string;
  label: string;
  dica?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {dica ? <p className="text-xs text-muted-foreground">{dica}</p> : null}
    </div>
  );
}

/** Input com ícone à esquerda (use `pl-9` no input). */
export function ComIcone({ icone: Icone, children }: { icone: LucideIcon; children: ReactNode }) {
  return (
    <div className="relative">
      <Icone
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      {children}
    </div>
  );
}
