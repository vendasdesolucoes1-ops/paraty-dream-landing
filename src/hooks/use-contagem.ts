import { useEffect, useRef, useState } from "react";

/**
 * Faz o número "subir" até o valor em ~700 ms (ease-out) na primeira vez que
 * ele chega, e pula direto nas atualizações seguintes: ao vivo o número não
 * deve ficar animando a cada refetch. Respeita "reduzir movimento".
 */
export function useContagem(alvo: number | null | undefined, duracaoMs = 700): number | null {
  const [valor, setValor] = useState<number | null>(null);
  const jaAnimou = useRef(false);

  useEffect(() => {
    if (alvo === null || alvo === undefined) {
      setValor(null);
      return;
    }
    const reduzir =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (jaAnimou.current || reduzir || alvo === 0) {
      jaAnimou.current = true;
      setValor(alvo);
      return;
    }
    jaAnimou.current = true;
    let raf = 0;
    const inicio = performance.now();
    const passo = (t: number) => {
      const p = Math.min(1, (t - inicio) / duracaoMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValor(Math.round(alvo * eased));
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo, duracaoMs]);

  return valor;
}
