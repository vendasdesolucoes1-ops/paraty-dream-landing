import { Link } from "@tanstack/react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import { LINK_PAINEL, Panel } from "@/components/ds/panel";
import { PanelEmpty, QueryState, SkeletonRows } from "@/components/ds/query-state";
import type { ResumoLeads } from "@/lib/dashboard-queries";
import { formatNumero, formatPorcento } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/lead-status";
import type { LeadStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const COR_BARRA: Record<LeadStatus, string> = {
  novo: "bg-chart-1",
  qualificado: "bg-chart-1",
  agendado: "bg-chart-1",
  visitou: "bg-chart-1",
  proposta: "bg-chart-1",
  fechado: "bg-success",
  perdido: "bg-chart-muted",
};

/**
 * Leads por etapa do funil, hoje. É uma foto do momento (quantos estão em
 * cada etapa agora), não um fluxo acumulado: por isso mostra "% do total" e
 * não taxa de conversão entre etapas, que exigiria o histórico de movimentos.
 */
export function Pipeline({ query }: { query: UseQueryResult<ResumoLeads> }) {
  return (
    <Panel
      title="Pipeline"
      description="Quantos leads estão em cada etapa agora"
      action={
        <Link to="/dashboard/crm" className={LINK_PAINEL}>
          Ver no CRM
        </Link>
      }
    >
      <QueryState
        query={query}
        skeleton={<SkeletonRows rows={7} className="h-6" />}
        isEmpty={(d) => d.total === 0}
        empty={
          <PanelEmpty>Nenhum lead no CRM ainda. Eles aparecem aqui assim que chegarem.</PanelEmpty>
        }
      >
        {(d) => {
          const maior = Math.max(...d.porStatus.map((p) => p.total), 1);
          const fechados = d.porStatus.find((p) => p.status === "fechado")?.total ?? 0;
          return (
            <>
              <ul className="-mx-2 space-y-0.5">
                {d.porStatus.map(({ status, total }) => (
                  <li key={status}>
                    <Link
                      to="/dashboard/crm"
                      className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[6.5rem_1fr_auto]"
                    >
                      <span className="text-sm text-foreground">{STATUS_LABEL[status]}</span>
                      <span
                        className="h-2.5 overflow-hidden rounded-full bg-chart-track"
                        aria-hidden
                      >
                        <span
                          className={cn(
                            "block h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none",
                            COR_BARRA[status],
                          )}
                          style={{
                            width: `${total === 0 ? 0 : Math.max(2.5, (total / maior) * 100)}%`,
                          }}
                        />
                      </span>
                      <span className="flex min-w-[5.5rem] items-baseline justify-end gap-2 tabular-nums">
                        <span className="text-sm font-semibold text-foreground">
                          {formatNumero(total)}
                        </span>
                        <span className="w-9 text-right text-[0.75rem] text-muted-foreground">
                          {formatPorcento(total, d.total)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-auto border-t border-border pt-3 text-[0.8rem] text-muted-foreground">
                <span className="font-medium text-foreground">{formatNumero(d.total)}</span>{" "}
                {d.total === 1 ? "lead" : "leads"} no total ·{" "}
                <span className="font-medium text-foreground">
                  {formatPorcento(fechados, d.total)}
                </span>{" "}
                já fechados
              </p>
            </>
          );
        }}
      </QueryState>
    </Panel>
  );
}
