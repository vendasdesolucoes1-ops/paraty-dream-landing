import { useEffect, useRef } from "react";

/**
 * Vídeo do hero avançado pela rolagem, com paralaxe.
 *
 * Duas coisas acontecem ao rolar: o quadro do vídeo avança (currentTime segue
 * a posição da página) e a mídia sobe mais devagar que o conteúdo (paralaxe).
 *
 * POR QUE O PÔSTER É UM <img> SEPARADO, E NÃO O atributo `poster`
 * O hero é o elemento que o Google mede como LCP. O atributo `poster` só é
 * pintado depois que o elemento <video> é construído; um <img> com srcSet e
 * fetchPriority="high" entra na primeira leva de requisições. O vídeo aparece
 * por cima quando estiver pronto, e a troca não é perceptível porque o pôster
 * é exatamente o primeiro quadro.
 *
 * POR QUE O VÍDEO NÃO É BAIXADO EM TODO MUNDO
 * São 2 MB. Num celular em rede móvel isso é caro, e avançar vídeo por
 * rolagem é justamente o que os navegadores de celular fazem pior — o seek
 * engasga e o efeito vira tranco. Abaixo de 1024px, ou com "reduzir
 * movimento" ligado, a tela fica no pôster e nada é baixado. Não é degradação
 * silenciosa: é a mesma imagem que o vídeo mostraria parado.
 */

/** Quanto a mídia se desloca, em fração da altura rolada. 0 = sem paralaxe. */
const PARALAXE = 0.25;

/** Suavização do avanço do vídeo (0–1). Mais baixo, mais macio e mais lento. */
const SUAVIDADE = 0.12;

export function HeroVideo({
  posterSrc,
  posterSrcSet,
  posterSizes,
  posterWidth,
  posterHeight,
  alt,
  videoSrc,
}: {
  posterSrc: string;
  posterSrcSet: string;
  posterSizes: string;
  posterWidth: number;
  posterHeight: number;
  alt: string;
  videoSrc: string;
}) {
  const camadaRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const camada = camadaRef.current;
    const video = videoRef.current;
    if (!camada || !video) return;

    const querMovimento = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    const telaGrande = window.matchMedia("(min-width: 1024px)").matches;
    if (!querMovimento || !telaGrande) return;

    // O src só é atribuído aqui — com ele no JSX, o navegador baixaria os 2 MB
    // também no celular, antes de qualquer checagem.
    video.src = videoSrc;
    video.load();

    let quadro = 0;
    let alvo = 0;
    let atual = 0;
    let duracao = 0;

    const progresso = () => {
      const alturaHero = camada.parentElement?.offsetHeight ?? window.innerHeight;
      // Vai de 0 (topo) a 1 quando o hero termina de sair da tela.
      return Math.min(1, Math.max(0, window.scrollY / alturaHero));
    };

    const passo = () => {
      quadro = 0;
      const p = progresso();

      camada.style.transform = `translate3d(0, ${(p * (camada.parentElement?.offsetHeight ?? 0) * PARALAXE).toFixed(1)}px, 0)`;

      if (duracao > 0) {
        alvo = p * duracao;
        atual += (alvo - atual) * SUAVIDADE;
        // Abaixo de um quadro de diferença não vale pedir seek: o navegador
        // enfileira a busca e o vídeo fica tremendo parado.
        if (Math.abs(alvo - atual) > 1 / 24) {
          try {
            video.currentTime = atual;
          } catch {
            /* seek antes do vídeo estar pronto */
          }
          agendar();
        }
      }
    };

    const agendar = () => {
      if (quadro) return;
      quadro = requestAnimationFrame(passo);
    };

    const aoCarregar = () => {
      duracao = video.duration || 0;
      atual = progresso() * duracao;
      video.pause();
      agendar();
    };

    video.addEventListener("loadedmetadata", aoCarregar);
    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar, { passive: true });

    return () => {
      if (quadro) cancelAnimationFrame(quadro);
      video.removeEventListener("loadedmetadata", aoCarregar);
      window.removeEventListener("scroll", agendar);
      window.removeEventListener("resize", agendar);
    };
  }, [videoSrc]);

  return (
    // Duas camadas, e não uma: lp-settle é uma animação CSS sobre transform
    // com fill both, e animação vence estilo inline no cascade — a paralaxe
    // aplicada no mesmo elemento era simplesmente ignorada. Fora o movimento
    // de abertura (settle), dentro a paralaxe da rolagem.
    <div ref={camadaRef} className="absolute inset-0 will-change-transform">
      <div className="lp-hero-media absolute inset-0">
        <img
          src={posterSrc}
          srcSet={posterSrcSet}
          sizes={posterSizes}
          alt={alt}
          className="h-full w-full object-cover"
          width={posterWidth}
          height={posterHeight}
          fetchPriority="high"
          decoding="async"
        />
        <video
          ref={videoRef}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
          className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700 data-[pronto]:opacity-100"
          onLoadedData={(e) => e.currentTarget.setAttribute("data-pronto", "")}
        />
      </div>
    </div>
  );
}
