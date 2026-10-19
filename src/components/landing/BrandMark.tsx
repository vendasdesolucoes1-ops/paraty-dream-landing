/**
 * Assinatura da marca na landing.
 *
 * O desenho vive em components/marca.tsx, porque a mesma marca é usada no
 * login e no painel — manter duas cópias era como a identidade antiga
 * sobreviveu no sistema depois de a landing já ter a nova.
 *
 * Aqui ficam só os nomes e o parâmetro `tom`, que é específico da landing:
 * sobre a foto do hero o nome é marfim, sobre o creme das seções é verde.
 * No painel a cor vem do token da tela, então lá o componente é usado direto.
 */

import { MarcaEmpilhada, MarcaHorizontal } from "@/components/marca";

export { DivisorMarca, FlorParaty } from "@/components/marca";

type Tom = "claro" | "escuro";

const COR: Record<Tom, string> = {
  claro: "text-ivory",
  escuro: "text-primary",
};

/** Empilhada (flor, MORADAS DE, PARATY, divisor). */
export function AssinaturaMarca({
  tom = "claro",
  className = "",
}: {
  tom?: Tom;
  className?: string;
}) {
  return <MarcaEmpilhada className={`${COR[tom]} ${className}`} />;
}

/** Horizontal, para o header: flor à esquerda, nome empilhado à direita. */
export function AssinaturaHorizontal({
  tom = "claro",
  className = "",
}: {
  tom?: Tom;
  className?: string;
}) {
  return <MarcaHorizontal className={`${COR[tom]} ${className}`} />;
}
