import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, MousePointerClick, Plus, RotateCcw } from "lucide-react";
import plantaSvg from "@/assets/loteamento-planta.svg?raw";
import { Pill } from "@/components/ds/pill";
import { LOTE_STATUS_DOT, LOTE_STATUS_LABELS, LOTE_STATUS_TONE } from "@/components/dashboard/status-badge";
import { cn } from "@/lib/utils";
import type { Lote, LoteStatus } from "@/lib/types";

// Preenchimento de cada estado: o token do estado diluído no card, para o par
// claro/escuro vir de graça e os números continuarem legíveis em cima.
const STATUS_FILL: Record<LoteStatus, string> = {
  disponivel: "color-mix(in oklab, var(--success) 26%, var(--card))",
  reservado: "color-mix(in oklab, var(--warning) 44%, var(--card))",
  vendido: "color-mix(in oklab, var(--danger) 30%, var(--card))",
};

const STATUS_STROKE: Record<LoteStatus, string> = {
  disponivel: "color-mix(in oklab, var(--success) 70%, transparent)",
  reservado: "color-mix(in oklab, var(--warning) 80%, transparent)",
  vendido: "color-mix(in oklab, var(--danger) 70%, transparent)",
};

const STATUS_ORDEM: LoteStatus[] = ["disponivel", "reservado", "vendido"];

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const LIMITE_ARRASTO_PX = 4;

// Identidade estável de propósito. Um objeto novo a cada render faz o React 19
// re-setar innerHTML quando qualquer outra prop do elemento muda, recriando o
// DOM do SVG — foi o que apagava as cores ao aplicar zoom.
const PLANTA_HTML = { __html: plantaSvg };

// Escopo das regras de cor, para não vazarem para fora da planta.
const PLANTA_SCOPE = "planta-status-scope";
const POLIGONO = `.${PLANTA_SCOPE} [data-quadra][data-numero-lote]`;

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

const TOOLTIP_LARGURA = 232;
const TOOLTIP_ALTURA = 156;

// Finds the closest ancestor-or-self lot polygon for a delegated event target,
// since the raw SVG is injected via dangerouslySetInnerHTML rather than JSX.
function findLotePoligono(target: EventTarget | null): SVGElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<SVGElement>("[data-quadra][data-numero-lote]");
}

function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

const BOTAO_CONTROLE =
  "inline-flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";

