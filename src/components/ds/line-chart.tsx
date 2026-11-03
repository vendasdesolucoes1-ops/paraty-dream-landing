import { useState, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

export interface SerieLinha {
  id: string;
  nome: string;
}

export interface PontoLinhas {
  rotulo: string;
  /** Valor de cada série no ponto; null = sem dado (a linha fica vazada). */
  valores: Record<string, number | null>;
}

/** Cores das séries: os tokens de gráfico do tema, em ordem. */
const CORES_SERIE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

/**
 * Gráfico de linhas com várias séries, em SVG e sem biblioteca (mesma régua do
 * AreaChart). Pontos vazios interrompem a linha. O ponteiro mostra, para o dia
 * mais próximo, o valor de cada série. A legenda fica abaixo.
 */
export function LineChart({
  series,
  pontos,
  formatar = (n) => String(n),
  altura = 160,
  rotuloGrafico,
  className,
}: {
  series: SerieLinha[];
  pontos: PontoLinhas[];
  formatar?: (n: number) => string;
  altura?: number;
  rotuloGrafico: string;
  className?: string;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const W = 600;
  const n = pontos.length;
  const todos = pontos.flatMap((p) =>
    series.map((s) => p.valores[s.id]).filter((v): v is number => v != null),
  );
  const maximo = Math.max(...todos, 1) * 1.15;
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => altura - (v / maximo) * (altura - 6) - 3;

  function trechos(id: string): string[] {
    const saida: string[] = [];
    let atual: string[] = [];
    pontos.forEach((p, i) => {
      const v = p.valores[id];
      if (v == null) {
        if (atual.length) saida.push(atual.join(" "));
        atual = [];
      } else {
        atual.push(`${atual.length ? "L" : "M"}${x(i)},${y(v)}`);
      }
    });
    if (atual.length) saida.push(atual.join(" "));
    return saida;
  }

  function mover(e: PointerEvent<HTMLDivElement>) {
    if (n < 2) return;
    const r = e.currentTarget.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setAtivo(Math.round(fx * (n - 1)));
  }

  const descricao = series
    .map(
      (s) =>
        `${s.nome}: ${pontos
          .map(
            (p) =>
              `${p.rotulo} ${p.valores[s.id] == null ? "sem dado" : formatar(p.valores[s.id]!)}`,
          )
          .join("; ")}`,
    )
    .join(". ");

  return (
    <div className={cn("min-w-0", className)}>
      <div
        className="relative select-none"
        style={{ height: altura }}
        onPointerMove={mover}
        onPointerLeave={() => setAtivo(null)}
        role="img"
        aria-label={`${rotuloGrafico}. ${descricao}`}
      >
        <svg
          viewBox={`0 0 ${W} ${altura}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
          aria-hidden
        >
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1="0"
              x2={W}
              y1={altura * f}
              y2={altura * f}
              stroke="var(--border)"
              strokeDasharray="3 5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {series.map((s, i) =>
            trechos(s.id).map((d, j) => (
              <path
                key={`${s.id}-${j}`}
                d={d}
                fill="none"
                stroke={CORES_SERIE[i % CORES_SERIE.length]}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )),
          )}
        </svg>
        {ativo !== null ? (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-px bg-foreground/15"
              style={{ left: `${(x(ativo) / W) * 100}%` }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 space-y-0.5 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-[0.72rem] text-background shadow-lg"
              style={{ left: `${Math.min(80, Math.max(20, (x(ativo) / W) * 100))}%` }}
            >
              <p className="font-medium">{pontos[ativo].rotulo}</p>
              {series.map((s, i) => {
                const v = pontos[ativo].valores[s.id];
                return (
                  <p key={s.id} className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: CORES_SERIE[i % CORES_SERIE.length] }}
                    />
                    <span className="max-w-[12rem] truncate">{s.nome}</span>
                    <b className="tabular-nums">{v == null ? "—" : formatar(v)}</b>
                  </p>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[0.75rem] text-muted-foreground">
        {series.map((s, i) => (
          <li key={s.id} className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: CORES_SERIE[i % CORES_SERIE.length] }}
            />
            <span className="max-w-[16rem] truncate">{s.nome}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
