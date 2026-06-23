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
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };
  const start = () => {
    stop();
    timer.current = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, intervalMs);
  };

  useEffect(() => {
    start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length, intervalMs]);

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
          key={s.src}
          className="absolute inset-0 transition-opacity duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] pointer-events-none"
          style={{ opacity: i === index ? 1 : 0 }}
        >
          <img
            src={s.src}
            alt={s.alt}
            loading="lazy"
            className="w-full h-full object-cover"
          />
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
        className="absolute top-1/2 left-4 -translate-y-1/2 w-11 h-11 flex items-center justify-center bg-[oklch(0.18_0.02_150/0.4)] hover:bg-[oklch(0.18_0.02_150/0.7)] text-ivory border border-ivory/45 hover:border-ivory/85 rounded-full backdrop-blur cursor-pointer text-lg transition-all hover:scale-110"
      >
        ‹
      </button>
      <button
        aria-label="Próxima foto"
        onClick={next}
        className="absolute top-1/2 right-4 -translate-y-1/2 w-11 h-11 flex items-center justify-center bg-[oklch(0.18_0.02_150/0.4)] hover:bg-[oklch(0.18_0.02_150/0.7)] text-ivory border border-ivory/45 hover:border-ivory/85 rounded-full backdrop-blur cursor-pointer text-lg transition-all hover:scale-110"
      >
        ›
      </button>

      <div className="absolute left-0 right-0 bottom-4 flex gap-2 justify-center z-[2]">
        {slides.map((_, i) => (
          <button
            key={i}
            aria-label={`Ir para foto ${i + 1}`}
            onClick={() => go(i)}
            className="h-2 rounded-full border-0 p-0 cursor-pointer transition-[width,background] duration-300"
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
