// Peças visuais compartilhadas pelas telas e gavetas de documentos: selo de
// arquivo, etiqueta de categoria e o esqueleto de gaveta (cabeçalho, seção,
// campo e rodapé) no mesmo padrão do formulário de lead.
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { DOCUMENTO_CATEGORIA_LABELS } from "@/lib/documento-utils";
import type { DocumentoCategoria } from "@/lib/types";
import { cn } from "@/lib/utils";
import { COR_CATEGORIA, estiloArquivo } from "@/components/documentos/documento-estilo";

/** Quadrado com o ícone do tipo de arquivo, tingido por token. */
export function IconeArquivo({ tipo, className }: { tipo: string; className?: string }) {
  const { icon: Icon, selo } = estiloArquivo(tipo);
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
        selo,
        className,
      )}
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

/** Etiqueta da categoria: ponto colorido + nome. */
export function CategoriaTag({
  categoria,
  className,
}: {
  categoria: DocumentoCategoria;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[0.72rem] font-medium leading-5 text-foreground",
        className,
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", COR_CATEGORIA[categoria])} />
      {DOCUMENTO_CATEGORIA_LABELS[categoria]}
    </span>
  );
}

/** Cabeçalho de gaveta: selo de ícone, título na serifa e uma linha de apoio. */
export function GavetaCabecalho({
  icon: Icon,
  titulo,
  descricao,
}: {
  icon: LucideIcon;
  titulo: string;
  descricao: ReactNode;
}) {
  return (
    <header className="flex items-center gap-4 border-b border-border px-7 pb-5 pt-7 pr-14">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <SheetTitle className="font-display text-[1.85rem] font-medium leading-none tracking-[-0.01em]">
          {titulo}
        </SheetTitle>
        <SheetDescription className="mt-1.5 text-[0.8125rem]">{descricao}</SheetDescription>
      </div>
    </header>
  );
}

/** Rodapé fixo da gaveta: dica de atalho à esquerda, botões à direita. */
export function GavetaRodape({
  dica,
  ocupado = false,
  children,
}: {
  dica?: ReactNode;
  /** Mostra um brilho correndo na borda de cima enquanto algo é salvo. */
  ocupado?: boolean;
  children: ReactNode;
}) {
  return (
    <footer className="relative flex items-center justify-between gap-3 border-t border-border bg-card px-7 py-4">
      {ocupado ? (
        <span
          aria-hidden
          className="skeleton-shimmer absolute inset-x-0 -top-px h-0.5 bg-accent/60"
        />
      ) : null}
      <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
        {dica}
      </span>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </footer>
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

/** Rótulo + controle + dica, com o espaçamento do formulário de lead. */
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
