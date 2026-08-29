import { useEffect, useRef, useState } from "react";

export interface CarouselSlide {
  src: string;
  alt: string;
  titulo: string;
  descricao: string;
}

interface Props {
  slides: CarouselSlide[];
  aspect?: string;
  intervalMs?: number;
  maxCaptionWidth?: string;
}

export function Carousel({
  slides,
  aspect = "aspect-[16/11]",
  intervalMs = 5000,
  maxCaptionWidth = "34rem",
}: Props) {
  const [index, setIndex] = useState(0);
  // Quem pede menos movimento não recebe avanço automático — só troca de
  // foto por gesto explícito (setas ou bolinhas).
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };
  const start = () => {
    stop();
    if (reducedMotion || paused) return;
    timer.current = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, intervalMs);
  };

  useEffect(() => {
    start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length, intervalMs, paused]);

  const go = (i: number) => {
    setIndex(i);
    start();
  };
  const prev = () => go((index - 1 + slides.length) % slides.length);
  const next = () => go((index + 1) % slides.length);

  return (
    <div
      className={`relative ${aspect} overflow-hidden rounded-[4px] bg-primary shadow-[0_30px_70px_-40px_rgba(20,40,30,0.55)]`}
      onMouseEnter={stop}
      onMouseLeave={start}
    >
      {slides.map((s, i) => (
        <div
          // Índice, não src: duas imagens iguais em bytes viram o MESMO arquivo
          // no build (o Vite deduplica por conteúdo), e aí dois slides passam a
          // ter src idêntico. Com key={s.src} isso vira key duplicada, o React
          // reconcilia errado a cada troca do carrossel e um dos slides aparece
          // quebrado — só em produção, porque o dev server não deduplica.
          // A lista é fixa e nunca reordena, então o índice é key estável.
          key={i}
          className="absolute inset-0 transition-opacity duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] pointer-events-none"
          style={{ opacity: i === index ? 1 : 0 }}
        >
          <img src={s.src} alt={s.alt} loading="lazy" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
          <div className="absolute left-0 right-0 bottom-0 px-8 py-7">
            <div className="font-display text-ivory text-2xl sm:text-[1.75rem] leading-tight">
              {s.titulo}
            </div>
            <div
              className="font-light text-ivory/85 text-sm mt-1.5"
              style={{ maxWidth: maxCaptionWidth }}
            >
              {s.descricao}
            </div>
          </div>
        </div>
      ))}

      <button
        aria-label="Foto anterior"
        onClick={prev}
        className="absolute top-1/2 left-4 -translate-y-1/2 w-11 h-11 flex items-center justify-center bg-[oklch(0.18_0.02_150/0.4)] hover:bg-[oklch(0.18_0.02_150/0.7)] text-ivory border border-ivory/45 hover:border-ivory/85 rounded-full backdrop-blur cursor-pointer text-lg transition-all hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sand focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      >
        ‹
      </button>
      <button
        aria-label="Próxima foto"
        onClick={next}
        className="absolute top-1/2 right-4 -translate-y-1/2 w-11 h-11 flex items-center justify-center bg-[oklch(0.18_0.02_150/0.4)] hover:bg-[oklch(0.18_0.02_150/0.7)] text-ivory border border-ivory/45 hover:border-ivory/85 rounded-full backdrop-blur cursor-pointer text-lg transition-all hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sand focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      >
        ›
      </button>

      {!reducedMotion && (
        <button
          aria-label={paused ? "Retomar apresentação automática" : "Pausar apresentação automática"}
          onClick={() => setPaused((p) => !p)}
          className="absolute top-3 right-3 z-[2] w-8 h-8 flex items-center justify-center bg-[oklch(0.18_0.02_150/0.4)] hover:bg-[oklch(0.18_0.02_150/0.7)] text-ivory border border-ivory/45 hover:border-ivory/85 rounded-full backdrop-blur cursor-pointer text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sand focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          {paused ? "▶" : "❚❚"}
        </button>
      )}

      <div className="absolute left-0 right-0 bottom-4 flex gap-2 justify-center z-[2]">
        {slides.map((_, i) => (
          <button
            key={i}
            aria-label={`Ir para foto ${i + 1}`}
            onClick={() => go(i)}
            className="h-2 rounded-full border-0 p-0 cursor-pointer transition-[width,background] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sand focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            style={{
              width: i === index ? "24px" : "8px",
              background: i === index ? "var(--sand)" : "oklch(0.975 0.008 85 / 0.5)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
