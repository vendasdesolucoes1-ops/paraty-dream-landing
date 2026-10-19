import type { ReactNode } from "react";

/**
 * Cabeçalho de seção da landing: rótulo, título e texto de abertura.
 *
 * Existe porque as seis seções tinham seis variações do mesmo bloco — uma sem
 * rótulo, uma com rótulo em pílula dourada, três com `tracking-tight` no h2 e
 * uma sem, margens de 6 e de 7 abaixo do rótulo. Nada disso era decisão: era
 * deriva de quem escreveu cada seção num dia diferente. O olho não nomeia a
 * diferença, mas percebe a página como um conjunto de pedaços.
 *
 * O que continua variando é o que é escolha de verdade: o tom (sobre fundo
 * claro ou escuro), o tamanho (a seção de abertura pede um título maior) e a
 * pílula dourada da oferta comercial.
 */
export function SecaoHeader({
  eyebrow,
  eyebrowPilula = false,
  titulo,
  texto,
  tom = "claro",
  tamanho = "padrao",
  className = "",
}: {
  eyebrow?: string;
  /** Rótulo em pílula dourada — reservado à seção de condições comerciais. */
  eyebrowPilula?: boolean;
  titulo: ReactNode;
  texto?: ReactNode;
  tom?: "claro" | "escuro";
  tamanho?: "padrao" | "grande";
  className?: string;
}) {
  const escuro = tom === "escuro";

  return (
    <div className={className}>
      {eyebrow ? (
        eyebrowPilula ? (
          <span className="eyebrow inline-block rounded-lg bg-gold px-5 py-2 text-primary">
            {eyebrow}
          </span>
        ) : (
          <p className={`eyebrow mb-6 ${escuro ? "text-sand" : "text-accent"}`}>{eyebrow}</p>
        )
      ) : null}

      <h2
        className={[
          "font-display leading-tight tracking-tight",
          tamanho === "grande"
            ? "text-4xl sm:text-5xl lg:text-6xl leading-[1.05]"
            : "text-4xl sm:text-5xl",
          escuro ? "text-ivory" : "text-primary",
          eyebrowPilula ? "mt-7" : "",
        ].join(" ")}
      >
        {titulo}
      </h2>

      {texto ? (
        <p
          className={`mt-6 text-lg font-light leading-relaxed ${
            escuro ? "text-ivory/75" : "text-muted-foreground"
          }`}
        >
          {texto}
        </p>
      ) : null}
    </div>
  );
}
