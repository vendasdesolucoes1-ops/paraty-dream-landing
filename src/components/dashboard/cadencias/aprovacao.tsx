import { useState } from "react";
import { CheckCheck, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bloco } from "@/components/ds/bloco";
import { Pill } from "@/components/ds/pill";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import { atraso } from "@/components/ds/reveal";
import { EmptyState } from "@/components/dashboard/empty-state";
import { tempoRelativo } from "@/lib/format";
import {
  mensagemDeErro,
  sugerirComIa,
  useAprovarEnvio,
  useEnviosParaAprovar,
  useRejeitarEnvio,
  type EnvioParaAprovar,
} from "@/lib/cadencias";

function ItemAprovacao({ envio, indice }: { envio: EnvioParaAprovar; indice: number }) {
  const [partes, setPartes] = useState<string[]>(envio.partes.length ? envio.partes : [""]);
  const [motivoIa, setMotivoIa] = useState<string | null>(envio.ia_motivo);
  const [sugerindo, setSugerindo] = useState(false);
  const aprovar = useAprovarEnvio();
  const rejeitar = useRejeitarEnvio();
  const ocupado = aprovar.isPending || rejeitar.isPending || sugerindo;
  const limpas = partes.map((p) => p.trim()).filter((p) => p.length > 0);

  async function sugerir() {
    setSugerindo(true);
    try {
      const r = await sugerirComIa(envio.id);
      setPartes(r.partes);
      setMotivoIa(r.motivo || null);
      toast.success("Sugestão da IA carregada. Revise antes de aprovar.");
    } catch (e) {
      toast.error(mensagemDeErro(e, "A IA não conseguiu sugerir um texto."));
    } finally {
      setSugerindo(false);
    }
  }

  return (
    <li
      className="animate-swap space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
      style={atraso(indice, 60, 360)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[0.9375rem] font-semibold text-foreground">{envio.lead_nome}</h3>
        {envio.cadencia ? <Pill tone="accent">{envio.cadencia}</Pill> : null}
        {envio.etapa_ordem ? <Pill>Etapa {envio.etapa_ordem}</Pill> : null}
        <span className="ml-auto text-xs text-muted-foreground">
          Aguardando {tempoRelativo(envio.criado_em)}
        </span>
      </div>

      {motivoIa ? (
        <p className="rounded-lg bg-info-soft px-3 py-2 text-xs text-info">
          <span className="font-medium">Por que a IA escreveu assim:</span> {motivoIa}
        </p>
      ) : null}

      <div className="space-y-2">
        {partes.map((p, i) => (
          <div key={i} className="flex items-start gap-2">
            <Textarea
              rows={2}
              value={p}
              disabled={ocupado}
              aria-label={`Mensagem ${i + 1} de ${partes.length}`}
              onChange={(e) => setPartes((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {partes.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={ocupado}
                onClick={() => setPartes((l) => l.filter((_, j) => j !== i))}
                aria-label={`Remover mensagem ${i + 1}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={ocupado}
          onClick={() => setPartes((l) => [...l, ""])}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Outra mensagem
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button
          disabled={ocupado || limpas.length === 0}
          onClick={() =>
            aprovar.mutate(
              { id: envio.id, partes: limpas },
              {
                onSuccess: () => toast.success("Aprovado. Vai para a fila de envio."),
                onError: (e) => toast.error(mensagemDeErro(e, "Erro ao aprovar.")),
              },
            )
          }
        >
          Aprovar
        </Button>
        <Button
          variant="outline"
          disabled={ocupado}
          onClick={() =>
            rejeitar.mutate(envio.id, {
              onSuccess: () => toast.success("Rejeitado. Esta etapa não sai para o lead."),
              onError: (e) => toast.error(mensagemDeErro(e, "Erro ao rejeitar.")),
            })
          }
        >
          Rejeitar
        </Button>
        <Button variant="ghost" className="ml-auto" disabled={ocupado} onClick={sugerir}>
          <Sparkles className="h-4 w-4" aria-hidden />
          {sugerindo ? "Pedindo à IA…" : "Sugerir com IA"}
        </Button>
      </div>
    </li>
  );
}

/** Aba "Aprovação": rascunhos das etapas em modo IA esperando alguém aprovar. */
export function AprovacaoEnvios() {
  const query = useEnviosParaAprovar();
  return (
    <Bloco
      titulo="Aguardando aprovação"
      descricao="Mensagens de etapas em modo “IA com aprovação”. Nada sai sem um clique em Aprovar."
    >
      <QueryState
        query={query}
        skeleton={<SkeletonRows rows={2} className="h-48" />}
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState
            icon={CheckCheck}
            title="Nada para aprovar"
            description="Quando uma etapa em modo IA vencer, o rascunho aparece aqui."
          />
        }
      >
        {(envios) => (
          <ul className="space-y-4">
            {envios.map((e, i) => (
              <ItemAprovacao key={e.id} envio={e} indice={i} />
            ))}
          </ul>
        )}
      </QueryState>
    </Bloco>
  );
}
