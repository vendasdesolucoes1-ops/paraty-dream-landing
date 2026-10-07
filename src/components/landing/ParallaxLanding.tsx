import { useEffect, useRef, type CSSProperties, type MouseEvent } from "react";
import { LeadForm } from "@/components/landing/LeadForm";

// Landing em uma "câmera" que desce por quatro imagens altas (natureza →
// loteamento → caminho → interior da casa) enquanto a pessoa rola.
//
// Desempenho: a versão anterior guardava o progresso da rolagem em estado do
// React e re-renderizava a página inteira a cada quadro, além de manter uma
// segunda cópia de cada imagem com máscara e animar `filter: blur()` nos
// textos. Aqui o React só monta a marcação; um laço em requestAnimationFrame
// escreve transform/opacity direto no DOM, que o navegador compõe na GPU sem
// recalcular layout. Os textos entram por transições de CSS disparadas por
// classe, então a animação continua suave mesmo quando a rolagem é irregular.

type Scene = {
  src: string;
  /** Miniatura de 16px em base64: pinta a cena na hora, antes da imagem chegar. */
  placeholder: string;
  /** altura / largura da imagem original. */
  ratio: number;
  start: number;
  end: number;
};

const SCENES: Scene[] = [
  {
    src: "/moradas/scroll-01-natureza-loteamento.webp",
    placeholder:
      "data:image/webp;base64,UklGRr4AAABXRUJQVlA4ILIAAAAwBQCdASoQACgAPu1cqE2ppKOiNVgIATAdiWMAnQWtA1bHL16O+ScRJ2Kj+UtoN3aEkADiafXlM3reLYsxsKR9mEEe5NyBC+BuCzxKeJLsAIZQb+W2R/HA9a7kNEYqqZ4+GSf041rdRkBw9If9pBx7NhYZG5OUE0hkn5GDHVud3QjIvzBDuPjPQvs0GebzMtqDFuq8VSZoVxWZiJ006n7XRR/K8FVriO1vzRsgCRSzV6wA",
    ratio: 1983 / 793,
    start: 0,
    end: 0.34,
  },
  {
    src: "/moradas/scroll-02-loteamento-casa.webp",
    placeholder:
      "data:image/webp;base64,UklGRtYAAABXRUJQVlA4IMoAAABQBQCdASoQACcAPuVipk2pJaOiNVgIASAciWIAqPWM78uTbvRCwT/i4kvGII499Xwe2AAA/u8+DziPLiodWqDS1Myty6mfWDH+mzn5Yr7wbcP6ML7qkayY1ngfLVUHxaPT8eyIA+bNHS2jLdq+cmvoW+rZwnAJ8o8/ICjWDriX41SSKqE5WI7p+k2DP8udDUN4hQnzY0adaVNiHvTU5AxAAW6DfukjT8P10LPzFrVCqZuGvZHU02q6Lg0yAEytV3jkYpO1q/noqAAA",
    ratio: 1947 / 808,
    start: 0.28,
    end: 0.6,
  },
  {
    src: "/moradas/scroll-03-caminho-porta.webp",
    placeholder:
      "data:image/webp;base64,UklGRuAAAABXRUJQVlA4INQAAAAQBQCdASoQACYAPu1mqE8ppaOiKqwBMB2JQBOgtQJA4OjWCa/FxJbMiLRFWbPkC34AAPlQogNXS7kiRo2Va0cGN7G7jHLKSqlYIsJOx+M8IJH0SN8/hYulHV+zqqUb+XjX1fmXiC7sdu6bG0hX7hj+L+ckBTYYzMHiN6owRAyYx9HNqM5KK48DCYOpWN96zfVuezE9jugwEXkY/OHNuJ7gmzmFd9VgZs6dWjbAcYrUqq1zYircIhaAtmEqLG2vKyflsggQfQnVNhF8/Gvph3pdpXAAAA==",
    ratio: 1942 / 809,
    start: 0.54,
    end: 0.82,
  },
  {
    src: "/moradas/scroll-04-casa-interior.webp",
    placeholder:
      "data:image/webp;base64,UklGRuwAAABXRUJQVlA4IOAAAACQBQCdASoQACYAPuVkpk2pJiOiNVgIASAciUATpltMuaIhGM6c/fPP2BPmNaU/agp/n1/k0AD89wW5ED69jJGmj2BNBp0OoSIuKlfGTfugl+x0WZlm+5671XShXwZ5xqw7bOFhUq8JJ0jAZpruCa7KSQr8W1E/Rihs0YGtRu9m9HzdfMcZPuq3k6APiqfUuhAW33ixvoNKixNwV2Bz6Na4shXJqctz3uwqbyIALYcGS0AFrtptb3OJr62yxDwDdaS2iuJJ6ReYk3Hfv+fFfa6PH5xme5Wxde2MW5bcjCgAAA==",
    ratio: 1940 / 811,
    start: 0.76,
    end: 1,
  },
];

