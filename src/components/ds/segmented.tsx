import { cn } from "@/lib/utils";

/**
 * Alternador de visões lado a lado ("Para agir | Recentes"). Troca o conteúdo
 * do mesmo painel em vez de empilhar mais um bloco na página. O fundo branco
 * desliza até a opção escolhida; as opções têm largura igual para o
 * deslocamento ser exato.
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
  const indice = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative grid auto-cols-fr grid-flow-col rounded-lg bg-muted p-0.5 text-[0.8125rem]"
    >
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 rounded-md bg-card shadow-sm ring-1 ring-border/60 transition-transform duration-300 ease-[var(--ease-out)] motion-reduce:transition-none"
        style={{
          width: `calc((100% - 0.25rem) / ${options.length})`,
          transform: `translateX(${indice * 100}%)`,
        }}
      />
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
              "relative z-10 flex items-center justify-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ativo ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
            {o.count ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[0.7rem] leading-4 tabular-nums transition-colors",
                  ativo ? "bg-accent/30 text-foreground" : "bg-border/70 text-muted-foreground",
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
