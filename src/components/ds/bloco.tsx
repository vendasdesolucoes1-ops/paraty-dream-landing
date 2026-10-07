import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Seção da página: título, descrição, ação e o corpo, direto sobre a folha.
 * Sem caixa: quem separa uma seção da outra é o espaço (e, quando a página é
 * longa, um fio fino em `divisor`). Cartão só entra onde o conteúdo é um
 * objeto à parte (o destaque da tela, um formulário), nunca como moldura.
 */
export function Bloco({
  titulo,
  descricao,
  acao,
  divisor = false,
  children,
  className,
}: {
  titulo: string;
  descricao?: ReactNode;
  acao?: ReactNode;
  divisor?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn("min-w-0", divisor && "border-t border-border pt-8", className)}
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2
            id={id}
            className="font-sans text-[1.0625rem] font-semibold leading-snug tracking-[-0.014em] text-foreground"
          >
            {titulo}
          </h2>
          {descricao ? (
            <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted-foreground">
              {descricao}
            </p>
          ) : null}
        </div>
        {acao ? <div className="shrink-0">{acao}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** Link discreto do canto de um bloco ("Ver agenda"). */
export const LINK_BLOCO =
  "-mx-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
