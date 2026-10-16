// Condição comercial vigente para a landing (RPC pública condicao_vigente_publica).
// undefined = carregando; null = nenhuma vigente (a landing não cita números).

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CondicaoVigente {
  entrada: string;
  parcelas: number;
}

/** "10.00" → "10"; "7.50" → "7,5". */
export function formatarEntrada(valor: number | string): string {
  const n = Number(valor);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "";
}

export function useCondicaoVigente(): CondicaoVigente | null | undefined {
  const [condicao, setCondicao] = useState<CondicaoVigente | null | undefined>(undefined);
  useEffect(() => {
    let ativo = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC fora dos tipos gerados
    (supabase.rpc as any)("condicao_vigente_publica").then(
      ({
        data,
        error,
      }: {
        data: { entrada_percentual: number; parcelas_max: number }[] | null;
        error: unknown;
      }) => {
        if (!ativo) return;
        const linha = !error && Array.isArray(data) ? data[0] : null;
        setCondicao(
          linha
            ? { entrada: formatarEntrada(linha.entrada_percentual), parcelas: linha.parcelas_max }
            : null,
        );
      },
    );
    return () => {
      ativo = false;
    };
  }, []);
  return condicao;
}
