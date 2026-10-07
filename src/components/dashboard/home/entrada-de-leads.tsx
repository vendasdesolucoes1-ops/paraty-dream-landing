import type { UseQueryResult } from "@tanstack/react-query";
import { Panel } from "@/components/ds/panel";
import { PanelEmpty, QueryState, SkeletonRows } from "@/components/ds/query-state";
import { DIAS_CHEGADAS, type ResumoLeads } from "@/lib/dashboard-queries";
import {
  formatDiaCurto,
  formatDiaSemana,
  formatNumero,
  formatPorcento,
  inicioDoDia,
} from "@/lib/format";
import { ORIGEM_LABEL } from "@/lib/lead-status";
import type { LeadOrigem } from "@/lib/types";
import { cn } from "@/lib/utils";

type Dia = { dia: Date; total: number };

const COR: Record<LeadOrigem, string> = {
  lp: "bg-chart-1",
  whatsapp: "bg-chart-2",
  indicacao: "bg-chart-3",
  instagram: "bg-chart-4",
  whatsapp_contato: "bg-chart-5",
  google_maps: "bg-chart-6",
};

/**
 * Entrada de leads: quantos chegaram por dia (colunas em HTML, sem biblioteca
 * de gráfico, cada uma com a leitura em texto) e de onde vieram (barra
 * proporcional + lista). Os dois juntos respondem "como está a demanda e quem
 * a traz" sem ocupar dois painéis.
 */
export function EntradaDeLeads({
  chegadas,
  resumo,
}: {
  chegadas: UseQueryResult<Dia[]>;
  resumo: UseQueryResult<ResumoLeads>;
}) {
  return (
    <Panel title="Entrada de leads" description="Chegadas por dia e por origem">
      <div className="flex flex-1 flex-col gap-7">
        <QueryState
          query={chegadas}
          skeleton={<div className="h-32 animate-pulse rounded-md bg-muted" aria-hidden />}
        >
          {(dias) => {
            const total = dias.reduce((s, d) => s + d.total, 0);
            const maximo = Math.max(...dias.map((d) => d.total), 1);
            const hoje = inicioDoDia().getTime();
            return (
              <div>
                <p className="text-[0.8rem] text-muted-foreground">
                  <span className="num-display text-[1.9rem] leading-none text-foreground">
                    {formatNumero(total)}
                  </span>{" "}
                  {total === 1 ? "lead" : "leads"} nos últimos {DIAS_CHEGADAS} dias
                </p>
                <ul
                  className="mt-4 flex h-28 items-end gap-1.5"
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
                          className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-primary px-2 py-1 text-[0.7rem] font-medium text-primary-foreground opacity-0 shadow-md transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100"
                        >
                          {formatDiaSemana(dia)} {formatDiaCurto(dia)} · {n}
                        </span>
                        <span
                          aria-hidden
                          className={cn(
                            "w-full rounded-t-[4px] transition-[height,filter] duration-500 ease-out group-hover:brightness-110 motion-reduce:transition-none",
                            ehHoje ? "bg-accent" : "bg-chart-1/70",
                            n === 0 && "opacity-30",
                          )}
                          style={{
                            height: n === 0 ? "3px" : `${Math.max(8, (n / maximo) * 100)}%`,
                          }}
                        />
                      </li>
                    );
                  })}
                </ul>
                <div
                  className="mt-1.5 flex justify-between text-[0.7rem] tabular-nums text-muted-foreground"
                  aria-hidden
                >
                  <span>{formatDiaCurto(dias[0].dia)}</span>
                  <span>hoje</span>
                </div>
              </div>
            );
          }}
        </QueryState>

        <div className="border-t border-border pt-5">
          <QueryState
            query={resumo}
            skeleton={<SkeletonRows rows={3} className="h-5" />}
            isEmpty={(d) => d.total === 0}
            empty={<PanelEmpty>Sem leads ainda para mostrar a origem.</PanelEmpty>}
          >
            {(d) => {
              const fatias = d.porOrigem
                .filter((o) => o.total > 0)
                .sort((a, b) => b.total - a.total);
              return (
                <>
                  <div
                    className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-chart-track"
                    role="img"
                    aria-label={fatias
                      .map((f) => `${f.origem ? ORIGEM_LABEL[f.origem] : "Sem origem"}: ${f.total}`)
                      .join(", ")}
                  >
                    {fatias.map((f) => (
                      <span
                        key={f.origem ?? "sem"}
                        className={f.origem ? COR[f.origem] : "bg-chart-muted"}
                        style={{ width: `${(f.total / d.total) * 100}%` }}
                      />
                    ))}
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {fatias.map((f) => (
                      <li key={f.origem ?? "sem"} className="flex items-center gap-2.5 text-sm">
                        <span
                          aria-hidden
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            f.origem ? COR[f.origem] : "bg-chart-muted",
                          )}
                        />
                        <span className="flex-1 truncate text-foreground">
                          {f.origem ? ORIGEM_LABEL[f.origem] : "Sem origem"}
                        </span>
                        <span className="font-semibold tabular-nums text-foreground">
                          {formatNumero(f.total)}
                        </span>
                        <span className="w-10 text-right text-[0.78rem] tabular-nums text-muted-foreground">
                          {formatPorcento(f.total, d.total)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              );
            }}
          </QueryState>
        </div>
      </div>
    </Panel>
  );
}
