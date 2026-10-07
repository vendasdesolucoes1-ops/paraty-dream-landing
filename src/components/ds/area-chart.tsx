import { useId, useState, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

export interface PontoArea {
  rotulo: string;
  valor: number;
}

/** Curva suave (Catmull-Rom → Bézier) que passa por todos os pontos. */
function curva(pts: [number, number][], min: number, max: number): string {
  const lim = (y: number) => Math.min(max, Math.max(min, y));
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = lim(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = lim(p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/**
 * Gráfico de área em SVG, sem biblioteca. A linha e o preenchimento escalam
 * com a largura (`preserveAspectRatio="none"` + traço não escalável); os
 * marcadores e a dica ficam em HTML para não distorcer. O ponteiro escolhe o
 * ponto mais próximo; o último ponto (hoje) leva o dourado.
 */
export function AreaChart({
  dados,
  altura = 120,
  interativo = true,
  rotuloGrafico,
  className,
}: {
  dados: PontoArea[];
  altura?: number;
  interativo?: boolean;
  rotuloGrafico: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const [ativo, setAtivo] = useState<number | null>(null);
  const W = 600;
  const maximo = Math.max(...dados.map((d) => d.valor), 1) * 1.2;
  const n = dados.length;
  const pts: [number, number][] = dados.map((d, i) => [
    n === 1 ? W / 2 : (i / (n - 1)) * W,
    altura - (d.valor / maximo) * (altura - 6) - 3,
  ]);
  const linha = curva(pts, 0, altura - 3);
  const area = `${linha} L${W},${altura} L0,${altura} Z`;

  function mover(e: PointerEvent<HTMLDivElement>) {
    if (!interativo || n < 2) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setAtivo(Math.round(x * (n - 1)));
  }

  const foco = ativo ?? n - 1;
  const fx = (pts[foco]?.[0] ?? 0) / W;
  const fy = (pts[foco]?.[1] ?? 0) / altura;

  return (
    <div
      className={cn("relative select-none", className)}
      style={{ height: altura }}
      onPointerMove={mover}
      onPointerLeave={() => setAtivo(null)}
      role="img"
      aria-label={`${rotuloGrafico}: ${dados.map((d) => `${d.rotulo} ${d.valor}`).join("; ")}`}
    >
      <svg
        viewBox={`0 0 ${W} ${altura}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
          </linearGradient>
        </defs>
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
        <path d={area} fill={`url(#g${id})`} />
        <path
          d={linha}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {ativo !== null ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-px bg-foreground/15"
          style={{ left: `${fx * 100}%` }}
        />
      ) : null}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card shadow transition-[left,top] duration-150 ease-out",
          foco === n - 1 ? "bg-accent" : "bg-chart-1",
        )}
        style={{ left: `${fx * 100}%`, top: `${fy * 100}%` }}
      />
      {ativo !== null ? (
        <span
          aria-hidden
          className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-[0.72rem] font-medium text-background shadow-lg"
          style={{
            left: `${Math.min(88, Math.max(12, fx * 100))}%`,
            top: Math.max(0, fy * altura - 44),
          }}
        >
          {dados[ativo].rotulo} · <b className="tabular-nums">{dados[ativo].valor}</b>
        </span>
      ) : null}
    </div>
  );
}
