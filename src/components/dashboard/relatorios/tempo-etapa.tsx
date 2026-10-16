import type { UseQueryResult } from "@tanstack/react-query";
import { Bloco } from "@/components/ds/bloco";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import { formatNumero } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/lead-status";
import { formatDuracao, type TempoEtapa } from "@/lib/relatorios";

/**
 * Quanto tempo, em média, o lead fica em cada etapa antes de seguir (ou ser
 * perdido). Conta as passagens que começaram no período; as que ainda estão
 * abertas aparecem à parte, com o tempo acumulado até agora.
 */
export function TempoPorEtapa({ query }: { query: UseQueryResult<TempoEtapa[]> }) {
  return (
    <Bloco
      divisor
      titulo="Tempo por etapa"
      descricao="Tempo médio até o lead sair de cada etapa, nas passagens iniciadas no período"
    >
      <QueryState
        query={query}
        skeleton={<SkeletonRows rows={1} className="h-24" />}
        isEmpty={(d) => d.every((t) => t.passagens === 0 && t.em_andamento === 0)}
        empty={
          <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Nenhuma mudança de etapa registrada neste período.
          </p>
        }
      >
        {(d) => (
          <ul className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
            {d.map((t) => (
              <li key={t.etapa} className="min-w-0">
                <span className="text-[0.8125rem] font-medium text-muted-foreground">
                  {STATUS_LABEL[t.etapa] ?? t.etapa}
                </span>
                <span className="num mt-1.5 block text-[1.75rem] leading-none text-foreground">
                  {formatDuracao(t.media_horas)}
                </span>
                <span className="mt-1 block text-[0.75rem] tabular-nums text-muted-foreground">
                  mediana {formatDuracao(t.mediana_horas)} · {formatNumero(t.passagens)}{" "}
                  {t.passagens === 1 ? "passagem" : "passagens"}
                </span>
                {t.em_andamento > 0 ? (
                  <span className="mt-0.5 block text-[0.75rem] tabular-nums text-muted-foreground">
                    {formatNumero(t.em_andamento)} ainda aqui, há{" "}
                    {formatDuracao(t.media_horas_em_andamento)} em média
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Bloco>
  );
}
