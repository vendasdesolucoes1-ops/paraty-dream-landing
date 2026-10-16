import type { UseQueryResult } from "@tanstack/react-query";
import { Bloco } from "@/components/ds/bloco";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import { useMontado } from "@/hooks/use-montado";
import { formatNumero, formatPorcento } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/lead-status";
import { ETAPAS_CONVERSAO, type LinhaConversao } from "@/lib/relatorios";
import type { LeadStatus } from "@/lib/types";

/** As mesmas cores do funil do Início, da entrada (frio) ao fechamento (verde). */
const COR: Record<Exclude<LeadStatus, "perdido">, string> = {
  novo: "bg-chart-3",
  qualificado: "bg-info",
  agendado: "bg-chart-2",
  visitou: "bg-warning",
  proposta: "bg-chart-4",
  fechado: "bg-success",
};

/**
 * Funil de conversão da safra do período: dos leads que entraram, quantos
 * chegaram a cada etapa (mesmo que depois tenham sido perdidos) e a taxa de
 * passagem de uma etapa para a seguinte. Diferente do funil do Início, que é
 * a foto de onde os leads estão agora.
 */
export function FunilConversao({ query }: { query: UseQueryResult<LinhaConversao[]> }) {
  const montado = useMontado(250);
  return (
    <Bloco
      titulo="Funil de conversão"
      descricao="Dos leads que entraram no período, quantos chegaram a cada etapa"
    >
      <QueryState
        query={query}
        skeleton={<SkeletonRows rows={6} className="h-9" />}
        isEmpty={(d) => !d.find((l) => l.dimensao === "total")?.entraram}
        empty={
          <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Nenhum lead entrou neste período.
          </p>
        }
      >
        {(d) => {
          const total = d.find((l) => l.dimensao === "total")!;
          return (
            <>
              <ol className="space-y-2.5">
                {ETAPAS_CONVERSAO.map((etapa, i) => {
                  const valor = total[etapa.campo];
                  const taxa = etapa.taxa ? (total[etapa.taxa] as number | null) : null;
                  return (
                    <li
                      key={etapa.status}
                      className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 sm:grid-cols-[8rem_1fr_9rem]"
                    >
                      <span className="text-[0.8125rem] font-medium text-muted-foreground">
                        {STATUS_LABEL[etapa.status]}
                      </span>
                      <div className="h-7 overflow-hidden rounded-md bg-muted/60">
                        <div
                          className={`${COR[etapa.status]} flex h-full items-center rounded-md px-2 transition-[width] duration-700 ease-out`}
                          style={{
                            width: montado
                              ? `${Math.max((valor / total.entraram) * 100, 1.5)}%`
                              : 0,
                            transitionDelay: `${i * 70}ms`,
                          }}
                        />
                      </div>
                      <span className="flex items-baseline justify-end gap-2 tabular-nums">
                        <span className="num text-[1.05rem] leading-none text-foreground">
                          {formatNumero(valor)}
                        </span>
                        <span className="w-14 text-right text-[0.75rem] text-muted-foreground">
                          {etapa.taxa
                            ? taxa === null
                              ? "—"
                              : `${Math.round(taxa * 100)}%`
                            : "100%"}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-4 text-[0.8125rem] text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {formatNumero(total.entraram)}
                </span>{" "}
                {total.entraram === 1 ? "lead entrou" : "leads entraram"} ·{" "}
                <span className="font-semibold text-foreground">
                  {formatPorcento(total.fechados, total.entraram)}
                </span>{" "}
                fecharam ·{" "}
                <span className="font-semibold text-foreground">
                  {formatNumero(total.perdidos)}
                </span>{" "}
                {total.perdidos === 1 ? "perdido" : "perdidos"}. A porcentagem à direita é a
                passagem da etapa anterior para esta.
              </p>
            </>
          );
        }}
      </QueryState>
    </Bloco>
  );
}
