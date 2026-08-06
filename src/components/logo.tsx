/**
 * Logotipo do Moradas de Paraty.
 *
 * Os três SVGs vieram com muito espaço vazio ao redor da arte — no completo, a
 * marca ocupa 272x250 de um canvas 680x420, ou seja, 76% do arquivo é margem.
 * Colocado num <img> com altura fixa, o resultado é um logo minúsculo boiando
 * no meio de um retângulo transparente.
 *
 * A solução é reescrever o viewBox para a caixa real da arte no momento de
 * renderizar, em vez de editar os arquivos: eles seguem exatamente como foram
 * entregues, e o recorte é decisão de layout, não de asset. As medidas abaixo
 * saíram de getBBox() em cada arquivo, com 6 unidades de folga.
 */
import completoRaw from "@/assets/logo-moradas-de-paraty.svg?raw";
import compactoRaw from "@/assets/logo-moradas-de-paraty-compact.svg?raw";
import emblemaRaw from "@/assets/logo-moradas-de-paraty-emblem.svg?raw";

const VARIANTES = {
  completo: { svg: completoRaw, viewBox: "198 74 284 262" },
  compacto: { svg: compactoRaw, viewBox: "217 74 247 219" },
  emblema: { svg: emblemaRaw, viewBox: "256 74 168 152" },
} as const;

export type LogoVariante = keyof typeof VARIANTES;

/**
 * Troca o viewBox e tira width/height fixos, para o CSS mandar no tamanho.
 * Preserva todo o resto do arquivo, inclusive o <title> (que é o nome
 * acessível do logo).
 */
function ajustar(svg: string, viewBox: string, className: string): string {
  return svg
    .replace(/\s(width|height)="[^"]*"/g, "")
    .replace(
      /viewBox="[^"]*"/,
      `viewBox="${viewBox}" class="${className}" preserveAspectRatio="xMidYMid meet"`,
    );
}

export function Logo({
  variante = "completo",
  className = "",
}: {
  variante?: LogoVariante;
  className?: string;
}) {
  const { svg, viewBox } = VARIANTES[variante];
  // O SVG vem do próprio bundle, não de entrada de usuário — não há conteúdo
  // externo para sanitizar aqui.
  return <span dangerouslySetInnerHTML={{ __html: ajustar(svg, viewBox, className) }} />;
}
