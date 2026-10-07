import { useEffect, useState } from "react";

/**
 * Falso no primeiro quadro, verdadeiro no seguinte. Serve para barras e
 * colunas "crescerem" até o valor: renderize com largura 0 enquanto for falso
 * e a transição de CSS faz o resto.
 */
export function useMontado(atrasoMs = 60): boolean {
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setPronto(true), atrasoMs);
    return () => clearTimeout(t);
  }, [atrasoMs]);
  return pronto;
}
