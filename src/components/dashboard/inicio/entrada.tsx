import type { UseQueryResult } from "@tanstack/react-query";
import { AreaChart } from "@/components/ds/area-chart";
import { Bloco } from "@/components/ds/bloco";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import { DIAS_CHEGADAS, type ResumoLeads } from "@/lib/dashboard-queries";
import { formatDiaCurto, formatDiaSemana, formatNumero, formatPorcento } from "@/lib/format";
import { ORIGEM_LABEL } from "@/lib/lead-status";
import type { LeadOrigem } from "@/lib/types";
import { cn } from "@/lib/utils";

const COR: Record<LeadOrigem, string> = {
  lp: "bg-chart-1",
  whatsapp: "bg-chart-2",
  indicacao: "bg-chart-3",
  instagram: "bg-chart-4",
  whatsapp_contato: "bg-chart-5",
  google_maps: "bg-chart-6",
};

type Dia = { dia: Date; total: number };

/**
 * Entrada de leads: a curva dos últimos 14 dias (passe o mouse para ler cada
 * dia) e, ao lado, de onde eles vêm.
 */
export function Entrada({
  chegadas,
  resumo,
}: {
  chegadas: UseQueryResult<Dia[]>;
  resumo: UseQueryResult<ResumoLeads>;
}) {
  return (
    <Bloco divisor titulo="Entrada de leads" descricao="Como a demanda chega e de onde ela vem">
      <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <QueryState
            query={chegadas}
            skeleton={<div className="h-48 animate-pulse rounded-xl bg-muted" aria-hidden />}
          >
            {(dias) => {
              const total = dias.reduce((s, d) => s + d.total, 0);
              const media = total / dias.length;
              return (
                <>
                  <div className="mb-5 flex flex-wrap items-baseline gap-x-8 gap-y-2">
                    <p className="text-[0.8125rem] text-muted-foreground">
                      <span className="num mr-2 text-[2rem] leading-none text-foreground">
                        {formatNumero(total)}
                      </span>
                      {total === 1 ? "lead" : "leads"} em {DIAS_CHEGADAS} dias
                    </p>
                    <p className="text-[0.8125rem] text-muted-foreground">
                      <span className="font-semibold tabular-nums text-foreground">
                        {media.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                      </span>{" "}
                      por dia, em média
                    </p>
                  </div>
                  <AreaChart
                    altura={176}
                    rotuloGrafico={`Leads por dia nos últimos ${DIAS_CHEGADAS} dias`}
                    dados={dias.map((d) => ({
                      rotulo: `${formatDiaSemana(d.dia)}, ${formatDiaCurto(d.dia)}`,
                      valor: d.total,
                    }))}
                  />
                  <div
                    className="mt-2 flex justify-between text-[0.7rem] tabular-nums text-muted-foreground"
                    aria-hidden
                  >
                    <span>{formatDiaCurto(dias[0].dia)}</span>
                    <span>{formatDiaCurto(dias[Math.floor(dias.length / 2)].dia)}</span>
                    <span>hoje</span>
                  </div>
                </>
              );
            }}
          </QueryState>
        </div>

        <div className="min-w-0 lg:col-span-5">
          <h3 className="mb-4 font-sans text-[0.8125rem] font-medium text-muted-foreground">
            Por origem
          </h3>
          <QueryState
            query={resumo}
            skeleton={<SkeletonRows rows={5} className="h-8" />}
            isEmpty={(d) => d.total === 0}
            empty={
              <p className="text-sm text-muted-foreground">
                Sem leads ainda para mostrar a origem.
              </p>
            }
          >
            {(d) => {
              const fatias = d.porOrigem
                .filter((o) => o.total > 0)
                .sort((a, b) => b.total - a.total);
              const maior = fatias[0]?.total ?? 1;
              return (
                <ul className="space-y-3.5">
                  {fatias.map((f) => (
                    <li key={f.origem ?? "sem"}>
                      <div className="flex items-baseline justify-between gap-3 text-[0.875rem]">
                        <span className="truncate text-foreground">
                          {f.origem ? ORIGEM_LABEL[f.origem] : "Sem origem"}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          <span className="font-semibold text-foreground">
                            {formatNumero(f.total)}
                          </span>
                          <span className="ml-2 inline-block w-9 text-right text-[0.75rem] text-muted-foreground">
                            {formatPorcento(f.total, d.total)}
                          </span>
                        </span>
                      </div>
                      <div
                        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-chart-track"
                        aria-hidden
                      >
                        <div
                          className={cn(
                            "h-full rounded-full transition-[width] duration-700 ease-out",
                            f.origem ? COR[f.origem] : "bg-chart-muted",
                          )}
                          style={{ width: `${(f.total / maior) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              );
            }}
          </QueryState>
        </div>
      </div>
    </Bloco>
  );
}
