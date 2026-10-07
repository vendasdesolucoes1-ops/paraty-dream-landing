import { Link } from "@tanstack/react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import { Bloco, LINK_BLOCO } from "@/components/ds/bloco";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import type { ResumoLeads } from "@/lib/dashboard-queries";
import { formatNumero, formatPorcento } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/lead-status";
import type { LeadStatus } from "@/lib/types";

/** Uma cor por etapa, da entrada (frio) ao fechamento (verde). */
const COR: Record<LeadStatus, string> = {
  novo: "bg-chart-3",
  qualificado: "bg-info",
  agendado: "bg-chart-2",
  visitou: "bg-warning",
  proposta: "bg-chart-4",
  fechado: "bg-success",
  perdido: "bg-chart-muted",
};

/**
 * Onde os leads estão no funil, hoje. Uma barra única mostra a proporção de
 * cada etapa e, embaixo, o número de cada uma. É uma foto do momento (quantos
 * estão em cada etapa agora), não um fluxo: por isso mostra "% do total" e não
 * taxa de conversão entre etapas, que exigiria o histórico de movimentos.
 */
export function Funil({ query }: { query: UseQueryResult<ResumoLeads> }) {
  return (
    <Bloco
      divisor
      titulo="Funil"
      descricao="Quantos leads estão em cada etapa agora"
      acao={
        <Link to="/dashboard/crm" className={LINK_BLOCO}>
          Abrir Kanban
        </Link>
      }
    >
      <QueryState
        query={query}
        skeleton={<SkeletonRows rows={2} className="h-16" />}
        isEmpty={(d) => d.total === 0}
        empty={
          <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Nenhum lead no CRM ainda. Eles aparecem aqui assim que chegarem.
          </p>
        }
      >
        {(d) => {
          const fechados = d.porStatus.find((p) => p.status === "fechado")?.total ?? 0;
          return (
            <>
              <div
                className="flex h-3 w-full gap-[3px] overflow-hidden rounded-full"
                role="img"
                aria-label={d.porStatus
                  .map((p) => `${STATUS_LABEL[p.status]}: ${p.total}`)
                  .join(", ")}
              >
                {d.porStatus
                  .filter((p) => p.total > 0)
                  .map((p) => (
                    <span
                      key={p.status}
                      className={`${COR[p.status]} transition-[flex-grow] duration-700 ease-out first:rounded-l-full last:rounded-r-full`}
                      style={{ flexGrow: p.total, flexBasis: 0, minWidth: 6 }}
                    />
                  ))}
              </div>

              <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4 lg:grid-cols-7">
                {d.porStatus.map(({ status, total }) => (
                  <li key={status}>
                    <Link
                      to="/dashboard/crm"
                      className="group/etapa -mx-2 flex flex-col rounded-xl px-2 py-2.5 transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex items-center gap-2 text-[0.8125rem] font-medium text-muted-foreground group-hover/etapa:text-foreground">
                        <span aria-hidden className={`h-2 w-2 rounded-full ${COR[status]}`} />
                        {STATUS_LABEL[status]}
                      </span>
                      <span className="num mt-1.5 text-[1.75rem] leading-none text-foreground">
                        {formatNumero(total)}
                      </span>
                      <span className="mt-1 text-[0.75rem] tabular-nums text-muted-foreground">
                        {formatPorcento(total, d.total)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              <p className="mt-3 text-[0.8125rem] text-muted-foreground">
                <span className="font-semibold text-foreground">{formatNumero(d.total)}</span>{" "}
                {d.total === 1 ? "lead" : "leads"} no total ·{" "}
                <span className="font-semibold text-foreground">
                  {formatPorcento(fechados, d.total)}
                </span>{" "}
                já fechados
              </p>
            </>
          );
        }}
      </QueryState>
    </Bloco>
  );
}
