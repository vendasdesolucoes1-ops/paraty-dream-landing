import type { CSSProperties, ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  /** Atraso em ms, para escalonar elementos que entram juntos na tela. */
  delay?: number;
  className?: string;
}

/**
 * Sobe e aparece conforme entra na tela, guiado pela própria rolagem
 * (animation-timeline: view(), ver landing.css).
 *
 * Antes era um IntersectionObserver com estado do React: o conteúdo nascia
 * com opacity 0 e só aparecia depois que o JavaScript carregasse. Num celular
 * lento isso deixava o hero em branco por segundos. Agora é só CSS: o conteúdo
 * vem visível no HTML, o navegador anima no compositor, e onde não há suporte
 * a animação por rolagem ele simplesmente aparece, sem esperar nada.
 *
 * O atraso vira deslocamento na rolagem (px), não em tempo: dois blocos lado a
 * lado começam a subir em pontos ligeiramente diferentes da rolagem.
 */
export function Reveal({ children, delay = 0, className = "" }: RevealProps) {
  const style = { "--reveal-offset": `${Math.round(delay * 0.2)}px` } as CSSProperties;
  return (
    <div className={`reveal ${className}`} style={style}>
      {children}
    </div>
  );
}
