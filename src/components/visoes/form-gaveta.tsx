import type { ComponentType, FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Kbd } from "@/components/ds/kbd";

/**
 * Gaveta de formulário no padrão do painel (a mesma de "Novo cliente"):
 * cabeçalho com selo e título na serifa, corpo rolável em seções, rodapé fixo
 * com Cancelar / salvar e a dica de ⌘↵. Quem usa só cuida dos campos e da
 * mutação; abrir, fechar e enviar com o teclado ficam aqui.
 */
export function FormGaveta({
  open,
  onOpenChange,
  trigger,
  icone: Icone,
  titulo,
  subtitulo,
  descricao,
  formId,
  onSubmit,
  rotuloSalvar,
  rotuloSalvando = "Salvando…",
  rotuloAtalho,
  salvando,
  erro,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
  icone: ComponentType<{ className?: string }>;
  titulo: string;
  subtitulo?: string;
  descricao: string;
  formId: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  rotuloSalvar: string;
  rotuloSalvando?: string;
  rotuloAtalho: string;
  salvando: boolean;
  erro?: string | null;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-[31rem]">
        <SheetTitle className="sr-only">{titulo}</SheetTitle>
        <SheetDescription className="sr-only">{descricao}</SheetDescription>

        <header className="flex items-center gap-4 border-b border-border px-7 pb-5 pt-7">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Icone className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2
              aria-hidden
              className="font-display text-[1.85rem] font-medium leading-none tracking-[-0.01em]"
            >
              {titulo}
            </h2>
            {subtitulo ? (
              <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">{subtitulo}</p>
            ) : null}
          </div>
        </header>

        <form
          id={formId}
          onSubmit={onSubmit}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.requestSubmit();
            }
          }}
          className="flex-1 space-y-8 overflow-y-auto px-7 py-6"
        >
          {children}
          {erro ? (
            <p
              role="alert"
              className="rounded-lg bg-danger-soft px-3 py-2.5 text-[0.8125rem] text-danger"
            >
              {erro}
            </p>
          ) : null}
        </form>

        <footer className="flex items-center justify-between gap-3 border-t border-border bg-card px-7 py-4">
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd> {rotuloAtalho}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" form={formId} disabled={salvando}>
              {salvando ? rotuloSalvando : rotuloSalvar}
            </Button>
          </div>
        </footer>
      </SheetContent>
    </Sheet>
  );
}

/** Bloco do formulário: título pequeno em caixa-alta com fio, e os campos embaixo. */
export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
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
  obrigatorio,
  dica,
  children,
}: {
  id: string;
  label: string;
  obrigatorio?: boolean;
  dica?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1">
        {label}
        {obrigatorio ? (
          <span aria-hidden className="text-danger">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {dica ? <p className="text-xs text-muted-foreground">{dica}</p> : null}
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
      <Icone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      {children}
    </div>
  );
}
