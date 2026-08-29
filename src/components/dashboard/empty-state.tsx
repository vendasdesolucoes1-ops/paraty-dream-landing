import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Estado vazio padrão de página/seção. Antes cada página tinha sua própria
 * variação de "Card com texto centralizado" — mesma ideia, detalhes
 * ligeiramente diferentes. Um componente só, com ícone, deixa o "não tem
 * nada aqui ainda" reconhecível em qualquer canto do painel.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        {description ? (
          <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
