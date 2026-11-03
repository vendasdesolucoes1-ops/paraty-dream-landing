// Aba Integração (só admin): saúde da sincronização com a Meta, situação de
// cada job, histórico de execuções e "Sincronizar agora".
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { Bloco } from "@/components/ds/bloco";
import { Pill, type Tone } from "@/components/ds/pill";
import { PanelEmpty, QueryState, SkeletonRows } from "@/components/ds/query-state";
import { FaixaStatus } from "@/components/marketing/meta/pecas";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { tempoRelativo } from "@/lib/format";
import {
  formatQtd,
  resumoProgresso,
  rotuloJob,
  saudeIntegracao,
  type StatusJob,
} from "@/lib/marketing-calculos";
import {
  useProgressoCarga,
  useExecucoes,
  useSincronizarAgora,
  useStatusIntegracao,
  type Execucao,
  type FuncaoSync,
} from "@/lib/marketing-meta";
import { cn } from "@/lib/utils";

const STATUS_EXEC: Record<StatusJob["ultimo_status"], { label: string; tone: Tone }> = {
  executando: { label: "Rodando", tone: "info" },
  sucesso: { label: "Sucesso", tone: "success" },
  parcial: { label: "Parcial", tone: "warning" },
  erro: { label: "Erro", tone: "danger" },
};

const ACOES: { funcao: FuncaoSync; label: string; descricao: string }[] = [
  {
    funcao: "meta-sync-ads",
    label: "Anúncios",
    descricao: "Estrutura e métricas dos últimos 28 dias",
  },
  {
    funcao: "meta-sync-instagram",
    label: "Instagram",
    descricao: "Conta, público e posts dos últimos 30 dias",
  },
  { funcao: "meta-sync-stories", label: "Stories", descricao: "Stories no ar agora" },
];

