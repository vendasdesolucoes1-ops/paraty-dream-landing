import type { UseQueryResult } from "@tanstack/react-query";
import { Panel } from "@/components/ds/panel";
import { PanelEmpty, QueryState, SkeletonRows } from "@/components/ds/query-state";
import type { ResumoLeads } from "@/lib/dashboard-queries";
import { formatNumero, formatPorcento } from "@/lib/format";
import { ORIGEM_LABEL } from "@/lib/lead-status";
import type { LeadOrigem } from "@/lib/types";

const COR: Record<LeadOrigem, string> = {
  lp: "bg-chart-1",
  whatsapp: "bg-chart-2",
  indicacao: "bg-chart-3",
  instagram: "bg-chart-4",
  whatsapp_contato: "bg-chart-5",
  google_maps: "bg-chart-6",
};

/**
 * De onde vêm os leads: uma barra única dividida em proporção, mais a lista
 * com número e porcentagem. Substitui a rosca: comparar fatias de ângulo é
 * mais difícil que comparar comprimentos, e a legenda ficava longe dos dados.
 */
export function Origem({ query }: { query: UseQueryResult<ResumoLeads> }) {
  return (
    <Panel title="Origem dos leads" description="De onde eles chegam">
      <QueryState
        query={query}
        skeleton={<SkeletonRows rows={4} className="h-6" />}
        isEmpty={(d) => d.total === 0}
        empty={<PanelEmpty>Sem leads ainda para mostrar a origem.</PanelEmpty>}
      >
        {(d) => {
          const fatias = d.porOrigem.filter((o) => o.total > 0).sort((a, b) => b.total - a.total);
          return (
            <>
              <div
                className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-chart-track"
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
              <ul className="mt-4 space-y-2.5">
                {fatias.map((f) => (
                  <li key={f.origem ?? "sem"} className="flex items-center gap-2.5 text-sm">
                    <span
                      aria-hidden
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${f.origem ? COR[f.origem] : "bg-chart-muted"}`}
                    />
                    <span className="flex-1 text-foreground">
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
    </Panel>
  );
}
