import { useState } from "react";
import { Pause, Play, Repeat, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pill } from "@/components/ds/pill";
import { SkeletonRows } from "@/components/ds/query-state";
import { atraso } from "@/components/ds/reveal";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Secao } from "@/components/crm/ficha";
import { formatHora, rotuloDia, tempoRelativo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { rotuloMotivo } from "@/lib/cadencias-formato";
import {
  EVENTO_LABEL,
  GATILHO_LABEL,
  STATUS_INSCRICAO_INFO,
  mensagemDeErro,
  useAcaoInscricao,
  useCadenciasManuais,
  useEventosDoLead,
  useInscreverLead,
  useInscricoesDoLead,
  type AcaoInscricao,
  type Inscricao,
} from "@/lib/cadencias";

const ROTULO_ACAO: Record<AcaoInscricao, { feito: string; erro: string }> = {
  pausar: { feito: "Follow-up pausado.", erro: "Erro ao pausar." },
  retomar: { feito: "Follow-up retomado.", erro: "Erro ao retomar." },
  cancelar: { feito: "Follow-up cancelado.", erro: "Erro ao cancelar." },
};

function quando(iso: string) {
  return `${rotuloDia(iso)}, ${formatHora(iso)}`;
}

function LinhaInscricao({ inscricao, indice }: { inscricao: Inscricao; indice: number }) {
  const acao = useAcaoInscricao();
  const info = STATUS_INSCRICAO_INFO[inscricao.status];
  const emCurso = inscricao.status === "ativa" || inscricao.status === "pausada";

  function executar(a: AcaoInscricao) {
    acao.mutate(
      { id: inscricao.id, acao: a },
      {
        onSuccess: () => toast.success(ROTULO_ACAO[a].feito),
        onError: (e) => toast.error(mensagemDeErro(e, ROTULO_ACAO[a].erro)),
      },
    );
  }

  return (
    <li
      style={atraso(indice, 40, 300)}
      className={cn(
        "animate-swap space-y-2 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-muted/50",
        !emCurso && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[0.875rem] font-medium text-foreground">
          {inscricao.cadencia?.nome ?? "Cadência removida"}
        </span>
        {inscricao.cadencia ? <Pill>{GATILHO_LABEL[inscricao.cadencia.gatilho]}</Pill> : null}
        <Pill tone={info?.tom ?? "neutral"} dot={inscricao.status === "ativa"}>
          {info?.label ?? inscricao.status}
        </Pill>
      </div>
      <p className="flex flex-wrap gap-x-2 gap-y-1 text-[0.75rem] text-muted-foreground">
        <span>
          {inscricao.etapa_atual > 0
            ? `Etapa ${inscricao.etapa_atual} enviada`
            : "Nenhuma etapa enviada"}
          {inscricao.ultimo_envio_em ? ` ${tempoRelativo(inscricao.ultimo_envio_em)}` : ""}
        </span>
        {inscricao.status === "ativa" ? (
          <>
            <span aria-hidden>·</span>
            <span className="tabular-nums">
              {inscricao.proxima_em
                ? `Próxima: ${quando(inscricao.proxima_em)}`
                : "Próxima etapa na fila de envio"}
            </span>
          </>
        ) : null}
        {!emCurso && inscricao.motivo_saida ? (
          <>
            <span aria-hidden>·</span>
            <span>{rotuloMotivo(inscricao.motivo_saida)}</span>
          </>
        ) : null}
      </p>
      {emCurso ? (
        <div className="flex flex-wrap gap-1.5">
          {inscricao.status === "ativa" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={acao.isPending}
              onClick={() => executar("pausar")}
            >
              <Pause className="h-3.5 w-3.5" aria-hidden />
              Pausar
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={acao.isPending}
              onClick={() => executar("retomar")}
            >
              <Play className="h-3.5 w-3.5" aria-hidden />
              Retomar
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-danger hover:text-danger"
            disabled={acao.isPending}
            onClick={() => executar("cancelar")}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Cancelar
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function Inscrever({ leadId, jaInscritas }: { leadId: string; jaInscritas: Set<string> }) {
  const { data: cadencias } = useCadenciasManuais();
  const inscrever = useInscreverLead();
  const [escolhida, setEscolhida] = useState<string>("");
  const disponiveis = (cadencias ?? []).filter((c) => !jaInscritas.has(c.id));

  if (!cadencias || cadencias.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={escolhida} onValueChange={setEscolhida} disabled={disponiveis.length === 0}>
        <SelectTrigger className="h-9 w-full sm:w-64" aria-label="Cadência para inscrever o lead">
          <SelectValue
            placeholder={
              disponiveis.length === 0 ? "Já está em todas as cadências" : "Escolha uma cadência"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {disponiveis.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        disabled={!escolhida || inscrever.isPending}
        onClick={() =>
          inscrever.mutate(
            { cadenciaId: escolhida, leadId },
            {
              onSuccess: () => {
                toast.success("Lead inscrito no follow-up.");
                setEscolhida("");
              },
              onError: (e) => toast.error(mensagemDeErro(e, "Erro ao inscrever o lead.")),
            },
          )
        }
      >
        {inscrever.isPending ? "Inscrevendo…" : "Inscrever"}
      </Button>
    </div>
  );
}

/** Aba "Follow-up" da ficha do lead: cadências em que ele está, ações e últimos eventos. */
export function LeadFollowupTab({ leadId }: { leadId: string }) {
  const inscricoes = useInscricoesDoLead(leadId);
  const eventos = useEventosDoLead(leadId);
  const emCurso = new Set(
    (inscricoes.data ?? [])
      .filter((i) => i.status === "ativa" || i.status === "pausada")
      .map((i) => i.cadencia_id),
  );

  return (
    <div className="space-y-6">
      <Inscrever leadId={leadId} jaInscritas={emCurso} />

      {inscricoes.isPending ? (
        <SkeletonRows rows={2} className="h-16" />
      ) : inscricoes.isError ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border px-4 py-4 text-sm">
          <span>Não foi possível carregar o follow-up.</span>
          <Button variant="outline" size="sm" onClick={() => inscricoes.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : inscricoes.data.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Fora de qualquer cadência"
          description="Inscreva o lead numa cadência manual para a retomada de contato acontecer sozinha."
        />
      ) : (
        <Secao titulo="Cadências">
          <ul className="-mx-3 space-y-0.5">
            {inscricoes.data.map((i, n) => (
              <LinhaInscricao key={i.id} inscricao={i} indice={n} />
            ))}
          </ul>
        </Secao>
      )}

      {eventos.data && eventos.data.length > 0 ? (
        <Secao titulo="Últimos eventos">
          <ul className="space-y-1.5 text-[0.8125rem]">
            {eventos.data.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {quando(e.criado_em)}
                </span>
                <span className="min-w-0 text-foreground">
                  {EVENTO_LABEL[e.evento] ?? e.evento}
                  {e.etapa_ordem ? ` · etapa ${e.etapa_ordem}` : ""}
                  {e.cadencia?.nome ? (
                    <span className="text-muted-foreground"> · {e.cadencia.nome}</span>
                  ) : null}
                  {e.motivo ? (
                    <span className="block text-xs text-muted-foreground">
                      {rotuloMotivo(e.motivo)}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Secao>
      ) : null}
    </div>
  );
}
