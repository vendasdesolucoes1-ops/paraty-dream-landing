import { useState } from "react";
import { AlertTriangle, Pencil, Plus, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Bloco } from "@/components/ds/bloco";
import { Pill } from "@/components/ds/pill";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import { atraso } from "@/components/ds/reveal";
import { EmptyState } from "@/components/dashboard/empty-state";
import { CadenciaFormGaveta } from "@/components/dashboard/cadencias/cadencia-form";
import { STATUS_LABEL } from "@/lib/lead-status";
import { tempoRelativo } from "@/lib/format";
import {
  GATILHO_LABEL,
  MODOS,
  STATUS_INSCRICAO,
  mensagemDeErro,
  useAlternarCadencia,
  useCadencias,
  useContagemInscricoes,
  useRetomarCadencia,
  type Cadencia,
} from "@/lib/cadencias";
import { descreverDeslocamento, parseIntervalo, partesDoTemplate } from "@/lib/cadencias-formato";

function ContagemPorStatus({ cadenciaId }: { cadenciaId: string }) {
  const { data, isPending, isError } = useContagemInscricoes(cadenciaId);
  if (isPending) return <SkeletonRows rows={1} className="h-6 w-64" />;
  if (isError || !data) return null;
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum lead passou por aqui ainda.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Inscrições por status">
      {STATUS_INSCRICAO.filter((s) => data[s.value] > 0).map((s) => (
        <Pill key={s.value} tone={s.tom}>
          {s.label} <span className="num tabular-nums">{data[s.value]}</span>
        </Pill>
      ))}
    </div>
  );
}

function CartaoCadencia({
  cadencia,
  indice,
  onEditar,
}: {
  cadencia: Cadencia;
  indice: number;
  onEditar: () => void;
}) {
  const alternar = useAlternarCadencia();
  const retomar = useRetomarCadencia();
  const modoLabel = (m: string) => MODOS.find((x) => x.value === m)?.label ?? m;

  return (
    <li
      className="animate-swap space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
      style={atraso(indice, 60, 360)}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[0.9375rem] font-semibold text-foreground">{cadencia.nome}</h3>
            <Pill tone="accent">{GATILHO_LABEL[cadencia.gatilho]}</Pill>
            {cadencia.ativa ? (
              <Pill tone="success" dot>
                Ligada
              </Pill>
            ) : (
              <Pill>Desligada</Pill>
            )}
          </div>
          {cadencia.descricao ? (
            <p className="mt-1 text-[0.8125rem] text-muted-foreground">{cadencia.descricao}</p>
          ) : null}
          {cadencia.status_crm_validos?.length ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Vale para: {cadencia.status_crm_validos.map((s) => STATUS_LABEL[s] ?? s).join(", ")}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={cadencia.ativa}
            disabled={alternar.isPending}
            aria-label={cadencia.ativa ? `Desligar ${cadencia.nome}` : `Ligar ${cadencia.nome}`}
            onCheckedChange={(ativa) =>
              alternar.mutate(
                { id: cadencia.id, ativa },
                {
                  onSuccess: () =>
                    toast.success(ativa ? "Cadência ligada." : "Cadência desligada."),
                  onError: (e) => toast.error(mensagemDeErro(e, "Erro ao atualizar a cadência.")),
                },
              )
            }
          />
          <Button variant="outline" size="sm" onClick={onEditar}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Editar
          </Button>
        </div>
      </div>

      {cadencia.pausada_em ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl bg-warning-soft px-4 py-3 text-[0.8125rem] text-warning"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            Pausada automaticamente {tempoRelativo(cadencia.pausada_em)}
            {cadencia.motivo_pausa ? `: ${cadencia.motivo_pausa}` : "."}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={retomar.isPending}
            onClick={() =>
              retomar.mutate(cadencia.id, {
                onSuccess: () => toast.success("Cadência retomada."),
                onError: (e) => toast.error(mensagemDeErro(e, "Erro ao retomar a cadência.")),
              })
            }
          >
            Retomar
          </Button>
        </div>
      ) : null}

      {cadencia.etapas.length > 0 ? (
        <ol className="space-y-1.5 text-[0.8125rem]">
          {cadencia.etapas.map((e) => (
            <li key={e.id} className="flex gap-2">
              <span className="num w-5 shrink-0 text-right text-muted-foreground">{e.ordem}.</span>
              <span className={e.ativa ? "text-foreground" : "text-muted-foreground line-through"}>
                {descreverDeslocamento(parseIntervalo(e.deslocamento), e.referencia, e.hora_fixa)}
                <span className="text-muted-foreground">
                  {" · "}
                  {modoLabel(e.modo)}
                  {" · "}
                  {partesDoTemplate(e.template).length}{" "}
                  {partesDoTemplate(e.template).length === 1 ? "mensagem" : "mensagens"}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-warning">Sem etapas: nada vai sair.</p>
      )}

      <ContagemPorStatus cadenciaId={cadencia.id} />
    </li>
  );
}

/** Aba "Cadências": lista com liga/desliga, pausa automática e o editor. */
export function CadenciasLista() {
  const query = useCadencias();
  const [aberta, setAberta] = useState(false);
  const [editando, setEditando] = useState<Cadencia | null>(null);

  function abrir(c: Cadencia | null) {
    setEditando(c);
    setAberta(true);
  }

  return (
    <Bloco
      titulo="Cadências de follow-up"
      descricao="Sequências automáticas pelo WhatsApp. Cada envio passa pelas regras de envio (horário, limite diário, opt-out)."
      acao={
        <Button onClick={() => abrir(null)}>
          <Plus className="h-4 w-4" aria-hidden />
          Nova cadência
        </Button>
      }
    >
      <QueryState
        query={query}
        skeleton={<SkeletonRows rows={3} className="h-40" />}
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState
            icon={Repeat}
            title="Nenhuma cadência"
            description="Crie uma sequência de mensagens para retomar o contato com quem parou de responder."
          />
        }
      >
        {(cadencias) => (
          <ul className="space-y-4">
            {cadencias.map((c, i) => (
              <CartaoCadencia key={c.id} cadencia={c} indice={i} onEditar={() => abrir(c)} />
            ))}
          </ul>
        )}
      </QueryState>
      <CadenciaFormGaveta open={aberta} onOpenChange={setAberta} cadencia={editando} />
    </Bloco>
  );
}
