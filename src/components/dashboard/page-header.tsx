import type { ReactNode } from "react";

/**
 * Cabeçalho padrão das telas internas do painel: categoria em caixa-alta, título
 * na serifa da marca, descrição e as ações à direita. A mesma peça em toda tela
 * é o que faz o painel parecer um produto só.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <span aria-hidden className="h-px w-5 bg-accent" />
          {eyebrow}
        </p>
        <h1 className="mt-2.5 text-balance font-display text-[2.2rem] font-medium leading-[1.05] tracking-[-0.02em] text-foreground sm:text-[2.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2.5 max-w-2xl text-pretty text-[0.9375rem] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}
