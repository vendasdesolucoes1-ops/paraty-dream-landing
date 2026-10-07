import { Link } from "@tanstack/react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import { Panel } from "@/components/ds/panel";
import { Pill } from "@/components/ds/pill";
import { PanelEmpty, QueryState, SkeletonRows } from "@/components/ds/query-state";
import type { VisitaProxima } from "@/lib/dashboard-queries";
import { formatHora, inicioDoDia, rotuloDia } from "@/lib/format";
import { LeadAcoes } from "./lead-acoes";

/** Visitas de hoje até 7 dias à frente, agrupadas por dia. */
export function AgendaProxima({ query }: { query: UseQueryResult<VisitaProxima[]> }) {
  return (
    <Panel
      title="Próximas visitas"
      description="Hoje e nos próximos 7 dias"
      action={
        <Link
          to="/dashboard/agenda"
          className="text-[0.8rem] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Ver agenda
        </Link>
      }
      bodyClassName="px-2 pb-2"
    >
      <QueryState
        query={query}
        skeleton={
          <div className="px-3 pb-3">
            <SkeletonRows rows={4} className="h-11" />
          </div>
        }
        isEmpty={(d) => d.length === 0}
        empty={
          <div className="px-3 pb-3">
            <PanelEmpty>Nenhuma visita marcada para os próximos 7 dias.</PanelEmpty>
          </div>
        }
      >
        {(visitas) => {
          const grupos = new Map<number, VisitaProxima[]>();
          for (const v of visitas) {
            const dia = inicioDoDia(new Date(v.data_hora)).getTime();
            grupos.set(dia, [...(grupos.get(dia) ?? []), v]);
          }
          return (
            <div className="space-y-3">
              {[...grupos.entries()].map(([dia, lista]) => (
                <div key={dia}>
                  <p className="px-3 pb-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {rotuloDia(new Date(dia))}
                  </p>
                  <ul>
                    {lista.map((v) => (
                      <li key={v.id} className="flex items-center gap-3 rounded-md px-3 py-2">
                        <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-foreground">
                          {formatHora(v.data_hora)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-foreground">
                            {v.lead?.nome ?? "Lead removido"}
                          </p>
                        </div>
                        {v.aConfirmar ? (
                          <Pill tone="warning">A confirmar</Pill>
                        ) : v.status === "confirmada" ? (
                          <Pill tone="success">Confirmada</Pill>
                        ) : null}
                        {v.lead ? (
                          <LeadAcoes
                            leadId={v.lead.id}
                            nome={v.lead.nome}
                            telefone={v.lead.telefone}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          );
        }}
      </QueryState>
    </Panel>
  );
}
