import type { ReactNode } from "react";

/**
 * Cabeçalho padrão de cada página do painel: eyebrow (categoria) + título +
 * descrição opcional, com espaço reservado para a ação principal à direita.
 * Antes cada página montava essa faixa à mão — metade tinha eyebrow, metade
 * não, o que quebrava a leitura de "em que seção eu estou" ao navegar.
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
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="eyebrow text-muted-foreground">{eyebrow}</p>
        <h1 className="text-3xl font-display text-primary">{title}</h1>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-3">{action}</div> : null}
    </div>
  );
}
