import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Bloco de conteúdo do painel: título, descrição curta, ação à direita e o
 * corpo. Toda seção de toda tela usa este mesmo envelope, então o olho
 * aprende onde fica o título e onde fica "ver tudo" uma vez só.
 */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Painéis com lista encostam o conteúdo nas bordas: passe "p-0". */
  bodyClassName?: string;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "flex min-w-0 flex-col rounded-lg border border-border bg-card text-card-foreground shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2
            id={id}
            className="font-sans text-[0.95rem] font-semibold tracking-tight text-foreground"
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-[0.8rem] text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={cn("flex-1 px-5 pb-5", bodyClassName)}>{children}</div>
    </section>
  );
}
