import { Link } from "@tanstack/react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";
import { LINK_PAINEL, Panel } from "@/components/ds/panel";
import { Pill } from "@/components/ds/pill";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import type { VisitaProxima } from "@/lib/dashboard-queries";
import { formatHora, inicioDoDia, rotuloDia } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LeadAcoes } from "./lead-acoes";

/** Visitas de hoje até 7 dias à frente, em linha do tempo agrupada por dia. */
export function AgendaProxima({ query }: { query: UseQueryResult<VisitaProxima[]> }) {
  return (
    <Panel
      title="Agenda"
      description="Hoje e os próximos 7 dias"
      action={
        <Link to="/dashboard/agenda" className={LINK_PAINEL}>
          Ver agenda
        </Link>
      }
    >
      <QueryState
        query={query}
        skeleton={<SkeletonRows rows={4} className="h-11" />}
        isEmpty={(d) => d.length === 0}
        empty={
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
            <CalendarCheck className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-foreground">Semana livre</p>
            <p className="max-w-[16rem] text-[0.82rem] text-muted-foreground">
              Nenhuma visita marcada para os próximos 7 dias.
            </p>
          </div>
        }
      >
        {(visitas) => {
          const grupos = new Map<number, VisitaProxima[]>();
          for (const v of visitas) {
            const dia = inicioDoDia(new Date(v.data_hora)).getTime();
            grupos.set(dia, [...(grupos.get(dia) ?? []), v]);
          }
          const hoje = inicioDoDia().getTime();
          const temHoje = grupos.has(hoje);
          return (
            <div className="space-y-4">
              {!temHoje ? (
                <p className="rounded-lg bg-muted/60 px-3 py-2 text-[0.82rem] text-muted-foreground">
                  Hoje livre — nenhuma visita marcada.
                </p>
              ) : null}
              {[...grupos.entries()].map(([dia, lista]) => (
                <div key={dia}>
                  <h3
                    className={cn(
                      "mb-1 font-sans text-[0.72rem] font-semibold uppercase tracking-[0.1em]",
                      dia === hoje ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {rotuloDia(new Date(dia))}
                  </h3>
                  <ul className="relative ml-[0.2rem] border-l border-border pl-4">
                    {lista.map((v) => (
                      <li
                        key={v.id}
                        className="group/linha relative -ml-1 flex items-center gap-2 rounded-md py-1.5 pl-1 transition-colors hover:bg-muted/50 focus-within:bg-muted/50"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "absolute -left-[1.3rem] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ring-2 ring-card",
                            v.aConfirmar ? "bg-warning" : "bg-accent",
                          )}
                        />
                        <span className="w-11 shrink-0 text-sm font-semibold tabular-nums text-foreground">
                          {formatHora(v.data_hora)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {v.lead?.nome ?? "Lead removido"}
                        </span>
                        {v.aConfirmar ? (
                          <Pill tone="warning">Confirmar</Pill>
                        ) : v.status === "confirmada" ? (
                          <Pill tone="success">Confirmada</Pill>
                        ) : null}
                        {v.lead ? (
                          <LeadAcoes
                            leadId={v.lead.id}
                            nome={v.lead.nome}
                            telefone={v.lead.telefone}
                            sobrepor
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