type Chapter = {
  start: number;
  end: number;
  label: string;
  title: [string, string];
  text: string;
  align: "left" | "right";
};

// Cinco capítulos, um por ideia de venda. Eram oito, em 15 telas de rolagem:
// a pessoa precisava passar por quase tudo antes de chegar ao formulário.
const CHAPTERS: Chapter[] = [
  {
    start: 0,
    end: 0.13,
    label: "LOTEAMENTO RESIDENCIAL · PARATY / RJ",
    title: ["Invista em Paraty", "com tranquilidade."],
    text: "Lotes de 250 a 450 m² entre a Mata Atlântica e o Centro Histórico. Para viver, construir e valorizar.",
    align: "left",
  },
  {
    start: 0.17,
    end: 0.3,
    label: "A 9 MINUTOS DO CENTRO HISTÓRICO",
    title: ["A natureza", "como endereço."],
    text: "Mata, cachoeiras e o Rio Perequê-Açu ao redor — e o centro colonial de Paraty a nove minutos.",
    align: "right",
  },
  {
    start: 0.36,
    end: 0.5,
    label: "INFRAESTRUTURA ENTREGUE",
    title: ["Pronto para", "construir."],
    text: "Lotes residenciais e comerciais com água, luz, ruas pavimentadas e iluminação já instaladas. Nada ficou no papel.",
    align: "left",
  },
  {
    start: 0.56,
    end: 0.7,
    label: "ESTILO DE VIDA",
    title: ["Caminhos que", "levam para casa."],
    text: "Playground, espaço pet, academia ao ar livre e áreas verdes preservadas, num bairro com diretrizes arquitetônicas.",
    align: "right",
  },
  {
    start: 0.74,
    end: 0.86,
    label: "FACILIDADE",
    title: ["Sua casa,", "sem complicação."],
    text: "Financiamento direto com o loteador, sem banco e sem burocracia.",
    align: "left",
  },
];

/** A partir daqui o cartão final, com o convite para a visita, entra em cena. */
const FINAL_AT = 0.9;

/** Duração da troca entre uma cena e a próxima, em fração da história. */
const SCENE_FADE = 0.06;

// O prazo de parcelamento ficou de fora de propósito: 240x ainda está "a
// confirmar" na base de conhecimento da Sophia, e a landing não pode prometer
// uma condição que a equipe não confirma na conversa.
const BENEFITS = [
  ["9 min", "do Centro Histórico"],
  ["250–450 m²", "residenciais e comerciais"],
  ["Sem banco", "direto com o loteador"],
] as const;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function range(value: number, start: number, end: number) {
  return clamp((value - start) / (end - start));
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

/** Leva até o formulário; no desktop, já deixa o cursor no primeiro campo. */
function irParaFormulario(event: MouseEvent<HTMLAnchorElement>) {
  const destino = document.getElementById("formulario");
  if (!destino) return;
  event.preventDefault();

  const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: destino.offsetTop, behavior: reduzir ? "auto" : "smooth" });

  // No celular o foco abriria o teclado no meio da rolagem; lá a pessoa toca
  // no campo quando chegar.
  if (window.matchMedia("(pointer: fine)").matches) {
    const focar = () => document.getElementById("nome")?.focus({ preventScroll: true });
    if ("onscrollend" in window) {
      window.addEventListener("scrollend", focar, { once: true });
    } else {
      setTimeout(focar, 900);
    }
  }
}

