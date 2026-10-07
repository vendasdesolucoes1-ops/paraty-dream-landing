import type { ReactNode } from "react";
import { useContagem } from "@/hooks/use-contagem";
import { formatNumero } from "@/lib/format";

export interface ItemResumo {
  rotulo: string;
  /** Número a contar. `texto` substitui a contagem (ex.: "12,4 MB"). */
  valor?: number;
  texto?: string;
  rodape?: ReactNode;
}

function Numero({ item, carregando }: { item: ItemResumo; carregando: boolean }) {
  const exibido = useContagem(carregando ? null : (item.valor ?? null));
  return (
    <div className="min-w-0 px-5 py-4 first:pl-0 sm:px-6 sm:first:pl-0">
      <p className="truncate text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {item.rotulo}
      </p>
      {carregando ? (
        <div className="mt-2 space-y-2" aria-hidden>
          <div className="skeleton-shimmer h-7 w-14 rounded-md bg-muted" />
          <div className="skeleton-shimmer h-3 w-20 rounded bg-muted" />
        </div>
      ) : (
        <>
          <p className="num mt-1.5 text-[1.75rem] leading-none text-foreground">
            {item.texto ?? (exibido === null ? "0" : formatNumero(exibido))}
          </p>
          {item.rodape ? (
            <p className="mt-1.5 truncate text-[0.8125rem] text-muted-foreground">{item.rodape}</p>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * Faixa de números no alto de uma tela de lista: direto sobre a folha, separada
 * por fios, com contagem que sobe na primeira carga.
 */
export function ResumoFaixa({
  itens,
  carregando,
  rotulo,
}: {
  itens: ItemResumo[];
  carregando: boolean;
  rotulo: string;
}) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className="grid grid-cols-3 divide-x divide-border border-y border-border"
    >
      {itens.map((item) => (
        <Numero key={item.rotulo} item={item} carregando={carregando} />
      ))}
    </div>
  );
}
