import { useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Bloco } from "@/components/ds/bloco";
import { Chip } from "@/components/ds/chip";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumero, formatPorcento } from "@/lib/format";
import { ORIGEM_LABEL, STATUS_LABEL } from "@/lib/lead-status";
import { ETAPAS_CONVERSAO, type LinhaConversao } from "@/lib/relatorios";
import type { LeadOrigem } from "@/lib/types";

type Recorte = "vendedor" | "origem";

function rotuloDaLinha(l: LinhaConversao): string {
  if (l.dimensao === "origem" && l.chave !== "sem_origem") {
    return ORIGEM_LABEL[l.chave as LeadOrigem] ?? l.rotulo;
  }
  return l.rotulo;
}

/** Conversão por vendedor ou por origem: cada etapa com o número e a passagem da anterior. */
export function TabelaConversao({ query }: { query: UseQueryResult<LinhaConversao[]> }) {
  const [recorte, setRecorte] = useState<Recorte>("vendedor");
  return (
    <Bloco
      divisor
      titulo="Conversão por vendedor e por origem"
      descricao="Número de leads em cada etapa e, embaixo, a passagem da etapa anterior"
      acao={
        <div className="flex gap-2" role="group" aria-label="Agrupar por">
          <Chip ativo={recorte === "vendedor"} onClick={() => setRecorte("vendedor")}>
            Por vendedor
          </Chip>
          <Chip ativo={recorte === "origem"} onClick={() => setRecorte("origem")}>
            Por origem
          </Chip>
        </div>
      }
    >
      <QueryState
        query={query}
        skeleton={<SkeletonRows rows={4} />}
        isEmpty={(d) => !d.some((l) => l.dimensao === recorte)}
        empty={
          <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Nenhum lead entrou neste período.
          </p>
        }
      >
        {(d) => {
          const linhas = d.filter((l) => l.dimensao === recorte);
          const total = d.find((l) => l.dimensao === "total");
          return (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[10rem]">
                    {recorte === "vendedor" ? "Vendedor" : "Origem"}
                  </TableHead>
                  {ETAPAS_CONVERSAO.map((e) => (
                    <TableHead key={e.status} className="text-right">
                      {e.campo === "entraram" ? "Entraram" : STATUS_LABEL[e.status]}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Perdidos</TableHead>
                  <TableHead className="text-right">Conversão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...linhas, ...(total ? [total] : [])].map((l) => (
                  <TableRow
                    key={`${l.dimensao}-${l.chave}`}
                    className={l.dimensao === "total" ? "bg-muted/40 font-medium" : undefined}
                  >
                    <TableCell className="font-medium text-foreground">
                      {rotuloDaLinha(l)}
                    </TableCell>
                    {ETAPAS_CONVERSAO.map((e) => {
                      const taxa = e.taxa ? (l[e.taxa] as number | null) : null;
                      return (
                        <TableCell key={e.status} className="text-right tabular-nums">
                          <span className="block text-foreground">{formatNumero(l[e.campo])}</span>
                          {e.taxa ? (
                            <span className="block text-[0.72rem] text-muted-foreground">
                              {taxa === null ? "—" : `${Math.round(taxa * 100)}%`}
                            </span>
                          ) : null}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatNumero(l.perdidos)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-foreground">
                      {formatPorcento(l.fechados, l.entraram)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          );
        }}
      </QueryState>
    </Bloco>
  );
}
