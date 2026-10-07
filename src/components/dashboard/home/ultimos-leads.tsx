import { Link } from "@tanstack/react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import { Avatar } from "@/components/ds/avatar";
import { Panel } from "@/components/ds/panel";
import { Pill } from "@/components/ds/pill";
import { PanelEmpty, QueryState, SkeletonRows } from "@/components/ds/query-state";
import type { LeadRecente } from "@/lib/dashboard-queries";
import { formatTelefone, tempoRelativo } from "@/lib/format";
import { ORIGEM_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/lead-status";
import { LeadAcoes } from "./lead-acoes";

export function UltimosLeads({ query }: { query: UseQueryResult<LeadRecente[]> }) {
  return (
    <Panel
      title="Chegaram agora"
      description="Os leads mais recentes"
      action={
        <Link
          to="/dashboard/crm"
          className="text-[0.8rem] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Ver todos
        </Link>
      }
      bodyClassName="px-2 pb-2"
    >
      <QueryState
        query={query}
        skeleton={
          <div className="px-3 pb-3">
            <SkeletonRows rows={5} className="h-12" />
          </div>
        }
        isEmpty={(d) => d.length === 0}
        empty={
          <div className="px-3 pb-3">
            <PanelEmpty>Nenhum lead recebido ainda.</PanelEmpty>
          </div>
        }
      >
        {(leads) => (
          <ul className="divide-y divide-border">
            {leads.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar nome={l.nome} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{l.nome}</p>
                  <p className="truncate text-[0.78rem] text-muted-foreground">
                    {[
                      formatTelefone(l.telefone),
                      l.origem ? ORIGEM_LABEL[l.origem] : null,
                      tempoRelativo(l.created_at),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Pill tone={STATUS_TONE[l.status_crm]} dot className="hidden sm:inline-flex">
                  {STATUS_LABEL[l.status_crm]}
                </Pill>
                <LeadAcoes leadId={l.id} nome={l.nome} telefone={l.telefone} />
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Panel>
  );
}
