import { cn } from "@/lib/utils";

/**
 * Alternador de visões lado a lado ("Para agir | Recentes"). Troca o conteúdo
 * do mesmo painel em vez de empilhar mais um bloco na página.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number | null }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg bg-muted p-0.5 text-[0.8rem]"
    >
      {options.map((o) => {
        const ativo = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ativo
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
            {o.count ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[0.7rem] leading-4 tabular-nums",
                  ativo ? "bg-accent/25 text-foreground" : "bg-border/70 text-muted-foreground",
                )}
              >
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
