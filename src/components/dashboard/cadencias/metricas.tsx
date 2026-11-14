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
import { Link } from "@tanstack/react-router";
import {
  GATILHO_LABEL,
  useFollowupMetricas,
  useRespostasFollowup,
  useResumoPesquisas,
  useSaudeFila,
  type ResumoPesquisas,
  type SaudeFila,
} from "@/lib/cadencias";

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

function LinkLead({ id, nome }: { id: string; nome: string | null }) {
  return (
    <Link
      to="/dashboard/crm"
      search={{ lead: id }}
      className="font-medium text-foreground underline-offset-2 hover:underline"
    >
      {nome || "Lead sem nome"}
    </Link>
  );
}

function Nota({ nota }: { nota: number | null }) {
  if (nota == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "num font-semibold tabular-nums",
        nota <= 2 ? "text-danger" : nota >= 4 ? "text-success" : "text-foreground",
      )}
    >
      {nota}
    </span>
  );
}

function CartaoPesquisas({ p }: { p: ResumoPesquisas }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Indicador rotulo="Enviadas (90 dias)" valor={formatNumero(p.enviadas)} />
        <Indicador rotulo="Respondidas" valor={formatNumero(p.respondidas)} />
        <Indicador
          rotulo="Nota média"
          valor={p.media == null ? "—" : String(p.media).replace(".", ",")}
          alerta={p.media != null && p.media < 3}
        />
        <Indicador
          rotulo="Não foram chamados"
          valor={formatNumero(p.nao_atendidos)}
          alerta={p.nao_atendidos > 0}
        />
        <Indicador rotulo="Ficaram com dúvida" valor={formatNumero(p.com_duvida)} />
      </div>
      {p.por_vendedor.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Corretor</TableHead>
              <TableHead className="text-right">Respostas</TableHead>
              <TableHead className="text-right">Nota média</TableHead>
              <TableHead className="text-right">Não chamou</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {p.por_vendedor.map((v) => (
              <TableRow key={v.nome}>
                <TableCell className="font-medium text-foreground">{v.nome}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumero(v.respostas)}
                </TableCell>
                <TableCell className="text-right">
                  <Nota nota={v.media} />
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    v.nao_atendidos > 0 ? "text-danger" : "text-muted-foreground",
                  )}
                >
                  {formatNumero(v.nao_atendidos)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {p.recentes.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {p.recentes.map((r) => (
            <li key={`${r.lead_id}-${r.respondida_em}`} className="space-y-1 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <LinkLead id={r.lead_id} nome={r.lead} />
                <span className="text-muted-foreground">
                  {r.vendedor ? `· ${r.vendedor}` : ""} · {tempoRelativo(r.respondida_em)}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  {r.foi_atendido === false ? <Pill tone="danger">não foi chamado</Pill> : null}
                  {r.tem_duvida ? <Pill tone="accent">dúvida</Pill> : null}
                  <span className="text-xs text-muted-foreground">nota</span>
                  <Nota nota={r.nota} />
                </span>
              </div>
              {r.comentario ? (
                <p className="whitespace-pre-line text-muted-foreground">{r.comentario}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const INTENCAO_LABEL: Record<string, string> = {
  interessado: "interessado",
  duvida: "dúvida",
  objecao: "objeção",
  quer_agendar: "quer agendar",
  agora_nao: "agora não",
  opt_out: "não quer mais",
  fora_de_contexto: "fora do assunto",
};

/** Respostas dos leads às cadências e campanhas dos últimos 7 dias. */
function RespostasLeads() {
  const respostas = useRespostasFollowup(7);
  return (
    <QueryState
      query={respostas}
      skeleton={<SkeletonRows rows={4} />}
      isEmpty={(d) => d.length === 0}
      empty={
        <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          Nenhum lead respondeu a uma cadência ou campanha nos últimos 7 dias.
        </p>
      }
    >
      {(linhas) => (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {linhas.map((r) => (
            <li key={r.lead_id} className="space-y-1 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <LinkLead id={r.lead_id} nome={r.lead} />
                <span className="text-muted-foreground">
                  · {r.origem}
                  {r.vendedor ? ` · ${r.vendedor}` : " · sem corretor"} ·{" "}
                  {tempoRelativo(r.respondida_em)}
                </span>
                {r.intencao ? (
                  <Pill tone="accent" className="ml-auto">
                    {INTENCAO_LABEL[r.intencao] ?? r.intencao}
                  </Pill>
                ) : null}
              </div>
              <p className="whitespace-pre-line text-foreground">{r.resposta}</p>
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}

/** Aba "Métricas": saúde da fila e desempenho de cada etapa. Atualiza a cada minuto. */
export function MetricasFollowup() {
  const saude = useSaudeFila();
  const metricas = useFollowupMetricas();
  const pesquisas = useResumoPesquisas();

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

      <Bloco
        divisor
        titulo="Respostas dos leads"
        descricao="A última mensagem de cada lead que respondeu a uma cadência ou campanha nos últimos 7 dias. Clique para abrir o lead."
      >
        <RespostasLeads />
      </Bloco>

      <Bloco
        divisor
        titulo="Pesquisa de atendimento"
        descricao='Notas de 1 a 5 das pesquisas pós-atendimento e pós-visita. Nota até 2 ou "ninguém me chamou" avisa a gestão; dúvida avisa o corretor.'
      >
        <QueryState
          query={pesquisas}
          skeleton={<SkeletonRows rows={2} />}
          isEmpty={(d) => d.enviadas === 0 && d.respondidas === 0}
          empty={
            <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              Nenhuma pesquisa enviada ainda. Ligue a &quot;Pesquisa pós-atendimento&quot; ou a
              &quot;Pesquisa pós-visita&quot; na aba Cadências.
            </p>
          }
        >
          {(p) => <CartaoPesquisas p={p} />}
        </QueryState>
      </Bloco>
    </div>
  );
}