export function LotePlantaViewer({
  lotes,
  onSelectLote,
  selecionadoId = null,
  carregando = false,
}: {
  lotes: Lote[];
  onSelectLote: (lote: Lote) => void;
  /** Lote aberto no formulário: ganha contorno de destaque na planta. */
  selecionadoId?: string | null;
  /** Enquanto os lotes chegam, a própria planta vira o esqueleto (lotes pulsando). */
  carregando?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [interagiu, setInteragiu] = useState(false);
  const panState = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

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

  const contagem = useMemo(() => {
    const c: Record<LoteStatus, number> = { disponivel: 0, reservado: 0, vendido: 0 };
    for (const l of positionedLotes) c[l.status] += 1;
    return c;
  }, [positionedLotes]);

  function loteFromElement(el: SVGElement): Lote | undefined {
    const quadra = el.getAttribute("data-quadra") ?? "";
    const numeroLote = el.getAttribute("data-numero-lote") ?? "";
    return loteByKey.get(`${quadra}::${numeroLote}`);
  }

  // O status vira uma folha de estilo renderizada pelo React a partir dos dados,
  // em vez de fills escritos no DOM. Assim a cor não depende do nó do SVG
  // sobreviver: se o conteúdo for reinjetado por qualquer motivo, as regras
  // continuam valendo e a pintura se refaz sozinha.
  const statusCss = useMemo(() => {
    const rules = [
      `@keyframes planta-lote-in{from{opacity:0;transform:scale(.55)}to{opacity:1;transform:none}}`,
      `@keyframes planta-lote-pulso{0%,100%{opacity:.5}50%{opacity:1}}`,
      `@keyframes planta-lote-sel{0%,100%{stroke-opacity:1}50%{stroke-opacity:.45}}`,
      `${POLIGONO}{transform-box:fill-box;transform-origin:center;transition:stroke-width .15s,stroke .15s}`,
    ];

    if (carregando) {
      // Planta-esqueleto: todos os lotes em cinza pulsando até os dados chegarem.
      rules.push(
        `${POLIGONO}{fill:var(--chart-track);stroke:var(--border);cursor:default!important;animation:planta-lote-pulso 1.4s ease-in-out infinite}`,
        `${POLIGONO}+text{opacity:.35}`,
      );
    } else {
      // Polígonos sem lote correspondente (ou fora do filtro) ficam esmaecidos
      // e não são clicáveis. O cursor precisa de !important: o SVG traz
      // cursor:pointer inline em cada polígono.
      rules.push(
        `${POLIGONO}{opacity:.3;cursor:default!important}`,
        `${POLIGONO}+text{opacity:.4}`,
      );

      positionedLotes.forEach((lote, i) => {
        // JSON.stringify entrega o valor já com aspas e escape corretos para o
        // seletor de atributo, mesmo que quadra/número tenham caracteres chatos.
        const quadra = JSON.stringify(String(lote.quadra ?? ""));
        const numero = JSON.stringify(String(lote.numero_lote));
        const sel = `.${PLANTA_SCOPE} [data-quadra=${quadra}][data-numero-lote=${numero}]`;
        const delay = 120 + Math.min(i * 5, 900);

        rules.push(
          `${sel}{fill:${STATUS_FILL[lote.status]};stroke:${STATUS_STROKE[lote.status]};opacity:1;cursor:pointer!important;animation:planta-lote-in 480ms var(--ease-out) ${delay}ms both}`,
          `${sel}+text{opacity:1}`,
          `${sel}:hover{stroke:var(--foreground);stroke-width:2.25}`,
        );
      });

      const selecionado = selecionadoId
        ? positionedLotes.find((l) => l.id === selecionadoId)
        : undefined;
      if (selecionado) {
        const quadra = JSON.stringify(String(selecionado.quadra ?? ""));
        const numero = JSON.stringify(String(selecionado.numero_lote));
        const sel = `.${PLANTA_SCOPE} [data-quadra=${quadra}][data-numero-lote=${numero}]`;
        rules.push(
          `${sel},${sel}:hover{stroke:var(--accent);stroke-width:3;animation:planta-lote-sel 1.2s ease-in-out infinite}`,
        );
      }
    }

    rules.push(
      `@media (prefers-reduced-motion: reduce){${POLIGONO}{animation:none!important;transition:none}}`,
    );
    return rules.join("\n");
  }, [positionedLotes, carregando, selecionadoId]);

  // Roda de rolagem com preventDefault precisa de listener não passivo; o
  // onWheel do React é passivo e o navegador ignorava o preventDefault.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function aoRolar(event: WheelEvent) {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.1 : 0.1;
      setTransform((prev) => ({ ...prev, scale: clampScale(prev.scale + delta) }));
      setInteragiu(true);
    }
    el.addEventListener("wheel", aoRolar, { passive: false });
    return () => el.removeEventListener("wheel", aoRolar);
  }, []);

  function updateTooltipPosition(event: React.MouseEvent, lote: Lote) {
    const rect = containerRef.current?.getBoundingClientRect();
    const x = rect ? event.clientX - rect.left : event.clientX;
    const y = rect ? event.clientY - rect.top : event.clientY;
    const largura = rect?.width ?? Infinity;
    const altura = rect?.height ?? Infinity;
    // Vira para o outro lado do cursor quando não cabe, em vez de ser cortado.
    const left = x + 16 + TOOLTIP_LARGURA > largura ? x - 16 - TOOLTIP_LARGURA : x + 16;
    const top = y + 16 + TOOLTIP_ALTURA > altura ? y - 16 - TOOLTIP_ALTURA : y + 16;
    setTooltip({ lote, x: Math.max(8, left), y: Math.max(8, top) });
  }

  function handleSvgAreaClick(event: React.MouseEvent<HTMLDivElement>) {
    // Soltar o botão depois de arrastar a planta não é um clique no lote.
    if (panState.current?.moved) return;
    const el = findLotePoligono(event.target);
    if (!el) return;
    const lote = loteFromElement(el);
    if (lote) onSelectLote(lote);
  }

  function handleSvgAreaMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    const el = findLotePoligono(event.target);
    if (!el || panState.current?.dragging) {
      if (tooltip) setTooltip(null);
      return;
    }
    const lote = loteFromElement(el);
    if (lote) updateTooltipPosition(event, lote);
    else if (tooltip) setTooltip(null);
  }

  function handleMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    panState.current = {
      dragging: true,
      startX: event.clientX - transform.x,
      startY: event.clientY - transform.y,
      originX: event.clientX,
      originY: event.clientY,
      moved: false,
    };
  }

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    handleSvgAreaMouseMove(event);
    const pan = panState.current;
    if (!pan?.dragging) return;
    if (
      !pan.moved &&
      Math.hypot(event.clientX - pan.originX, event.clientY - pan.originY) < LIMITE_ARRASTO_PX
    ) {
      return;
    }
    if (!pan.moved) {
      pan.moved = true;
      setArrastando(true);
      setInteragiu(true);
    }
    setTransform((prev) => ({
      ...prev,
      x: event.clientX - pan.startX,
      y: event.clientY - pan.startY,
    }));
  }

  function stopPan() {
    if (panState.current) panState.current.dragging = false;
    setArrastando(false);
    // `moved` fica até o clique que vem logo depois do mouseup ser descartado.
    if (panState.current?.moved) {
      const pan = panState.current;
      setTimeout(() => {
        if (panState.current === pan) pan.moved = false;
      }, 0);
    }
  }

  function zoomBy(delta: number) {
    setTransform((prev) => ({ ...prev, scale: clampScale(prev.scale + delta) }));
    setInteragiu(true);
  }

  function resetView() {
    setTransform({ scale: 1, x: 0, y: 0 });
  }

  return (
    <div className="space-y-8">
      <div className="animate-swap overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        {/* A altura acompanha a proporção da planta (~19:9) em vez de ser fixa:
            com altura travada, um desenho landscape sobra em cima e embaixo e
            desperdiça justamente a largura que o formato veio buscar. O teto
            evita que em telas muito largas o mapa empurre o resto da página para
            fora da dobra, e o piso mantém a área utilizável no celular. */}
        <div
          ref={containerRef}
          role="group"
          aria-label="Planta do loteamento. Clique em um lote para editá-lo."
          aria-busy={carregando}
          className={cn(
            "relative aspect-[19/9] max-h-[38rem] min-h-[20rem] select-none overflow-hidden bg-[var(--planta-bg)]",
            arrastando ? "cursor-grabbing" : "cursor-grab",
            PLANTA_SCOPE,
          )}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopPan}
          onMouseLeave={() => {
            stopPan();
            setTooltip(null);
          }}
          onClick={handleSvgAreaClick}
        >
          <style>{statusCss}</style>

          {/* O transform vive num wrapper próprio. Se ficasse no mesmo elemento
              do dangerouslySetInnerHTML, cada mudança de escala reinjetaria o
              SVG inteiro. O nó de baixo nunca muda de props. */}
          <div
            className={cn(
              "h-full w-full motion-reduce:transition-none",
              !arrastando && "transition-transform duration-200 ease-[var(--ease-out)]",
            )}
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transformOrigin: "center center",
            }}
          >
            <div
              ref={svgWrapperRef}
              className="h-full w-full [&_svg]:h-full [&_svg]:w-full"
              dangerouslySetInnerHTML={PLANTA_HTML}
            />
          </div>

          <p
            className={cn(
              "pointer-events-none absolute left-3 top-3 hidden items-center gap-1.5 rounded-full border border-border bg-card/90 px-2.5 py-1 text-[0.7rem] text-muted-foreground shadow-sm backdrop-blur transition-opacity duration-500 sm:flex",
              interagiu && "opacity-0",
            )}
          >
            <MousePointerClick className="h-3 w-3" aria-hidden />
            Arraste para mover · role para ampliar
          </p>

          <div
            className="absolute bottom-3 right-3 flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/95 shadow-[var(--shadow-card)] backdrop-blur"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={BOTAO_CONTROLE}
              onClick={() => zoomBy(0.2)}
              disabled={transform.scale >= MAX_SCALE}
              aria-label="Aumentar zoom"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
            <span
              aria-hidden
              className="num py-1 text-center text-[0.65rem] leading-4 text-muted-foreground"
            >
              {Math.round(transform.scale * 100)}%
            </span>
            <button
              type="button"
              className={BOTAO_CONTROLE}
              onClick={() => zoomBy(-0.2)}
              disabled={transform.scale <= MIN_SCALE}
              aria-label="Diminuir zoom"
            >
              <Minus className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              className={BOTAO_CONTROLE}
              onClick={resetView}
              aria-label="Restaurar visualização"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {tooltip ? (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-10 animate-pop rounded-xl border border-border bg-popover p-3.5 text-[0.8125rem] shadow-[var(--shadow-pop)] data-[state=open]:animate-pop"
              data-state="open"
              style={{ left: tooltip.x, top: tooltip.y, width: TOOLTIP_LARGURA }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-sans text-[0.9375rem] font-semibold leading-tight text-foreground">
                  Quadra {tooltip.lote.quadra ?? "—"} · Lote {tooltip.lote.numero_lote}
                </p>
              </div>
              <div className="mt-1.5">
                <Pill tone={LOTE_STATUS_TONE[tooltip.lote.status]} dot>
                  {LOTE_STATUS_LABELS[tooltip.lote.status]}
                </Pill>
              </div>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                <dt className="text-muted-foreground">Metragem</dt>
                <dd className="text-right tabular-nums text-foreground">
                  {formatMetragem(tooltip.lote.metragem)}
                </dd>
                <dt className="text-muted-foreground">Tipo</dt>
                <dd className="text-right text-foreground">
                  {tooltip.lote.tipo ? (TIPO_LABELS[tooltip.lote.tipo] ?? tooltip.lote.tipo) : "—"}
                </dd>
                <dt className="text-muted-foreground">Valor</dt>
                <dd className="text-right font-medium tabular-nums text-foreground">
                  {formatCurrency(tooltip.lote.valor)}
                </dd>
              </dl>
            </div>
          ) : null}
        </div>

        {/* Legenda fora do mapa: antes ficava por cima do desenho e escondia lotes. */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border bg-card px-5 py-3">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5" aria-label="Legenda">
            {STATUS_ORDEM.map((status) => (
              <li
                key={status}
                className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground"
              >
                <span
                  aria-hidden
                  className="h-3.5 w-3.5 rounded-[0.3125rem] border"
                  style={{ backgroundColor: STATUS_FILL[status], borderColor: STATUS_STROKE[status] }}
                />
                {LOTE_STATUS_LABELS[status]}
                <span className="tabular-nums font-semibold text-foreground">
                  {contagem[status]}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[0.75rem] text-muted-foreground">Clique em um lote para editar</p>
        </div>
      </div>

      {unpositionedLotes.length > 0 ? (
        <section className="animate-swap space-y-3" aria-labelledby="lotes-sem-posicao">
          <div>
            <h3
              id="lotes-sem-posicao"
              className="font-sans text-[1.0625rem] font-semibold tracking-[-0.014em] text-foreground"
            >
              Lotes ainda não posicionados na planta
            </h3>
            <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
              Estes lotes não têm posição definida (posicao_x/posicao_y) e por isso não aparecem no
              mapa acima.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {unpositionedLotes.map((lote) => (
              <button
                key={lote.id}
                type="button"
                onClick={() => onSelectLote(lote)}
                className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-card px-3 text-[0.8125rem] font-medium text-muted-foreground transition-[border-color,color,transform] duration-150 hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15 active:scale-[0.97]"
              >
                <span
                  aria-hidden
                  className={cn("h-2 w-2 rounded-full", LOTE_STATUS_DOT[lote.status])}
                />
                Quadra {lote.quadra ?? "—"} · Lote {lote.numero_lote}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
