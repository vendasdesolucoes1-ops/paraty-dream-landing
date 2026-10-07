import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Estado vazio padrão de página/seção: ícone num selo com halo, título, uma
 * frase do que vai aparecer ali e, se houver, a ação para começar.
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
    <div className="flex animate-swap flex-col items-center gap-4 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-card text-muted-foreground shadow-[var(--shadow-card)] ring-1 ring-border">
        <span
          aria-hidden
          className="absolute inset-0 rounded-2xl bg-accent/20 blur-xl motion-safe:animate-drift"
        />
        <Icon className="relative h-6 w-6" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <p className="text-[0.9375rem] font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-[0.8125rem] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
