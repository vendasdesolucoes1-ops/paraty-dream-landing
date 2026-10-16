import { Link } from "@tanstack/react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import { CheckCheck } from "lucide-react";
import { Bloco } from "@/components/ds/bloco";
import { Pill } from "@/components/ds/pill";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import { BotaoConcluir } from "@/components/dashboard/lead-tarefas-tab";
import { formatHora, rotuloDia } from "@/lib/format";
import { TAREFA_TIPO_LABEL, tarefaAtrasada, type TarefaComLead } from "@/lib/tarefas";

/**
 * Tarefas do vendedor que vencem hoje, com as atrasadas no topo (a consulta
 * já vem em ordem de vencimento). Concluir é um clique, sem abrir a ficha.
 */
export function MinhasTarefas({ query }: { query: UseQueryResult<TarefaComLead[]> }) {
  const atrasadas = query.data?.filter((t) => tarefaAtrasada(t)).length ?? 0;
  return (
    <Bloco
      titulo="Minhas tarefas de hoje"
      descricao={
        atrasadas > 0
          ? `${atrasadas} ${atrasadas === 1 ? "atrasada" : "atrasadas"} — comece por elas`
          : "Prazos de hoje dos leads da sua carteira"
      }
    >
      <QueryState
        query={query}
        skeleton={<SkeletonRows rows={3} className="h-12" />}
        isEmpty={(d) => d.length === 0}
        empty={
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-8 text-center">
            <CheckCheck className="h-7 w-7 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold text-foreground">Nada pendente para hoje</p>
            <p className="max-w-[18rem] text-[0.8125rem] text-muted-foreground">
              Crie tarefas com prazo na ficha do lead, na aba Tarefas.
            </p>
          </div>
        }
      >
        {(tarefas) => (
          <ul className="-mx-3 divide-y divide-border border-y border-border">
            {tarefas.map((t) => {
              const atrasada = tarefaAtrasada(t);
              return (
                <li
                  key={t.id}
                  className="group/linha relative flex items-center gap-3 px-3 py-2.5 transition-colors duration-150 hover:bg-muted/50 focus-within:bg-muted/50"
                >
                  <BotaoConcluir tarefa={t} />
                  <div className="min-w-0 flex-1">
                    {t.lead ? (
                      <Link
                        to="/dashboard/crm"
                        search={{ lead: t.lead.id }}
                        className="block truncate text-[0.875rem] font-medium leading-tight text-foreground after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                      >
                        {t.titulo}
                      </Link>
                    ) : (
                      <span className="block truncate text-[0.875rem] font-medium">{t.titulo}</span>
                    )}
                    <p className="mt-0.5 truncate text-[0.75rem] text-muted-foreground">
                      {[t.lead?.nome, TAREFA_TIPO_LABEL[t.tipo]].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {atrasada ? (
                    <Pill tone="danger" dot>
                      {rotuloDia(t.vence_em) === "Hoje"
                        ? formatHora(t.vence_em)
                        : rotuloDia(t.vence_em)}
                    </Pill>
                  ) : (
                    <span className="shrink-0 text-[0.75rem] font-medium tabular-nums text-muted-foreground">
                      {formatHora(t.vence_em)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
    </Bloco>
  );
}
