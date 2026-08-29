import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Comparador "antes e depois" com linha divisória vertical que acompanha o
 * mouse (ou o dedo, em telas de toque). A imagem "depois" fica por cima e é
 * revelada à esquerda do cursor via clip-path; a "antes" permanece visível à
 * direita.
 */
export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "ANTES",
  afterLabel = "DEPOIS",
  alt = "Comparação antes e depois",
  className,
}: {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  alt?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Posição da linha divisória em % da largura (50 = metade revelada).
  const [position, setPosition] = useState(50);

  const updateFromClientX = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, pct)));
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden select-none touch-pan-y", className)}
      onMouseMove={(e) => updateFromClientX(e.clientX)}
      onTouchStart={(e) => updateFromClientX(e.touches[0].clientX)}
      onTouchMove={(e) => updateFromClientX(e.touches[0].clientX)}
    >
      {/* Camada de baixo: ANTES (sempre visível por inteiro) */}
      <img
        src={beforeSrc}
        alt={`${alt} — ${beforeLabel.toLowerCase()}`}
        className="w-full h-full object-cover"
        draggable={false}
      />

      {/* Camada de cima: DEPOIS, recortada até a posição do cursor */}
      <img
        src={afterSrc}
        alt={`${alt} — ${afterLabel.toLowerCase()}`}
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
    </div>
  );
}
