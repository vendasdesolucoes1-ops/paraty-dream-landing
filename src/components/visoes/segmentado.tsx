import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface OpcaoSegmentada<T extends string> {
  valor: T;
  rotulo: string;
  icone?: ReactNode;
}

/**
 * Alternador de visões (Lista · Semana · Mês, Tabela · Planta · 3D). O
 * "dedo" claro desliza até a opção escolhida em vez de trocar de cor no
 * lugar; as colunas têm a mesma largura para o cálculo ser só uma translação.
 * Setas do teclado mudam a opção, como num grupo de rádio.
 */
export function Segmentado<T extends string>({
  valor,
  onChange,
  opcoes,
  rotulo,
  className,
}: {
  valor: T;
  onChange: (valor: T) => void;
  opcoes: OpcaoSegmentada<T>[];
  rotulo: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const indice = Math.max(
    0,
    opcoes.findIndex((o) => o.valor === valor),
  );

  function aoTeclar(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    let alvo = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") alvo = (i + 1) % opcoes.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      alvo = (i - 1 + opcoes.length) % opcoes.length;
    else if (e.key === "Home") alvo = 0;
    else if (e.key === "End") alvo = opcoes.length - 1;
    if (alvo < 0) return;
    e.preventDefault();
    onChange(opcoes[alvo].valor);
    refs.current[alvo]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={rotulo}
      className={cn("relative inline-grid rounded-xl bg-muted p-1", className)}
      style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 left-1 rounded-lg bg-card shadow-[0_1px_2px_oklch(0.2_0.03_250/0.1),0_0_0_1px_oklch(0.2_0.03_250/0.05)] transition-transform duration-300 ease-[var(--ease-out)] motion-reduce:transition-none"
        style={{
          width: `calc((100% - 0.5rem) / ${opcoes.length})`,
          transform: `translateX(${indice * 100}%)`,
        }}
      />
      {opcoes.map((o, i) => {
        const ativo = o.valor === valor;
        return (
          <button
            key={o.valor}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={ativo}
            tabIndex={ativo ? 0 : -1}
            onClick={() => onChange(o.valor)}
            onKeyDown={(e) => aoTeclar(e, i)}
            className={cn(
              "relative z-10 inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-[0.8125rem] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0",
              ativo ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.icone}
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
