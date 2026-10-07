import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Comparador "antes e depois" com linha divisória vertical que acompanha o
 * mouse (ou o dedo, em telas de toque). A imagem "depois" fica por cima e é
 * revelada à esquerda do cursor via clip-path; a "antes" permanece visível à
 * direita.
 *
 * Por teclado, um <input type="range"> visualmente oculto recebe o foco: Tab
 * chega nele e as setas movem a linha (fora da área de toque, para não
 * disputar a rolagem da página no celular). Na primeira vez que o comparador entra
 * na tela, a linha faz um vai-e-vem curto para mostrar que dá para arrastar.
 */
export function BeforeAfterSlider({
  beforeSrc,
  beforeSrcSet,
  afterSrc,
  afterSrcSet,
  sizes = "100vw",
  beforeLabel = "ANTES",
  afterLabel = "DEPOIS",
  alt = "Comparação antes e depois",
  className,
}: {
  beforeSrc: string;
  beforeSrcSet?: string;
  afterSrc: string;
  afterSrcSet?: string;
  sizes?: string;
  beforeLabel?: string;
  afterLabel?: string;
  alt?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Posição da linha divisória em % da largura (50 = metade revelada).
  const [position, setPosition] = useState(50);
  const touched = useRef(false);

  const updateFromClientX = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    touched.current = true;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, pct)));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const inicio = performance.now();
        const duracao = 1600;
        const passo = (agora: number) => {
          if (touched.current) return;
          const t = Math.min(1, (agora - inicio) / duracao);
          // Uma oscilação amortecida em volta do meio: 50 → 32 → 64 → 50.
          setPosition(50 - 18 * Math.sin(t * Math.PI * 2) * (1 - t * 0.5));
          if (t < 1) frame = requestAnimationFrame(passo);
          else setPosition(50);
        };
        frame = requestAnimationFrame(passo);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden select-none touch-pan-y", className)}
      onPointerMove={(e) => {
        if (e.pointerType === "mouse" || e.buttons > 0) updateFromClientX(e.clientX);
      }}
      onPointerDown={(e) => updateFromClientX(e.clientX)}
    >
      {/* Camada de baixo: ANTES (sempre visível por inteiro) */}
      <img
        src={beforeSrc}
        srcSet={beforeSrcSet}
        sizes={sizes}
        alt={`${alt} — ${beforeLabel.toLowerCase()}`}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover"
        draggable={false}
      />

      {/* Camada de cima: DEPOIS, recortada até a posição do cursor */}
      <img
        src={afterSrc}
        srcSet={afterSrcSet}
        sizes={sizes}
        alt={`${alt} — ${afterLabel.toLowerCase()}`}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      />

      {/* Linha divisória */}
      <div
        className="absolute inset-y-0 w-0.5 bg-ivory shadow-[0_0_12px_rgba(0,0,0,0.45)] pointer-events-none"
        style={{ left: `${position}%` }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-ivory/95 shadow-md flex items-center justify-center">
          <span className="text-forest-deep text-sm font-medium tracking-tight">⇔</span>
        </div>
      </div>

      {/* Labels fixos */}
      <span className="absolute bottom-3 right-3 rounded-[3px] bg-forest-deep/70 text-ivory text-xs tracking-[0.18em] px-2.5 py-1 pointer-events-none">
        {beforeLabel}
      </span>
      <span className="absolute bottom-3 left-3 rounded-[3px] bg-forest-deep/70 text-ivory text-xs tracking-[0.18em] px-2.5 py-1 pointer-events-none">
        {afterLabel}
      </span>

      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(position)}
        onChange={(e) => {
          touched.current = true;
          setPosition(Number(e.target.value));
        }}
        aria-label={`${alt}: arraste para comparar ${afterLabel.toLowerCase()} e ${beforeLabel.toLowerCase()}`}
        className="peer sr-only"
      />
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-inset ring-sand opacity-0 peer-focus-visible:opacity-100" />
    </div>
  );
}