export function ParallaxLanding() {
  const rootRef = useRef<HTMLElement>(null);
  const storyRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const story = storyRef.current;
    const stage = stageRef.current;
    if (!root || !story || !stage) return;

    const sceneEls = Array.from(stage.querySelectorAll<HTMLElement>("[data-scene]"));
    const imageEls = sceneEls.map((el) => el.querySelector<HTMLImageElement>("img"));
    const chapterEls = Array.from(stage.querySelectorAll<HTMLElement>("[data-chapter]"));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let travel: number[] = [];
    let distance = 1;
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;
    let activeChapter = 0;
    let shownCounter = 1;
    let frame = 0;

    const markLoaded = (img: HTMLImageElement) => {
      const done = () => img.classList.add("is-loaded");
      if (img.complete && img.naturalWidth > 0) done();
      else img.addEventListener("load", done, { once: true });
    };

    /** Só a primeira cena vem no HTML; as outras são pedidas quando fizer falta. */
    const loadScene = (index: number) => {
      const img = imageEls[index];
      if (!img || img.getAttribute("src")) return;
      const src = img.dataset.src;
      if (!src) return;
      img.src = src;
      markLoaded(img);
    };

    const measure = () => {
      const stageHeight = stage.clientHeight;
      travel = imageEls.map((img) => Math.max(0, (img?.offsetHeight ?? 0) - stageHeight));
      distance = Math.max(1, story.offsetHeight - stageHeight);
    };

    const update = () => {
      frame = 0;
      const progress = clamp(-story.getBoundingClientRect().top / distance);
      const still = reduceMotion.matches;

      SCENES.forEach((scene, index) => {
        const el = sceneEls[index];
        const img = imageEls[index];
        if (!el || !img) return;

        // Pede a próxima imagem com folga, antes de a troca começar.
        if (progress >= scene.start - 0.12) loadScene(index);

        const fadeIn = index === 0 ? 1 : range(progress, scene.start, scene.start + SCENE_FADE);
        const fadeOut =
          index === SCENES.length - 1 ? 1 : 1 - range(progress, scene.end - SCENE_FADE, scene.end);
        const opacity = fadeIn * fadeOut;
        const visible = opacity > 0.001;

        el.style.opacity = opacity.toFixed(3);
        el.classList.toggle("is-visible", visible);
        if (!visible) return;

        const eased = easeInOutCubic(range(progress, scene.start, scene.end));
        const y = still ? 0 : -(travel[index] ?? 0) * eased;
        const scale = still ? 1 : 1.06 - 0.06 * eased;
        img.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
      });

      const nextChapter = CHAPTERS.findIndex(
        (chapter) => progress >= chapter.start && progress <= chapter.end,
      );
      if (nextChapter !== activeChapter) {
        chapterEls.forEach((el, index) => {
          const isActive = index === nextChapter;
          el.classList.toggle("is-active", isActive);
          if (!isActive) el.classList.remove("is-intro");
          el.setAttribute("aria-hidden", String(!isActive));
        });
        activeChapter = nextChapter;
      }

      // O contador mostra o último capítulo alcançado, inclusive nos intervalos
      // em que nenhum texto está na tela.
      let reached = 1;
      CHAPTERS.forEach((chapter, index) => {
        if (progress >= chapter.start) reached = index + 1;
      });
      if (reached !== shownCounter && counterRef.current) {
        counterRef.current.textContent = String(reached).padStart(2, "0");
        shownCounter = reached;
      }

      if (barRef.current) {
        barRef.current.style.transform = `scaleY(${Math.max(progress, 0.02).toFixed(4)})`;
      }

      stage.classList.toggle("is-scrolled", progress > 0.02);
      stage.classList.toggle("is-final", progress >= FINAL_AT);
      root.classList.toggle("has-float-cta", progress > 0.08 && progress < FINAL_AT);
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    // Barra de endereço do celular aparecendo/sumindo muda só a altura em
    // poucas dezenas de pixels: remedir aí faria a imagem dar um salto.
    const onResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (width === lastWidth && Math.abs(height - lastHeight) < 160) return;
      lastWidth = width;
      lastHeight = height;
      measure();
      requestUpdate();
    };

    imageEls.forEach((img) => {
      if (img?.getAttribute("src")) markLoaded(img);
      img?.addEventListener("load", () => {
        measure();
        requestUpdate();
      });
    });

    measure();
    update();

    // Depois que a primeira tela terminou de carregar, as outras cenas vêm em
    // segundo plano, sem disputar banda com a imagem principal.
    const loadRest = () => SCENES.forEach((_, index) => loadScene(index));
    let idleId = 0;
    const scheduleRest = () => {
      idleId = window.setTimeout(loadRest, 1200);
    };
    if (document.readyState === "complete") scheduleRest();
    else window.addEventListener("load", scheduleRest, { once: true });

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    reduceMotion.addEventListener("change", requestUpdate);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(idleId);
      window.removeEventListener("load", scheduleRest);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", onResize);
      reduceMotion.removeEventListener("change", requestUpdate);
    };
  }, []);

  return (
    <main className="parallax-landing" ref={rootRef}>
      <a className="mp-skip-link" href="#formulario" onClick={irParaFormulario}>
        Pular para o formulário de contato
      </a>

      <section className="mp-scroll-story" ref={storyRef} aria-label="Conheça o Moradas de Paraty">
        <div className="mp-scroll-stage" ref={stageRef}>
          <div className="mp-scene-stack" aria-hidden="true">
            {SCENES.map((scene, index) => (
              <div
                className={`mp-scroll-scene${index === 0 ? " is-visible" : ""}`}
                data-scene
                key={scene.src}
                style={{
                  opacity: index === 0 ? 1 : 0,
                  backgroundImage: `url(${scene.placeholder})`,
                }}
              >
                <div className={`mp-scene-media${index === 0 ? " mp-scene-media--intro" : ""}`}>
                  <img
                    className="mp-scene-image"
                    src={index === 0 ? scene.src : undefined}
                    data-src={scene.src}
                    alt=""
                    width={800}
                    height={Math.round(800 * scene.ratio)}
                    draggable={false}
                    decoding={index === 0 ? "sync" : "async"}
                    fetchPriority={index === 0 ? "high" : "low"}
                    style={{ "--mp-ratio": scene.ratio } as CSSProperties}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mp-cinematic-grade" aria-hidden="true" />

          <header className="mp-topbar">
            <img
              src="/moradas/logo-moradas-de-paraty-horizontal-claro.svg"
              alt="Moradas de Paraty"
              width={280}
              height={80}
            />
            <a className="mp-topbar-cta" href="#formulario" onClick={irParaFormulario}>
              Agendar visita
            </a>
          </header>

          <div className="mp-chapter-stack">
            {CHAPTERS.map((chapter, index) => {
              const Heading = index === 0 ? "h1" : "h2";
              const first = index === 0;
              return (
                <article
                  className={`mp-story-copy mp-story-copy--${chapter.align}${
                    first ? " is-active is-intro" : ""
                  }`}
                  data-chapter
                  key={chapter.label}
                  aria-hidden={!first}
                >
                  <p className="mp-story-label">{chapter.label}</p>
                  <Heading>
                    {chapter.title.map((line) => (
                      <span className="mp-line" key={line}>
                        <span>{line}</span>
                      </span>
                    ))}
                  </Heading>
                  <p className="mp-story-text">{chapter.text}</p>
                  {first ? (
                    <a
                      className="mp-primary-action mp-chapter-cta"
                      href="#formulario"
                      onClick={irParaFormulario}
                    >
                      Agendar uma visita <span aria-hidden="true">→</span>
                    </a>
                  ) : null}
                </article>
              );
            })}
          </div>

          <aside className="mp-chapter-index" aria-hidden="true">
            <span ref={counterRef}>01</span>
            <i>
              <b ref={barRef} />
            </i>
            <span>{String(CHAPTERS.length).padStart(2, "0")}</span>
          </aside>

          <div className="mp-scroll-instruction" aria-hidden="true">
            <span>Role para conhecer</span>
            <i />
          </div>

          <section className="mp-final-card" aria-label="Agende sua visita">
            <p className="mp-story-label">MORADAS DE PARATY</p>
            <h2>Venha conhecer o seu lote.</h2>
            <p>
              Agende uma visita e veja de perto os lotes disponíveis, com a equipe do
              empreendimento.
            </p>
            <div className="mp-benefit-row">
              {BENEFITS.map(([value, label]) => (
                <div key={value}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <a className="mp-primary-action" href="#formulario" onClick={irParaFormulario}>
              Agendar minha visita <span aria-hidden="true">→</span>
            </a>
            <small>Rod. Paraty–Cunha, 489 · Pantanal · Paraty / RJ</small>
          </section>
        </div>
      </section>

      <section className="mp-contact" id="formulario" aria-labelledby="mp-contact-title">
        <div className="mp-contact-copy">
          <p className="mp-story-label">FALE COM A NOSSA EQUIPE</p>
          <h2 id="mp-contact-title">Seu próximo endereço começa aqui.</h2>
          <p>
            Deixe seu contato e a nossa equipe chama você no WhatsApp com os lotes disponíveis e as
            datas de visita.
          </p>
          <ol className="mp-steps">
            <li>
              <b>1</b> Você envia seus dados
            </li>
            <li>
              <b>2</b> Em instantes falamos pelo WhatsApp
            </li>
            <li>
              <b>3</b> Você visita o lote em Paraty
            </li>
          </ol>
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

      <a className="mp-float-cta" href="#formulario" onClick={irParaFormulario}>
        Agendar uma visita <span aria-hidden="true">→</span>
      </a>
    </main>
  );
}
