import { useState, type ComponentType, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Cartão de ferramenta: na grade é um atalho (ícone, nome, o que faz); ao
 * abrir, a ferramenta ganha uma gaveta larga, com espaço para formulário e
 * tabelas. O estado da ferramenta vive no componente que usa o ToolCard, então
 * fechar a gaveta não interrompe nada que esteja rodando.
 */
export function ToolCard({
  icon: Icon,
  title,
  subtitle,
  defaultOpen = false,
  status,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  defaultOpen?: boolean;
  /** Selo de estado no canto do cartão (ex.: "Em andamento"). */
  status?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          "card-hover group/ferramenta relative flex h-full w-full flex-col items-start gap-5 rounded-2xl border border-border bg-card p-6 text-left shadow-[var(--shadow-card)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        <span className="flex w-full items-start justify-between gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground ring-1 ring-border transition-[background-color,color,transform] duration-200 ease-[var(--ease-out)] group-hover/ferramenta:scale-105 group-hover/ferramenta:bg-primary group-hover/ferramenta:text-primary-foreground motion-reduce:transform-none">
            <Icon className="h-5 w-5" />
          </span>
          {status ? <span className="mt-1">{status}</span> : null}
        </span>
        <span className="block min-w-0 flex-1 space-y-1.5">
          <span className="block font-sans text-[1.0625rem] font-semibold leading-snug tracking-[-0.014em] text-foreground">
            {title}
          </span>
          <span className="block text-pretty text-[0.8125rem] leading-relaxed text-muted-foreground">
            {subtitle}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-muted-foreground transition-colors group-hover/ferramenta:text-foreground">
          Abrir ferramenta
          <ArrowUpRight
            aria-hidden
            className="h-3.5 w-3.5 transition-transform duration-200 ease-[var(--ease-out)] group-hover/ferramenta:-translate-y-0.5 group-hover/ferramenta:translate-x-0.5 motion-reduce:transform-none"
          />
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-[46rem]">
          <header className="flex items-center gap-4 border-b border-border px-7 pb-5 pr-14 pt-7">
            <span
              aria-hidden
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <SheetTitle className="font-display text-[1.75rem] font-medium leading-none tracking-[-0.01em]">
                {title}
              </SheetTitle>
              <SheetDescription className="mt-1.5 text-[0.8125rem] leading-snug">
                {subtitle}
              </SheetDescription>
            </div>
          </header>
          <div className="flex-1 space-y-6 overflow-y-auto px-7 py-6">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
