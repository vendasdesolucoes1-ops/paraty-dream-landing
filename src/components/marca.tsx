/**
 * Assinatura da marca Moradas de Paraty (identidade visual 2026).
 *
 * Mora aqui, e não em components/landing/, porque a marca não é da landing:
 * ela aparece no login, na barra lateral e na tela de abertura do painel. Era
 * exatamente esse o problema — a identidade nova existia só na landing, e o
 * sistema seguia com o emblema circular antigo, de modo que quem entrava no
 * painel via outra marca.
 *
 * É HTML + um SVG pequeno, não uma imagem com o nome desenhado: assim o nome
 * usa as fontes da marca, fica nítido em qualquer tamanho e a cor acompanha o
 * tema (claro, escuro, sobre foto).
 *
 * A cor do NOME vem de `currentColor` — quem usa decide, com text-ivory,
 * text-sidebar-foreground ou o que a tela pedir. Só a flor é fixa em dourado,
 * que é o único elemento constante da marca nos dois temas.
 */

const PETALAS_GRANDES = [0, 45, 90, 135, 180, 225, 270, 315];
const PETALAS_PEQUENAS = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];

/** O símbolo sozinho: flor de 8 pétalas em linha. */
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

/**
 * Horizontal: flor à esquerda, nome empilhado à direita.
 * O tamanho vem do font-size do elemento (classe text-*), tudo em em.
 */
export function MarcaHorizontal({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Moradas de Paraty"
      className={`inline-flex items-center gap-[0.5em] leading-none ${className}`}
    >
      <FlorParaty className="h-[2.4em] w-[2.4em] shrink-0 text-gold" />
      <span className="flex flex-col">
        <span className="marca-rotulo text-[0.5em] tracking-[0.3em]">Moradas de</span>
        <span className="marca-display mt-[0.12em] text-[1.55em] font-bold tracking-[0.03em]">
          PARATY
        </span>
      </span>
    </span>
  );
}

/** Empilhada e centralizada: flor, MORADAS DE, PARATY, divisor. */
export function MarcaEmpilhada({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Moradas de Paraty"
      className={`inline-flex flex-col items-center leading-none ${className}`}
    >
      <FlorParaty className="h-[1.6em] w-[1.6em] text-gold" />
      <span className="marca-rotulo mt-[0.35em] pl-[0.32em] text-[0.42em] tracking-[0.32em]">
        Moradas de
      </span>
      <span className="marca-display mt-[0.08em] text-[1.6em] font-bold tracking-[0.02em]">
        PARATY
      </span>
      <DivisorMarca className="mt-[0.25em] w-full" />
    </span>
  );
}
