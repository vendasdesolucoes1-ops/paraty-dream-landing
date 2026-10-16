import { Bloco } from "@/components/ds/bloco";
import { Pill } from "@/components/ds/pill";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumero, formatPorcento, tempoRelativo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GATILHO_LABEL, useFollowupMetricas, useSaudeFila, type SaudeFila } from "@/lib/cadencias";

function Indicador({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="rounded-xl bg-muted/60 px-4 py-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p
        className={cn(
          "num mt-1 text-xl font-semibold tabular-nums",
          alerta ? "text-danger" : "text-foreground",
        )}
      >
        {valor}
      </p>
    </div>
  );
}

function Execucao({
  rotulo,
  quando,
  ok,
}: {
  rotulo: string;
  quando: string | null;
  ok: boolean | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
      <span className="text-muted-foreground">{rotulo}:</span>
      <span className="text-foreground">{quando ? tempoRelativo(quando) : "nunca rodou"}</span>
      {ok === null ? null : ok ? (
        <Pill tone="success" dot>
          ok
        </Pill>
      ) : (
        <Pill tone="danger" dot>
          falhou
        </Pill>
      )}
    </div>
  );
}

function CartaoSaude({ s }: { s: SaudeFila }) {
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Indicador
          rotulo="Pendentes vencidas"
          valor={formatNumero(s.pendentes_vencidas)}
          alerta={s.pendentes_vencidas > 0 && (s.mais_antiga_min ?? 0) > 10}
        />
        <Indicador
          rotulo="Mais antiga (min)"
          valor={
            s.mais_antiga_min === null
              ? "—"
              : s.mais_antiga_min.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
          }
          alerta={(s.mais_antiga_min ?? 0) > 10}
        />
        <Indicador rotulo="Erros 24h" valor={formatNumero(s.erros_24h)} alerta={s.erros_24h >= 5} />
        <Indicador rotulo="Enviadas 24h" valor={formatNumero(s.enviadas_24h)} />
        <Indicador rotulo="Aguardando aprovação" valor={formatNumero(s.aguardando_aprovacao)} />
        <Indicador
          rotulo="Inscrições atrasadas"
          valor={formatNumero(s.inscricoes_atrasadas)}
          alerta={s.inscricoes_atrasadas > 0}
        />
      </div>
      <div className="space-y-1.5 border-t border-border pt-4">
        <Execucao
          rotulo="Última execução da fila"
          quando={s.ultima_execucao_fila}
          ok={s.ultima_execucao_fila_ok}
        />
        <Execucao
          rotulo="Última execução das cadências"
          quando={s.ultima_execucao_cadencias}
          ok={s.ultima_execucao_cadencias_ok}
        />
      </div>
    </div>
  );
}

/** Aba "Métricas": saúde da fila e desempenho de cada etapa. Atualiza a cada minuto. */
export function MetricasFollowup() {
  const saude = useSaudeFila();
  const metricas = useFollowupMetricas();

  return (
    <div className="space-y-10">
      <Bloco
        titulo="Saúde da fila"
        descricao="Se algo aqui ficar vermelho, a gestão também recebe alerta no painel. Atualiza a cada minuto."
      >
        <QueryState
          query={saude}
          skeleton={<SkeletonRows rows={1} className="h-40" />}
          isEmpty={(d) => d === null}
          empty={
            <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              Sem dados da fila.
            </p>
          }
        >
          {(s) => (s ? <CartaoSaude s={s} /> : null)}
        </QueryState>
      </Bloco>

      <Bloco
        divisor
        titulo="Desempenho por etapa"
        descricao="Entregues e lidos vêm das confirmações do WhatsApp; respondidos = o lead escreveu até 72 h depois do envio."
      >
        <QueryState
          query={metricas}
          skeleton={<SkeletonRows rows={4} />}
          isEmpty={(d) => d.length === 0}
          empty={
            <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              Nenhuma mensagem de cadência ou campanha enviada ainda.
            </p>
          }
        >
          {(linhas) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[12rem]">Cadência</TableHead>
                  <TableHead className="text-right">Etapa</TableHead>
                  <TableHead className="text-right">Enviados</TableHead>
                  <TableHead className="text-right">Entregues</TableHead>
                  <TableHead className="text-right">Lidos</TableHead>
                  <TableHead className="text-right">Respondidos 72h</TableHead>
                  <TableHead className="text-right">Opt-outs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={`${l.cadencia_id}-${l.etapa_ordem}`}>
                    <TableCell>
                      <span className="font-medium text-foreground">{l.cadencia}</span>
                      <span className="block text-[0.72rem] text-muted-foreground">
                        {GATILHO_LABEL[l.gatilho] ?? l.gatilho}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{l.etapa_ordem}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumero(l.enviados)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPorcento(l.entregues, l.enviados)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPorcento(l.lidos, l.enviados)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-foreground">
                      {formatPorcento(l.respondidos_72h, l.enviados)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        l.opt_outs > 0 ? "text-danger" : "text-muted-foreground",
                      )}
                    >
                      {formatNumero(l.opt_outs)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </QueryState>
      </Bloco>
    </div>
  );
}
