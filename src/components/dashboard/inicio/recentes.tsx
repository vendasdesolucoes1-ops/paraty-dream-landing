import { Link } from "@tanstack/react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import { Avatar } from "@/components/ds/avatar";
import { Bloco, LINK_BLOCO } from "@/components/ds/bloco";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import type { LeadRecente } from "@/lib/dashboard-queries";
import { tempoRelativo } from "@/lib/format";
import { ORIGEM_LABEL, STATUS_LABEL } from "@/lib/lead-status";

/** Quem chegou por último: nome, de onde veio, há quanto tempo e em que etapa está. */
export function Recentes({ query }: { query: UseQueryResult<LeadRecente[]> }) {
  return (
    <Bloco
      titulo="Recém-chegados"
      acao={
        <Link to="/dashboard/crm" className={LINK_BLOCO}>
          Ver todos
        </Link>
      }
    >
      <QueryState
        query={query}
        skeleton={<SkeletonRows rows={4} className="h-12" />}
        isEmpty={(d) => d.length === 0}
        empty={
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum lead recebido ainda.
          </p>
        }
      >
        {(leads) => (
          <ul className="-mx-3 divide-y divide-border border-y border-border">
            {leads.slice(0, 5).map((l) => (
              <li
                key={l.id}
                className="group/linha relative flex items-center gap-3 px-3 py-2.5 transition-colors duration-150 hover:bg-muted/50 focus-within:bg-muted/50"
              >
                <Avatar nome={l.nome} size="sm" className="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <Link
                    to="/dashboard/crm"
                    search={{ lead: l.id }}
                    className="block truncate text-[0.875rem] font-medium leading-tight text-foreground after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                  >
                    {l.nome}
                  </Link>
                  <p className="mt-0.5 truncate text-[0.75rem] text-muted-foreground">
                    {[l.origem ? ORIGEM_LABEL[l.origem] : null, STATUS_LABEL[l.status_crm]]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className="shrink-0 text-[0.75rem] tabular-nums text-muted-foreground">
                  {tempoRelativo(l.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Bloco>
  );
}