export function Integracao() {
  const status = useStatusIntegracao();
  const execucoes = useExecucoes(30);

  return (
    <div className="space-y-10">
      <QueryState query={status} skeleton={<SkeletonRows rows={1} className="h-14" />}>
        {(jobs) => <FaixaStatus saude={saudeIntegracao(jobs)} />}
      </QueryState>

      <SincronizarAgora />

      <CargaHistorica />

      <Bloco
        divisor
        titulo="Situação de cada sincronização"
        descricao="Anúncios e Instagram rodam de madrugada (03h–05h); stories, de hora em hora"
      >
        <QueryState
          query={status}
          skeleton={<SkeletonRows rows={3} />}
          isEmpty={(d) => d.length === 0}
          empty={<PanelEmpty>Nenhuma sincronização registrada ainda.</PanelEmpty>}
        >
          {(jobs) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[12rem]">Sincronização</TableHead>
                  <TableHead>Última execução</TableHead>
                  <TableHead>Último sucesso</TableHead>
                  <TableHead className="min-w-[14rem]">Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => {
                  const st = STATUS_EXEC[j.ultimo_status] ?? STATUS_EXEC.erro;
                  return (
                    <TableRow key={j.job}>
                      <TableCell className="font-medium text-foreground">
                        {rotuloJob(j.job)}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <Pill tone={st.tone} dot>
                            {st.label}
                          </Pill>
                          <span className="text-[0.8125rem] text-muted-foreground">
                            {tempoRelativo(j.ultima_em)}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="text-[0.8125rem] text-muted-foreground">
                        {j.ultimo_sucesso_em ? tempoRelativo(j.ultimo_sucesso_em) : "nunca"}
                      </TableCell>
                      <TableCell className="text-[0.8125rem] text-muted-foreground">
                        {observacao(j)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </QueryState>
      </Bloco>

      <Bloco divisor titulo="Histórico de execuções" descricao="As 30 mais recentes">
        <QueryState
          query={execucoes}
          skeleton={<SkeletonRows rows={6} className="h-12" />}
          isEmpty={(d) => d.length === 0}
          empty={<PanelEmpty>Nenhuma execução registrada ainda.</PanelEmpty>}
        >
          {(lista) => (
            <ul className="divide-y divide-border border-y border-border">
              {lista.map((e) => (
                <LinhaExecucao key={e.id} e={e} />
              ))}
            </ul>
          )}
        </QueryState>
      </Bloco>
    </div>
  );
}

/** Texto curto do que importa na última execução de um job. */
function observacao(j: StatusJob): string {
  if (j.ultimo_status === "erro") {
    if (j.codigo_erro === 190) return "Token expirado ou revogado: troque o META_ACCESS_TOKEN.";
    return j.ultimo_erro ?? "Falhou sem mensagem.";
  }
  const indisp = Array.isArray(j.detalhes?.indisponiveis)
    ? (j.detalhes!.indisponiveis as string[])
    : [];
  const partes: string[] = [];
  if (j.ultimo_status === "parcial")
    partes.push("Parte ficou para a próxima execução (retoma sozinha).");
  partes.push(`${formatQtd(j.registros)} registros gravados.`);
  if (indisp.length) partes.push(`Métricas indisponíveis na Meta: ${indisp.join(", ")}.`);
  return partes.join(" ");
}

function duracao(e: Execucao): string | null {
  if (!e.finalizado_em) return null;
  const s = Math.round(
    (new Date(e.finalizado_em).getTime() - new Date(e.iniciado_em).getTime()) / 1000,
  );
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

function LinhaExecucao({ e }: { e: Execucao }) {
  const [aberto, setAberto] = useState(false);
  const st = STATUS_EXEC[e.status] ?? STATUS_EXEC.erro;
  const temDetalhe = Boolean(e.erro) || (e.detalhes && Object.keys(e.detalhes).length > 0);
  return (
    <li>
      <Collapsible open={aberto} onOpenChange={setAberto}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
          <Pill tone={st.tone} dot className="shrink-0">
            {st.label}
          </Pill>
          <span className="min-w-0 flex-1 truncate text-[0.875rem] text-foreground">
            {rotuloJob(e.job)}
          </span>
          <span className="text-[0.8125rem] tabular-nums text-muted-foreground">
            {new Date(e.iniciado_em).toLocaleString("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
            })}
            {duracao(e) ? ` · ${duracao(e)}` : ""} · {formatQtd(e.registros)} registros
          </span>
          {temDetalhe ? (
            <CollapsibleTrigger asChild>
              <button
                type="button"
                aria-label={aberto ? "Esconder detalhes" : "Ver detalhes"}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")}
                  aria-hidden
                />
              </button>
            </CollapsibleTrigger>
          ) : null}
        </div>
        <CollapsibleContent>
          <div className="mb-3 space-y-2 rounded-lg bg-muted/50 p-3 text-[0.8125rem]">
            {e.erro ? (
              <p className="text-danger">
                {e.codigo_erro ? `Erro ${e.codigo_erro}: ` : ""}
                {e.erro}
              </p>
            ) : null}
            {e.detalhes && Object.keys(e.detalhes).length ? (
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono text-[0.72rem] text-muted-foreground">
                {JSON.stringify(e.detalhes, null, 2)}
              </pre>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function SincronizarAgora() {
  const mutacao = useSincronizarAgora();
  const [rodando, setRodando] = useState<FuncaoSync | null>(null);

  async function sincronizar(funcao: FuncaoSync, label: string) {
    setRodando(funcao);
    try {
      const r = await mutacao.mutateAsync(funcao);
      if (r.ok) {
        toast.success(
          r.status === "parcial"
            ? `${label}: parte sincronizada; o restante continua na próxima execução.`
            : `${label} sincronizado${r.registros != null ? ` (${formatQtd(r.registros)} registros)` : ""}.`,
        );
      } else {
        toast.error(`${label}: ${r.erro ?? "a sincronização falhou."}`);
      }
    } catch (e) {
      toast.error(
        `${label}: ${(e as Error)?.message ?? "não foi possível chamar a sincronização."}`,
      );
    } finally {
      setRodando(null);
    }
  }

  return (
    <Bloco
      titulo="Sincronizar agora"
      descricao="Busca os dados na Meta na hora, sem esperar o horário automático. Pode levar até 2 minutos."
    >
      <ul className="grid gap-3 sm:grid-cols-3">
        {ACOES.map((a) => (
          <li
            key={a.funcao}
            className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-[0.875rem] font-medium text-foreground">{a.label}</p>
              <p className="text-[0.75rem] text-muted-foreground">{a.descricao}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={rodando !== null}
              onClick={() => sincronizar(a.funcao, a.label)}
              aria-label={`Sincronizar ${a.label} agora`}
            >
              {rodando === a.funcao ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              )}
              {rodando === a.funcao ? "Rodando" : "Agora"}
            </Button>
          </li>
        ))}
      </ul>
    </Bloco>
  );
}

function CargaHistorica() {
  const q = useProgressoCarga();
  return (
    <Bloco
      divisor
      titulo="Carga histórica"
      descricao="Busca o passado em lotes pequenos (anúncios por mês, Instagram por semana) e continua sozinha até terminar."
    >
      <QueryState
        query={q}
        skeleton={<SkeletonRows rows={2} className="h-12" />}
        isEmpty={(d) => d.length === 0}
        empty={<PanelEmpty>A carga histórica começa na próxima execução automática.</PanelEmpty>}
      >
        {(cargas) => (
          <ul className="grid gap-4 sm:grid-cols-2">
            {cargas.map((c) => {
              const p = resumoProgresso(c);
              return (
                <li key={c.carga} className="rounded-xl border border-border px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[0.875rem] font-medium text-foreground">{p.titulo}</p>
                    <Pill tone={c.concluido ? "success" : "info"} dot>
                      {c.concluido ? "Concluída" : "Em andamento"}
                    </Pill>
                  </div>
                  <div
                    className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(p.fracao * 100)}
                    aria-label={p.titulo}
                  >
                    <div
                      className="h-full rounded-full bg-chart-1 transition-[width] duration-500"
                      style={{ width: `${Math.round(p.fracao * 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[0.75rem] text-muted-foreground">{p.detalhe}</p>
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
    </Bloco>
  );
}
