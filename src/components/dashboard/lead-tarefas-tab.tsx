import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Clock, Headset, ListTodo, Plus, Timer } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Campo, Secao } from "@/components/crm/ficha";
import { formatHora, rotuloDia, tempoRelativo } from "@/lib/format";
import {
  SLA_PRIMEIRA_RESPOSTA_MIN,
  SLA_SEM_RESPOSTA_MIN,
  TAREFA_TIPOS,
  TAREFA_TIPO_LABEL,
  formatMinutos,
  tarefaAtrasada,
  useConcluirTarefa,
  useCriarTarefa,
  useSlaDoLead,
  useTarefasDoLead,
  type Tarefa,
  type TarefaTipo,
} from "@/lib/tarefas";

const SEM_RESPONSAVEL = "nenhum";

/** Valor de `<input type="datetime-local">` no fuso do navegador. */
function paraInputLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Sugestão de vencimento: daqui a 1 h, arredondado para o próximo quarto de hora. */
function vencimentoPadrao(): string {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return paraInputLocal(d);
}

/** Atalhos de prazo: em 1 h e amanhã às 9h. */
function amanhaAs9(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return paraInputLocal(d);
}

/** "Hoje, 14:30", "Amanhã, 09:00", "qui, 09/10, 10:00". */
function quando(iso: string) {
  return `${rotuloDia(iso)}, ${formatHora(iso)}`;
}

/** Linha de SLA do lead: primeira resposta e espera atual, em minutos úteis. */
function SlaDoLead({ leadId }: { leadId: string }) {
  const { data: sla, isPending, isError } = useSlaDoLead(leadId);
  if (isPending || isError || !sla) return null;

  const respondida = !!sla.primeira_resposta_em;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-muted/60 px-3.5 py-2.5 text-[0.8125rem]">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Timer className="h-3.5 w-3.5" aria-hidden />
        Primeira resposta:
        <span
          className={cn(
            "font-medium tabular-nums",
            sla.primeira_resposta_estourada ? "text-danger" : "text-foreground",
          )}
          title={`Meta: ${SLA_PRIMEIRA_RESPOSTA_MIN} min úteis`}
        >
          {respondida
            ? formatMinutos(sla.primeira_resposta_min)
            : `sem resposta há ${formatMinutos(sla.primeira_resposta_min)}`}
        </span>
      </span>
      {sla.aguardando_desde ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          Aguardando há
          <span
            className={cn(
              "font-medium tabular-nums",
              sla.aguardando_estourado ? "text-danger" : "text-foreground",
            )}
            title={`Meta: responder em até ${SLA_SEM_RESPOSTA_MIN} min úteis`}
          >
            {formatMinutos(sla.aguardando_min)}
          </span>
          {sla.aguardando_estourado ? (
            <Pill tone="danger" dot>
              SLA estourado
            </Pill>
          ) : null}
        </span>
      ) : (
        <span className="text-muted-foreground">Nenhuma mensagem do lead sem resposta.</span>
      )}
    </div>
  );
}

function NovaTarefaForm({ leadId, onFechar }: { leadId: string; onFechar: () => void }) {
  const { profile } = useProfile();
  const criar = useCriarTarefa();
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TarefaTipo>("retorno");
  const [venceEm, setVenceEm] = useState(vencimentoPadrao);
  const [responsavel, setResponsavel] = useState<string>(profile?.id ?? SEM_RESPONSAVEL);

  const { data: pessoas } = useQuery({
    queryKey: ["profiles-ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome")
        .eq("ativo", true)
        .is("deletado_em", null)
        .order("nome", { ascending: true });
      if (error) throw error;
      return data as { id: string; nome: string | null }[];
    },
  });

  const valido = titulo.trim().length > 0 && !!venceEm;

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!valido || criar.isPending) return;
    criar.mutate(
      {
        lead_id: leadId,
        tipo,
        titulo: titulo.trim(),
        vence_em: new Date(venceEm).toISOString(),
        responsavel_id: responsavel !== SEM_RESPONSAVEL ? responsavel : null,
      },
      {
        onSuccess: () => {
          toast.success("Tarefa criada.");
          onFechar();
        },
        onError: () => toast.error("Erro ao criar a tarefa."),
      },
    );
  }

  return (
    <form
      onSubmit={salvar}
      className="animate-swap space-y-4 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
    >
      <Campo id="tarefa-titulo" label="O que fazer">
        <Input
          id="tarefa-titulo"
          autoFocus
          maxLength={200}
          placeholder="Ex.: Ligar para confirmar a visita"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
        />
      </Campo>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="tarefa-tipo" label="Tipo">
          <Select value={tipo} onValueChange={(v) => setTipo(v as TarefaTipo)}>
            <SelectTrigger id="tarefa-tipo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAREFA_TIPOS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
        <Campo id="tarefa-responsavel" label="Responsável">
          <Select value={responsavel} onValueChange={setResponsavel}>
            <SelectTrigger id="tarefa-responsavel">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_RESPONSAVEL}>Quem atender o lead</SelectItem>
              {(pessoas ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.id === profile?.id ? `${p.nome ?? "Eu"} (eu)` : (p.nome ?? "—")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
      </div>
      <Campo id="tarefa-vence" label="Vence em">
        <Input
          id="tarefa-vence"
          type="datetime-local"
          required
          value={venceEm}
          onChange={(e) => setVenceEm(e.target.value)}
        />
      </Campo>
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setVenceEm(vencimentoPadrao())}
        >
          Em 1 hora
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setVenceEm(amanhaAs9())}>
          Amanhã, 9h
        </Button>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={!valido || criar.isPending}>
          {criar.isPending ? "Salvando..." : "Criar tarefa"}
        </Button>
      </div>
    </form>
  );
}

