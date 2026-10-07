import { useEffect, useRef, useState, type PointerEvent } from "react";

export interface CarouselSlide {
  src: string;
  /** Variantes por largura (ver lib/landing-images); o navegador escolhe pela tela. */
  srcSet?: string;
  alt: string;
  titulo: string;
  descricao: string;
}

interface Props {
  slides: CarouselSlide[];
  aspect?: string;
  intervalMs?: number;
  maxCaptionWidth?: string;
  /** Largura que o carrossel ocupa na tela, para o navegador escolher a foto. */
  sizes?: string;
}

/** Deslocamento horizontal mínimo, em px, para um arrasto contar como troca. */
const SWIPE_MIN_PX = 40;

export function Carousel({
  slides,
  aspect = "aspect-[16/11]",
  intervalMs = 5000,
  maxCaptionWidth = "34rem",
  sizes = "(min-width: 1024px) 50vw, 100vw",
}: Props) {
  const [index, setIndex] = useState(0);
  // Quem pede menos movimento não recebe avanço automático — só troca de
  // foto por gesto explícito (setas, bolinhas ou arrasto).
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [paused, setPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  // Fotos já pedidas ao servidor. Começa só com a primeira: as outras entram
  // quando viram a atual ou a próxima, em vez de todas de uma vez.
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set([0]));
  const rootRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);

  // Avanço automático só com o carrossel na tela: fora dela, trocar foto é
  // gasto de CPU e de banda que ninguém vê.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), {
      rootMargin: "200px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion || paused || hovering || !onScreen || slides.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), intervalMs);
    return () => clearInterval(timer);
    // `index` reinicia a contagem: depois de uma troca manual a foto fica o
    // intervalo inteiro na tela.
  }, [reducedMotion, paused, hovering, onScreen, slides.length, intervalMs, index]);

  useEffect(() => {
    if (!onScreen) return;
    setLoaded((atual) => {
      const proxima = (index + 1) % slides.length;
      if (atual.has(index) && atual.has(proxima)) return atual;
      return new Set([...atual, index, proxima]);
    });
  }, [index, onScreen, slides.length]);

  const go = (i: number) => setIndex((i + slides.length) % slides.length);
  const prev = () => go(index - 1);
  const next = () => go(index + 1);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    dragStart.current = e.clientX;
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (dragStart.current === null) return;
    const delta = e.clientX - dragStart.current;
    dragStart.current = null;
    if (Math.abs(delta) < SWIPE_MIN_PX) return;
    if (delta < 0) next();
    else prev();
  };

  const botao =
    "absolute top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center bg-[oklch(0.18_0.02_150/0.4)] hover:bg-[oklch(0.18_0.02_150/0.7)] text-ivory border border-ivory/45 hover:border-ivory/85 rounded-full backdrop-blur cursor-pointer text-lg transition-[background-color,border-color,transform] duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sand focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="carrossel"
      aria-label={slides[0]?.titulo ? `Fotos: ${slides[0].titulo} e outras` : "Fotos"}
      className={`relative ${aspect} overflow-hidden rounded-[4px] bg-primary shadow-[0_30px_70px_-40px_rgba(20,40,30,0.55)] touch-pan-y select-none`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (dragStart.current = null)}
    >
      {slides.map((s, i) => {
        const atual = i === index;
        return (
          <div
            // Índice, não src: duas imagens iguais em bytes viram o MESMO arquivo
            // no build (o Vite deduplica por conteúdo), e aí dois slides passam a
            // ter src idêntico. Com key={s.src} isso vira key duplicada, o React
            // reconcilia errado a cada troca do carrossel e um dos slides aparece
            // quebrado — só em produção, porque o dev server não deduplica.
            // A lista é fixa e nunca reordena, então o índice é key estável.
            key={i}
            aria-hidden={!atual}
            className="absolute inset-0 transition-opacity duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] pointer-events-none"
            style={{ opacity: atual ? 1 : 0 }}
          >
            {loaded.has(i) ? (
              <img
                src={s.src}
                srcSet={s.srcSet}
                sizes={sizes}
                alt={s.alt}
                loading="lazy"
                decoding="async"
                draggable={false}
                className={`w-full h-full object-cover transition-transform duration-[6000ms] ease-out ${
                  atual && !reducedMotion ? "scale-[1.04]" : "scale-100"
                }`}
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
            <div className="absolute left-0 right-0 bottom-0 px-6 sm:px-8 pt-7 pb-10 sm:pb-11">
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
        );
      })}

      <button aria-label="Foto anterior" onClick={prev} className={`${botao} left-4`}>
        ‹
      </button>
      <button aria-label="Próxima foto" onClick={next} className={`${botao} right-4`}>
        ›
      </button>

      {!reducedMotion && (
        <button
          aria-label={paused ? "Retomar apresentação automática" : "Pausar apresentação automática"}
          onClick={() => setPaused((p) => !p)}
          className="absolute top-3 right-3 z-[2] w-8 h-8 flex items-center justify-center bg-[oklch(0.18_0.02_150/0.4)] hover:bg-[oklch(0.18_0.02_150/0.7)] text-ivory border border-ivory/45 hover:border-ivory/85 rounded-full backdrop-blur cursor-pointer text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sand focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          {paused ? "▶" : "❚❚"}
        </button>
      )}

      <div className="absolute left-0 right-0 bottom-4 flex gap-2 justify-center z-[2]">
        {slides.map((_, i) => (
          <button
            key={i}
            aria-label={`Ir para foto ${i + 1} de ${slides.length}`}
            aria-current={i === index}
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
