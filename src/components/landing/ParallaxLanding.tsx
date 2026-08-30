import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LeadForm } from "@/components/landing/LeadForm";

type Scene = {
  src: string;
  start: number;
  end: number;
  ratio: number;
};

const scenes: Scene[] = [
  {
    src: "/moradas/scroll-01-natureza-loteamento.webp",
    start: 0,
    end: 0.3,
    ratio: 1983 / 793,
  },
  {
    src: "/moradas/scroll-02-loteamento-casa.webp",
    start: 0.24,
    end: 0.55,
    ratio: 1947 / 808,
  },
  {
    src: "/moradas/scroll-03-caminho-porta.webp",
    start: 0.49,
    end: 0.79,
    ratio: 1942 / 809,
  },
  {
    src: "/moradas/scroll-04-casa-interior.webp",
    start: 0.73,
    end: 1,
    ratio: 1940 / 811,
  },
];

const chapters = [
  {
    start: -0.018,
    end: 0.095,
    label: "LOTEAMENTO RESIDENCIAL · PARATY / RJ",
    title: "Invista em Paraty\ncom tranquilidade.",
    text: "Lotes de alto padrão entre a Mata Atlântica e o Centro Histórico. Um lugar para viver, construir e valorizar.",
    align: "left",
  },
  {
    start: 0.1,
    end: 0.19,
    label: "ENTRE A SERRA E O CENTRO",
    title: "A natureza\ncomo endereço.",
    text: "Cercado de mata, cachoeiras e trilhas — a apenas nove minutos do coração colonial de Paraty.",
    align: "right",
  },
  {
    start: 0.205,
    end: 0.295,
    label: "O EMPREENDIMENTO",
    title: "250 a 450 m²\nprontos para construir.",
    text: "Lotes residenciais e comerciais, regulares e planos, em um bairro planejado e integrado ao relevo natural.",
    align: "left",
  },
  {
    start: 0.315,
    end: 0.405,
    label: "INFRAESTRUTURA ENTREGUE",
    title: "Nada ficou\nno papel.",
    text: "Água, luz, vias pavimentadas, sinalização e iluminação já fazem parte do Moradas de Paraty.",
    align: "right",
  },
  {
    start: 0.425,
    end: 0.515,
    label: "FACILIDADE",
    title: "Sua casa,\nsem complicação.",
    text: "Financiamento direto com o loteador, sem banco e sem burocracia, em até 240 vezes.",
    align: "left",
  },
  {
    start: 0.54,
    end: 0.635,
    label: "ESTILO DE VIDA",
    title: "Caminhos que\nlevam para casa.",
    text: "Playground, espaço pet, academia ao ar livre e áreas verdes preservadas para viver com mais tempo e presença.",
    align: "right",
  },
  {
    start: 0.66,
    end: 0.755,
    label: "CURADORIA ARQUITETÔNICA",
    title: "Uma paisagem\nfeita para durar.",
    text: "Diretrizes arquitetônicas preservam a harmonia entre as casas, a vegetação e a identidade de Paraty.",
    align: "left",
  },
  {
    start: 0.785,
    end: 0.89,
    label: "O SEU LUGAR",
    title: "Entre.\nA casa é sua.",
    text: "Construa quando quiser e transforme um investimento sólido em uma nova forma de viver.",
    align: "right",
  },
] as const;

const benefits = [
  ["9 min", "do Centro Histórico"],
  ["250–450 m²", "lotes residenciais e comerciais"],
  ["Até 240x", "direto com o loteador"],
] as const;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function range(value: number, start: number, end: number) {
  return clamp((value - start) / (end - start));
}

function easeInOutCubic(value: number) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