/** Botão redondo de concluir/reabrir, igual em todas as listas de tarefas. */
export function BotaoConcluir({
  tarefa,
  className,
}: {
  tarefa: Pick<Tarefa, "id" | "titulo" | "concluida_em">;
  className?: string;
}) {
  const concluir = useConcluirTarefa();
  const feita = !!tarefa.concluida_em;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={feita}
      aria-label={feita ? `Reabrir "${tarefa.titulo}"` : `Concluir "${tarefa.titulo}"`}
      title={feita ? "Reabrir" : "Concluir"}
      disabled={concluir.isPending}
      onClick={() =>
        concluir.mutate(
          { id: tarefa.id, concluida: !feita },
          {
            onSuccess: () => toast.success(feita ? "Tarefa reaberta." : "Tarefa concluída."),
            onError: () => toast.error("Erro ao atualizar a tarefa."),
          },
        )
      }
      className={cn(
        "relative z-10 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-[background-color,border-color,transform] duration-150 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
        feita
          ? "border-success bg-success text-background"
          : "border-muted-foreground/40 text-transparent hover:border-success hover:text-success",
        className,
      )}
    >
      <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
    </button>
  );
}

function LinhaTarefa({ tarefa, indice }: { tarefa: Tarefa; indice: number }) {
  const feita = !!tarefa.concluida_em;
  const atrasada = tarefaAtrasada(tarefa);
  return (
    <li
      style={atraso(indice, 40, 300)}
      className={cn(
        "animate-swap flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-muted/50",
        feita && "opacity-60",
      )}
    >
      <BotaoConcluir tarefa={tarefa} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "break-words text-[0.875rem] font-medium leading-snug text-foreground",
            feita && "line-through decoration-muted-foreground/60",
          )}
        >
          {tarefa.titulo}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.75rem] text-muted-foreground">
          <span>{TAREFA_TIPO_LABEL[tarefa.tipo] ?? tarefa.tipo}</span>
          <span aria-hidden>·</span>
          {feita ? (
            <span>Concluída {tempoRelativo(tarefa.concluida_em!)}</span>
          ) : (
            <span className={cn("tabular-nums", atrasada && "font-medium text-danger")}>
              {atrasada ? "Venceu " : "Vence "}
              {quando(tarefa.vence_em)}
            </span>
          )}
          {tarefa.responsavel?.nome ? (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{tarefa.responsavel.nome}</span>
            </>
          ) : null}
          {tarefa.origem === "handoff" ? (
            <Pill tone="info" className="ml-0.5">
              <Headset className="h-3 w-3" aria-hidden />
              Handoff
            </Pill>
          ) : null}
        </p>
      </div>
    </li>
  );
}

/** Aba "Tarefas" da ficha do lead: SLA do atendimento, lista e criação. */
export function LeadTarefasTab({ leadId }: { leadId: string }) {
  const [criando, setCriando] = useState(false);
  const { data: tarefas, isPending, isError, refetch } = useTarefasDoLead(leadId);
  const abertas = tarefas?.filter((t) => !t.concluida_em) ?? [];
  const concluidas = tarefas?.filter((t) => t.concluida_em) ?? [];

  return (
    <div className="space-y-6">
      <SlaDoLead leadId={leadId} />

      {criando ? (
        <NovaTarefaForm leadId={leadId} onFechar={() => setCriando(false)} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.8125rem] text-muted-foreground">
            {isPending
              ? "Carregando tarefas…"
              : `${abertas.length} ${abertas.length === 1 ? "tarefa aberta" : "tarefas abertas"}`}
          </p>
          <Button onClick={() => setCriando(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Nova tarefa
          </Button>
        </div>
      )}

      {isPending ? (
        <SkeletonRows rows={3} className="h-14" />
      ) : isError ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border px-4 py-4 text-sm">
          <span>Não foi possível carregar as tarefas.</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : !tarefas || tarefas.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="Sem tarefas"
          description="Crie uma tarefa com prazo para não perder o próximo passo com este lead."
        />
      ) : (
        <div className="space-y-6">
          {abertas.length > 0 ? (
            <Secao titulo="Abertas">
              <ul className="-mx-3 space-y-0.5">
                {abertas.map((t, i) => (
                  <LinhaTarefa key={t.id} tarefa={t} indice={i} />
                ))}
              </ul>
            </Secao>
          ) : null}
          {concluidas.length > 0 ? (
            <Secao titulo="Concluídas">
              <ul className="-mx-3 space-y-0.5">
                {concluidas.slice(0, 20).map((t, i) => (
                  <LinhaTarefa key={t.id} tarefa={t} indice={i} />
                ))}
              </ul>
            </Secao>
          ) : null}
        </div>
      )}
    </div>
  );
}
