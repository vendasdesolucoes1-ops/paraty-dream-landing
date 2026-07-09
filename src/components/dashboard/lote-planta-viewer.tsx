import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import plantaSvg from "@/assets/loteamento-planta.svg?raw";
import { Button } from "@/components/ui/button";
import type { Lote, LoteStatus } from "@/lib/types";

const STATUS_COLORS: Record<LoteStatus, string> = {
  disponivel: "var(--lote-disponivel)",
  reservado: "var(--lote-reservado)",
  vendido: "var(--lote-vendido)",
};

const STATUS_LABELS: Record<LoteStatus, string> = {
  disponivel: "Disponível",
  reservado: "Reservado",
  vendido: "Vendido",
};

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;

function formatCurrency(value: number | null) {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatMetragem(value: number | null) {
  if (value == null) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;
}

const TIPO_LABELS: Record<string, string> = {
  residencial: "Residencial",
  comercial: "Comercial",
};

interface TooltipState {
  lote: Lote;
  x: number;
  y: number;
}

export function LotePlantaViewer({
  lotes,
  onSelectLote,
}: {
  lotes: Lote[];
  onSelectLote: (lote: Lote) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const panState = useRef<{ dragging: boolean; startX: number; startY: number } | null>(null);

  const positionedLotes = useMemo(
    () => lotes.filter((l) => l.posicao_x != null && l.posicao_y != null),
    [lotes],
  );
  const unpositionedLotes = useMemo(
    () => lotes.filter((l) => l.posicao_x == null || l.posicao_y == null),
    [lotes],
  );

  const loteByKey = useMemo(() => {
    const map = new Map<string, Lote>();
    for (const lote of positionedLotes) {
      map.set(`${lote.quadra ?? ""}::${lote.numero_lote}`, lote);
    }
    return map;
  }, [positionedLotes]);

  // Colors, hover tooltip and click handlers are applied directly to the raw
  // SVG DOM after injection, since the polygons come from an external file
  // rather than being React elements.
  useEffect(() => {
    const wrapper = svgWrapperRef.current;
    if (!wrapper) return;

    const elements = Array.from(
      wrapper.querySelectorAll<SVGElement>("[data-quadra][data-numero-lote]"),
    );

    const cleanups: (() => void)[] = [];

    for (const el of elements) {
      const quadra = el.getAttribute("data-quadra") ?? "";
      const numeroLote = el.getAttribute("data-numero-lote") ?? "";
      const lote = loteByKey.get(`${quadra}::${numeroLote}`);

      el.style.cursor = lote ? "pointer" : "default";
      if (lote) el.style.fill = STATUS_COLORS[lote.status];
      el.style.transition = "opacity 0.15s ease";

      if (!lote) continue;

      const handleEnter = (event: MouseEvent) => {
        el.style.opacity = "0.75";
        const rect = containerRef.current?.getBoundingClientRect();
        setTooltip({
          lote,
          x: rect ? event.clientX - rect.left : event.clientX,
          y: rect ? event.clientY - rect.top : event.clientY,
        });
      };
      const handleMove = (event: MouseEvent) => {
        const rect = containerRef.current?.getBoundingClientRect();
        setTooltip((prev) =>
          prev
            ? {
                ...prev,
                x: rect ? event.clientX - rect.left : event.clientX,
                y: rect ? event.clientY - rect.top : event.clientY,
              }
            : prev,
        );
      };
      const handleLeave = () => {
        el.style.opacity = "1";
        setTooltip(null);
      };
      const handleClick = () => onSelectLote(lote);

      el.addEventListener("mouseenter", handleEnter);
      el.addEventListener("mousemove", handleMove);
      el.addEventListener("mouseleave", handleLeave);
      el.addEventListener("click", handleClick);

      cleanups.push(() => {
        el.removeEventListener("mouseenter", handleEnter);
        el.removeEventListener("mousemove", handleMove);
        el.removeEventListener("mouseleave", handleLeave);
        el.removeEventListener("click", handleClick);
      });
    }

    return () => cleanups.forEach((fn) => fn());
  }, [loteByKey, onSelectLote]);

  function clampScale(scale: number) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    setTransform((prev) => ({ ...prev, scale: clampScale(prev.scale + delta) }));
  }

  function handleMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    panState.current = {
      dragging: true,
      startX: event.clientX - transform.x,
      startY: event.clientY - transform.y,
    };
  }

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!panState.current?.dragging) return;
    setTransform((prev) => ({
      ...prev,
      x: event.clientX - panState.current!.startX,
      y: event.clientY - panState.current!.startY,
    }));
  }

  function stopPan() {
    if (panState.current) panState.current.dragging = false;
  }

  function zoomBy(delta: number) {
    setTransform((prev) => ({ ...prev, scale: clampScale(prev.scale + delta) }));
  }

  function resetView() {
    setTransform({ scale: 1, x: 0, y: 0 });
  }

  return (
    <div className="space-y-4">
      <div
        ref={containerRef}
        className="relative border rounded-lg overflow-hidden bg-card h-[32rem] cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopPan}
        onMouseLeave={stopPan}
      >
        <div
          ref={svgWrapperRef}
          className="w-full h-full [&_svg]:w-full [&_svg]:h-full"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: "center center",
          }}
          dangerouslySetInnerHTML={{ __html: plantaSvg }}
        />

        <div className="absolute bottom-3 right-3 flex flex-col gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 bg-card"
            onClick={() => zoomBy(0.2)}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 bg-card"
            onClick={() => zoomBy(-0.2)}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 bg-card" onClick={resetView}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        <div className="absolute top-3 left-3 rounded-lg border bg-card/95 p-3 text-xs space-y-1.5 shadow-sm">
          <p className="font-display text-sm text-primary mb-1">Legenda</p>
          {(Object.keys(STATUS_LABELS) as LoteStatus[]).map((status) => (
            <div key={status} className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-sm border"
                style={{
                  backgroundColor: STATUS_COLORS[status],
                  borderColor: "var(--planta-lote-border)",
                }}
              />
              <span className="text-muted-foreground">{STATUS_LABELS[status]}</span>
            </div>
          ))}
        </div>

        {tooltip ? (
          <div
            className="absolute z-10 pointer-events-none rounded-lg border bg-card shadow-lg p-3 text-xs space-y-1 min-w-48"
            style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
          >
            <p className="font-display text-sm text-primary">
              Quadra {tooltip.lote.quadra ?? "—"} · Lote {tooltip.lote.numero_lote}
            </p>
            <p>Metragem: {formatMetragem(tooltip.lote.metragem)}</p>
            <p>
              Tipo:{" "}
              {tooltip.lote.tipo ? (TIPO_LABELS[tooltip.lote.tipo] ?? tooltip.lote.tipo) : "—"}
            </p>
            <p>Valor: {formatCurrency(tooltip.lote.valor)}</p>
            <p>Status: {STATUS_LABELS[tooltip.lote.status]}</p>
          </div>
        ) : null}
      </div>

      {unpositionedLotes.length > 0 ? (
        <div className="space-y-2">
          <h3 className="font-display text-lg text-primary">
            Lotes ainda não posicionados na planta
          </h3>
          <p className="text-sm text-muted-foreground">
            Estes lotes não têm posição definida (posicao_x/posicao_y) e por isso não aparecem no
            mapa acima.
          </p>
          <div className="flex flex-wrap gap-2">
            {unpositionedLotes.map((lote) => (
              <button
                key={lote.id}
                type="button"
                onClick={() => onSelectLote(lote)}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                Quadra {lote.quadra ?? "—"} · Lote {lote.numero_lote}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