export function ParallaxLanding() {
  const storyRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const [viewport, setViewport] = useState({ width: 390, height: 844 });

  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };

    updateViewport();
    window.addEventListener("resize", updateViewport, { passive: true });
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      const story = storyRef.current;
      if (!story) return;

      const rect = story.getBoundingClientRect();
      const distance = story.offsetHeight - window.innerHeight;
      setProgress(clamp(-rect.top / Math.max(distance, 1)));
      frame = 0;
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, []);

  const activeChapter = chapters.reduce(
    (current, chapter, index) =>
      Math.abs(progress - (chapter.start + chapter.end) / 2) <
      Math.abs(progress - (chapters[current].start + chapters[current].end) / 2)
        ? index
        : current,
    0,
  );

  const finalReveal = range(progress, 0.905, 0.98);
  const finalStyle = {
    opacity: finalReveal,
    transform: `translate3d(0, ${(1 - finalReveal) * 46}px, 0)`,
    pointerEvents: finalReveal > 0.9 ? "auto" : "none",
    "--mp-final-reveal": finalReveal,
  } as CSSProperties;

  const isMobile = viewport.width < 761;

  return (
    <main className="parallax-landing">
      <section
        className="mp-scroll-story"
        ref={storyRef}
        aria-label="Descubra o Moradas de Paraty"
      >
        <div className="mp-scroll-stage">
          <div className="mp-scene-stack" aria-hidden="true">
            {scenes.map((scene, index) => {
              const local = range(progress, scene.start, scene.end);
              const easedLocal = easeInOutCubic(local);
              const fadeDuration = 0.06;
              const fadeIn =
                scene.start === 0
                  ? 1
                  : range(progress, scene.start, scene.start + fadeDuration);
              const fadeOut =
                scene.end === 1
                  ? 1
                  : 1 - range(progress, scene.end - fadeDuration, scene.end);
              const opacity = fadeIn * fadeOut;
              const imageHeight = Math.max(
                viewport.width * scene.ratio,
                viewport.height * (isMobile ? 1.75 : 2.12),
              );
              const travel = imageHeight - viewport.height;
              const y = -travel * easedLocal;
              const foregroundY = y - easedLocal * 72;

              return (
                <div className="mp-scroll-scene" key={scene.src} style={{ opacity }}>
                  <img
                    className="mp-scene-image"
                    src={scene.src}
                    alt=""
                    draggable={false}
                    decoding="async"
                    loading={index < 2 ? "eager" : "lazy"}
                    fetchPriority={index === 0 ? "high" : "auto"}
                    style={{
                      height: imageHeight,
                      transform: `translate3d(0, ${y}px, 0)`,
                    }}
                  />
                  {!isMobile && (
                    <img
                      className="mp-scene-image mp-scene-foreground"
                      src={scene.src}
                      alt=""
                      draggable={false}
                      decoding="async"
                      loading="lazy"
                      style={{
                        height: imageHeight,
                        transform: `translate3d(0, ${foregroundY}px, 0) scale(1.025)`,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mp-cinematic-grade" aria-hidden="true" />

          <header className="mp-topbar">
            <img src="/moradas/logo-moradas-de-paraty.svg" alt="Moradas de Paraty" />
            <a href="#formulario">Quero mais informações</a>
          </header>

          <div className="mp-chapter-stack" aria-live="polite">
            {chapters.map((chapter, index) => {
              const edge = 0.018;
              const enter = range(progress, chapter.start, chapter.start + edge);
              const exit = 1 - range(progress, chapter.end - edge, chapter.end);
              const opacity = Math.min(enter, exit);
              const signedMotion = -(1 - enter) + (1 - exit);
              const horizontalDirection = chapter.align === "left" ? 1 : -1;
              const horizontal = signedMotion * (isMobile ? 48 : 110) * horizontalDirection;
              const vertical = -signedMotion * 24;
              const scale = 0.98 + opacity * 0.02;
              const copyStyle = {
                opacity,
                transform: `translate3d(${horizontal}px, ${vertical}px, 0) scale(${scale})`,
                filter: `blur(${Math.abs(signedMotion) * 3.5}px)`,
                "--mp-copy-motion": signedMotion,
                "--mp-copy-visible": opacity,
              } as CSSProperties;
              const Heading = index === 0 ? "h1" : "h2";

              return (
                <article
                  className={`mp-story-copy mp-story-copy--${chapter.align}`}
                  key={chapter.label}
                  aria-hidden={activeChapter !== index}
                  style={copyStyle}
                >
                  <p className="mp-story-label">{chapter.label}</p>
                  <Heading>
                    {chapter.title.split("\n").map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </Heading>
                  <p className="mp-story-text">{chapter.text}</p>
                </article>
              );
            })}
          </div>

          <aside className="mp-chapter-index" aria-hidden="true">
            <span>{String(activeChapter + 1).padStart(2, "0")}</span>
            <i>
              <b style={{ transform: `scaleY(${Math.max(progress, 0.015)})` }} />
            </i>
            <span>{String(chapters.length).padStart(2, "0")}</span>
          </aside>

          <div
            className="mp-scroll-instruction"
            style={{ opacity: 1 - range(progress, 0.012, 0.065) }}
            aria-hidden="true"
          >
            <span>Role para entrar</span>
            <i />
          </div>

          <section className="mp-final-card" style={finalStyle} aria-label="Solicite informações">
            <img
              className="mp-final-logo"
              src="/moradas/logo-moradas-de-paraty.svg"
              alt="Moradas de Paraty"
            />
            <p className="mp-story-label">MORADAS DE PARATY</p>
            <h2>Receba a apresentação completa.</h2>
            <p>
              Conheça os lotes disponíveis, a tabela de valores e as condições especiais
              diretamente com a equipe do empreendimento.
            </p>
            <div className="mp-benefit-row">
              {benefits.map(([value, label]) => (
                <div key={value}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <a className="mp-primary-action" href="#formulario">
              Quero mais informações <span aria-hidden="true">→</span>
            </a>
            <small>Rod. Paraty–Cunha, 489 · Pantanal · Paraty / RJ</small>
          </section>
        </div>
      </section>

      <section className="mp-contact" id="formulario">
        <div className="mp-contact-copy">
          <p className="mp-story-label">FALE COM A NOSSA EQUIPE</p>
          <h2>Seu próximo endereço começa aqui.</h2>
          <p>
            Preencha seus dados para receber disponibilidade, valores e condições de
            pagamento do Moradas de Paraty.
          </p>
        </div>
        <div className="mp-contact-form">
          <LeadForm />
        </div>
      </section>

      <footer className="mp-legal-footer">
        <div>
          <strong>Moradas de Paraty</strong>
          <span>Loteamento Residencial Sophia Saíde</span>
        </div>
        <p>Matrícula nº 3487A · Comarca de Paraty / RJ · © 2026 Moradas de Paraty</p>
      </footer>
    </main>
  );
}
