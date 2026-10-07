import type { UseQueryResult } from "@tanstack/react-query";
import { Panel } from "@/components/ds/panel";
import { QueryState } from "@/components/ds/query-state";
import { DIAS_CHEGADAS } from "@/lib/dashboard-queries";
import { formatDiaCurto, formatDiaSemana, formatNumero, inicioDoDia } from "@/lib/format";
import { cn } from "@/lib/utils";

type Dia = { dia: Date; total: number };

/**
 * Leads que chegaram por dia, nos últimos 14 dias. Colunas em HTML: ficam
 * nítidas em qualquer tamanho de tela, não carregam biblioteca de gráfico e
 * cada coluna é focável, com a leitura em texto.
 */
export function Chegadas({ query }: { query: UseQueryResult<Dia[]> }) {
  return (
    <Panel
      title="Chegada de leads"
      description={`Por dia, nos últimos ${DIAS_CHEGADAS} dias`}
      bodyClassName="flex flex-col"
    >
      <QueryState
        query={query}
        skeleton={<div className="h-40 animate-pulse rounded-md bg-muted" aria-hidden />}
      >
        {(dias) => {
          const total = dias.reduce((s, d) => s + d.total, 0);
          const maximo = Math.max(...dias.map((d) => d.total), 1);
          const hoje = inicioDoDia().getTime();
          return (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                <span className="text-2xl font-semibold tabular-nums text-foreground">
                  {formatNumero(total)}
                </span>{" "}
                {total === 1 ? "lead" : "leads"} no período
              </p>
              <ul
                className="flex min-h-32 flex-1 items-end gap-1 pt-5"
                aria-label={`Leads por dia nos últimos ${DIAS_CHEGADAS} dias`}
              >
                {dias.map(({ dia, total: n }, i) => {
                  const ehHoje = dia.getTime() === hoje;
                  const rotulo = `${formatDiaSemana(dia)}, ${formatDiaCurto(dia)}: ${n} ${n === 1 ? "lead" : "leads"}`;
                  return (
                    <li
                      key={i}
                      className="group relative flex h-full flex-1 items-end"
                      title={rotulo}
                    >
                      <span className="sr-only">{rotulo}</span>
                      <span
                        aria-hidden
                        className={cn(
                          "w-full rounded-t-[3px] transition-[height] duration-500 ease-out motion-reduce:transition-none",
                          ehHoje ? "bg-accent" : "bg-chart-1",
                          n === 0 && "opacity-30",
                        )}
                        style={{ height: n === 0 ? "3px" : `${Math.max(6, (n / maximo) * 100)}%` }}
                      />
                      {n > 0 ? (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 text-[0.7rem] font-medium tabular-nums text-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          {n}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <div
                className="mt-2 flex justify-between text-[0.7rem] tabular-nums text-muted-foreground"
                aria-hidden
              >
                <span>{formatDiaCurto(dias[0].dia)}</span>
                <span>hoje</span>
              </div>
            </>
          );
        }}
      </QueryState>
    </Panel>
  );
}
