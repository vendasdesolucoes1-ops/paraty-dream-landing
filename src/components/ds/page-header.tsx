import type { ReactNode } from "react";

/**
 * Topo de página do design system: título da página (serifa da marca),
 * contexto em uma linha e as ações principais à direita. Fica fora de card,
 * direto no fundo, para separar "onde estou" de "o que tem aqui".
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 className="font-display text-[2rem] leading-tight text-foreground sm:text-[2.35rem]">
          {title}
        </h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
