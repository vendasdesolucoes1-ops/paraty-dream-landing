import type { ComponentType, ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Bloco do formulário: título pequeno em caixa-alta com fio, e os campos embaixo. */
export function Secao({
  titulo,
  descricao,
  children,
  className,
}: {
  titulo: string;
  descricao?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("min-w-0 space-y-4", className)}>
      <legend className="flex w-full items-center gap-3 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {titulo}
        <span aria-hidden className="h-px flex-1 bg-border" />
      </legend>
      {descricao ? (
        <p className="-mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">{descricao}</p>
      ) : null}
      {children}
    </fieldset>
  );
}

/** Rótulo + controle + dica, com o mesmo respiro em todo formulário. */
export function Campo({
  id,
  label,
  obrigatorio,
  dica,
  className,
  children,
}: {
  id?: string;
  label: ReactNode;
  obrigatorio?: boolean;
  dica?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label htmlFor={id} className="flex items-center gap-1">
        {label}
        {obrigatorio ? (
          <span aria-hidden className="text-danger">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {dica ? <p className="text-xs leading-relaxed text-muted-foreground">{dica}</p> : null}
    </div>
  );
}

/** Campo com ícone à esquerda (o input precisa de `pl-9`). */
export function ComIcone({
  icone: Icone,
  children,
}: {
  icone: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
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

/**
 * Linha de ajuste: o que é e o que faz à esquerda, o controle (switch, botão)
 * à direita. Empilha em tela estreita.
 */
export function LinhaAjuste({
  titulo,
  descricao,
  controle,
  className,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  controle: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4 first:pt-0 last:pb-0",
        className,
      )}
    >
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-[0.875rem] font-medium leading-snug text-foreground">{titulo}</p>
        {descricao ? (
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
            {descricao}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">{controle}</div>
    </div>
  );
}

/** Selo de ícone dos cabeçalhos de cartão: quadrado suave, sempre do mesmo tamanho. */
export function SeloIcone({
  icone: Icone,
  className,
}: {
  icone: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground ring-1 ring-border",
        className,
      )}
    >
      <Icone className="h-[18px] w-[18px]" />
    </span>
  );
}
