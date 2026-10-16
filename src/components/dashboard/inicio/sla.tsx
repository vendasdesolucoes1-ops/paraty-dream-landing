import type { UseQueryResult } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ds/avatar";
import { Bloco } from "@/components/ds/bloco";
import { Pill } from "@/components/ds/pill";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import {
  SLA_JANELA_DIAS,
  SLA_PRIMEIRA_RESPOSTA_MIN,
  SLA_SEM_RESPOSTA_MIN,
  formatMinutos,
  type SlaVendedor,
} from "@/lib/tarefas";
import { cn } from "@/lib/utils";

/**
 * SLA estourado por vendedor (gestão). Duas medidas, em minutos de horário
 * comercial: leads esperando resposta além da meta agora, e primeiras
 * respostas fora da meta nos últimos 30 dias. Quem tem mais estouros vem
 * primeiro (a RPC já ordena).
 */
export function SlaPorVendedor({ query }: { query: UseQueryResult<SlaVendedor[]> }) {
  const totalAguardando = query.data?.reduce((s, v) => s + v.aguardando_estourado, 0) ?? 0;
  return (
    <Bloco
      titulo="SLA estourado por vendedor"
      descricao={`Metas: 1ª resposta em ${SLA_PRIMEIRA_RESPOSTA_MIN} min, retorno em ${SLA_SEM_RESPOSTA_MIN} min (horário comercial) · últimos ${SLA_JANELA_DIAS} dias`}
      acao={
        totalAguardando > 0 ? (
          <Pill tone="danger" dot>
            {totalAguardando} {totalAguardando === 1 ? "lead esperando" : "leads esperando"}
          </Pill>
        ) : undefined
      }
    >
      <QueryState
        query={query}
        skeleton={<SkeletonRows rows={3} className="h-12" />}
        isEmpty={(d) => d.length === 0}
        empty={
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-8 text-center">
            <ShieldCheck className="h-7 w-7 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold text-foreground">Sem conversas no período</p>
            <p className="max-w-[18rem] text-[0.8125rem] text-muted-foreground">
              O SLA aparece aqui quando os leads começam a escrever no WhatsApp.
            </p>
          </div>
        }
      >
        {(linhas) => (
          <div className="-mx-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-[0.8125rem]">
              <thead>
                <tr className="border-b border-border text-left text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <th scope="col" className="px-3 pb-2 font-semibold">
                    Vendedor
                  </th>
                  <th scope="col" className="px-3 pb-2 text-right font-semibold">
                    Esperando agora
                  </th>
                  <th scope="col" className="px-3 pb-2 text-right font-semibold">
                    1ª resposta fora
                  </th>
                  <th scope="col" className="px-3 pb-2 text-right font-semibold">
                    Mediana 1ª resp.
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhas.map((v) => {
                  const ok = v.aguardando_estourado === 0 && v.primeira_resposta_estourada === 0;
                  return (
                    <tr
                      key={v.vendedor_id ?? "sem-vendedor"}
                      className="transition-colors duration-150 hover:bg-muted/50"
                    >
                      <td className="px-3 py-2.5">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <Avatar nome={v.vendedor_nome} size="sm" className="h-7 w-7" />
                          <span className="truncate font-medium text-foreground">
                            {v.vendedor_nome}
                          </span>
                          {ok ? (
                            <Pill tone="success" className="ml-1">
                              Em dia
                            </Pill>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span
                          className={cn(
                            v.aguardando_estourado > 0
                              ? "font-semibold text-danger"
                              : "text-muted-foreground",
                          )}
                        >
                          {v.aguardando_estourado}
                        </span>
                        <span className="text-muted-foreground"> / {v.aguardando}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span
                          className={cn(
                            v.primeira_resposta_estourada > 0
                              ? "font-semibold text-warning"
                              : "text-muted-foreground",
                          )}
                        >
                          {v.primeira_resposta_estourada}
                        </span>
                        <span className="text-muted-foreground"> / {v.leads_medidos}</span>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right tabular-nums",
                          (v.mediana_primeira_resposta_min ?? 0) > SLA_PRIMEIRA_RESPOSTA_MIN
                            ? "text-warning"
                            : "text-foreground",
                        )}
                      >
                        {formatMinutos(v.mediana_primeira_resposta_min)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
    </Bloco>
  );
}
