/**
 * Assinatura da marca Moradas de Paraty (identidade visual 2026).
 *
 * Mesma construção das peças de Instagram e do design system no Figma:
 * símbolo flor de 8 pétalas em linha dourada, "MORADAS DE" em Montserrat com
 * tracking largo, "PARATY" em Playfair Display e o divisor linha–ponto–linha.
 *
 * É HTML + um SVG pequeno, e não uma imagem com o texto desenhado: assim o
 * nome usa as fontes da página, fica nítido em qualquer tamanho e a cor muda
 * por CSS (sobre a foto do hero o texto é claro; com o header sólido, verde).
 *
 * O <Logo> antigo (components/logo.tsx) segue sendo usado pelo painel/CRM.
 */

const PETALAS_GRANDES = [0, 45, 90, 135, 180, 225, 270, 315];
const PETALAS_PEQUENAS = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];

export function FlorParaty({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PETALAS_GRANDES.map((a) => (
        <path
          key={a}
          transform={`rotate(${a} 50 50)`}
          d="M50 50 C41 38 42 20 50 8 C58 20 59 38 50 50Z"
        />
      ))}
      {PETALAS_PEQUENAS.map((a) => (
        <path
          key={a}
          transform={`rotate(${a} 50 50)`}
          d="M50 50 C45 42 46 32 50 26 C54 32 55 42 50 50Z"
        />
      ))}
      <circle cx="50" cy="50" r="4" />
    </svg>
  );
}

/** Divisor da marca: linha, ponto, linha — em dourado. */
export function DivisorMarca({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`flex items-center gap-2 text-gold ${className}`}>
      <span className="h-px flex-1 bg-current" />
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      <span className="h-px flex-1 bg-current" />
    </span>
  );
}

type Tom = "claro" | "escuro";

/**
 * Assinatura empilhada (flor, MORADAS DE, PARATY, divisor).
 * tom="claro": texto marfim, para fundos verdes ou foto.
 * tom="escuro": texto verde floresta, para fundos creme.
 */
export function AssinaturaMarca({
  tom = "claro",
  className = "",
}: {
  tom?: Tom;
  className?: string;
}) {
  const cor = tom === "claro" ? "text-ivory" : "text-primary";
  return (
    <span
      role="img"
      aria-label="Moradas de Paraty"
      className={`inline-flex flex-col items-center leading-none ${cor} ${className}`}
    >
      <FlorParaty className="h-[1.6em] w-[1.6em] text-gold" />
      <span className="lp-brand-eyebrow mt-[0.35em] text-[0.42em] tracking-[0.32em] pl-[0.32em]">
        MORADAS DE
      </span>
      <span className="font-display mt-[0.08em] text-[1.6em] font-bold tracking-[0.02em]">
        PARATY
      </span>
      <DivisorMarca className="mt-[0.25em] w-full" />
    </span>
  );
}

/**
 * Versão horizontal para o header: flor à esquerda, nome empilhado à direita.
 * O tamanho vem do font-size do elemento (classe text-*), tudo em em.
 */
export function AssinaturaHorizontal({
  tom = "claro",
  className = "",
}: {
  tom?: Tom;
  className?: string;
}) {
  const cor = tom === "claro" ? "text-ivory" : "text-primary";
  return (
    <span
      role="img"
      aria-label="Moradas de Paraty"
      className={`inline-flex items-center gap-[0.5em] leading-none ${cor} ${className}`}
    >
      <FlorParaty className="h-[2.4em] w-[2.4em] shrink-0 text-gold" />
      <span className="flex flex-col">
        <span className="lp-brand-eyebrow text-[0.5em] tracking-[0.3em]">MORADAS DE</span>
        <span className="font-display mt-[0.12em] text-[1.55em] font-bold tracking-[0.03em]">
          PARATY
        </span>
      </span>
    </span>
  );
}
