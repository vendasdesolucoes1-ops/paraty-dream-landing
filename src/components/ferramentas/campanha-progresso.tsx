// Acompanhamento das campanhas do disparador. A campanha é uma cadência de uma
// etapa (gatilho "campanha") executada pelo worker da fila, não pelo navegador:
// esta tela só lê o progresso (`progresso_cadencia` / `motivos_cadencia`).

import { ChevronRight, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Pill } from "@/components/ds/pill";
import { PanelEmpty, QueryState, SkeletonRows } from "@/components/ds/query-state";
import { formatNumero, tempoRelativo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { rotuloMotivo } from "@/lib/cadencias-formato";
import {
  mensagemDeErro,
  useCampanhas,
  useCancelarCampanha,
  useMotivosCadencia,
  useProgressoCadencia,
  type Campanha,
} from "@/lib/cadencias";

/** Aviso fixo: a campanha não depende da aba aberta. */
export function AvisoCampanhaServidor({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "rounded-xl bg-info-soft px-4 py-3 text-[0.8125rem] leading-relaxed text-info",
        className,
      )}
    >
      A campanha roda no servidor: pode fechar esta aba ou o navegador. Os envios respeitam o
      horário de envio e o limite diário de cada número, então listas grandes levam alguns dias.
      Quem pediu para não receber, não tem base legal para contato ou está em atendimento humano é
      pulado automaticamente.
    </p>
  );
}

function Numero({ rotulo, valor, tom }: { rotulo: string; valor: number; tom?: "danger" }) {
  return (
    <div className="rounded-xl bg-muted/60 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p
        className={cn(
          "num mt-0.5 text-lg font-semibold tabular-nums",
          tom === "danger" && valor > 0 ? "text-danger" : "text-foreground",
        )}
      >
        {formatNumero(valor)}
      </p>
    </div>
  );
}

/** Progresso de uma campanha, atualizado a cada 10 s, com o botão de cancelar. */
export function CampanhaProgresso({
  campanha,
  onFechar,
}: {
  campanha: Pick<Campanha, "id" | "nome">;
  onFechar?: () => void;
}) {
  // `ativa` vem da lista (mesmo cache): cancelar aqui reflete na hora.
  const campanhas = useCampanhas();
  const ativa = campanhas.data?.find((c) => c.id === campanha.id)?.ativa ?? true;
  const progresso = useProgressoCadencia(campanha.id);
  const motivos = useMotivosCadencia(campanha.id);
  const cancelar = useCancelarCampanha();

  const p = progresso.data;
  const pendentes = p ? p.aguardando + p.na_fila : 0;
  const resolvidos = p ? p.enviados + p.pulados + p.erros : 0;
  const emCurso = ativa && pendentes > 0;

  return (
    <section
      aria-label={`Progresso da campanha ${campanha.nome}`}
      className="animate-swap space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold text-foreground">
          {campanha.nome}
        </h3>
        {!ativa ? (
          <Pill>Cancelada</Pill>
        ) : emCurso ? (
          <Pill tone="success" dot>
            Em andamento
          </Pill>
        ) : p ? (
          <Pill tone="info">Concluída</Pill>
        ) : null}
        {onFechar ? (
          <Button variant="ghost" size="sm" onClick={onFechar}>
            Fechar
          </Button>
        ) : null}
      </header>

      <QueryState query={progresso} skeleton={<SkeletonRows rows={2} className="h-14" />}>
        {(d) => (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Progress value={d.total ? (resolvidos / d.total) * 100 : 0} />
              <p className="text-sm tabular-nums text-muted-foreground">
                {formatNumero(d.enviados)} de {formatNumero(d.total)} enviadas
                {d.pulados + d.erros > 0 ? ` · ${formatNumero(d.pulados + d.erros)} sem envio` : ""}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Numero rotulo="Aguardando vez" valor={d.aguardando} />
              <Numero rotulo="Na fila" valor={d.na_fila} />
              <Numero rotulo="Enviadas" valor={d.enviados} />
              <Numero rotulo="Puladas" valor={d.pulados} />
              <Numero rotulo="Com erro" valor={d.erros} tom="danger" />
            </div>
          </div>
        )}
      </QueryState>

      {motivos.data && motivos.data.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Por que não saiu
          </p>
          <ul className="space-y-1 text-[0.8125rem]">
            {motivos.data.map((m) => (
              <li key={m.motivo} className="flex justify-between gap-3">
                <span className="text-foreground">{rotuloMotivo(m.motivo)}</span>
                <span className="num tabular-nums text-muted-foreground">
                  {formatNumero(m.quantidade)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {emCurso ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="text-danger hover:text-danger">
              Cancelar campanha
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar a campanha?</AlertDialogTitle>
              <AlertDialogDescription>
                As {formatNumero(pendentes)} mensagens que ainda não saíram são canceladas. O que já
                foi enviado não volta.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  cancelar.mutate(campanha.id, {
                    onSuccess: () => toast.success("Campanha cancelada."),
                    onError: (e) => toast.error(mensagemDeErro(e, "Erro ao cancelar a campanha.")),
                  })
                }
              >
                Cancelar campanha
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </section>
  );
}

/** Campanhas anteriores, da mais nova para a mais antiga; cada uma abre o progresso. */
export function CampanhasLista({
  abertaId,
  onAbrir,
}: {
  abertaId: string | null;
  onAbrir: (id: string | null) => void;
}) {
  const query = useCampanhas();
  return (
    <div className="space-y-4">
      <AvisoCampanhaServidor />
      <QueryState
        query={query}
        skeleton={<SkeletonRows rows={3} className="h-12" />}
        isEmpty={(d) => d.length === 0}
        empty={<PanelEmpty>Nenhuma campanha criada ainda.</PanelEmpty>}
      >
        {(campanhas) => (
          <ul className="space-y-2">
            {campanhas.map((c) =>
              c.id === abertaId ? (
                <li key={c.id}>
                  <CampanhaProgresso campanha={c} onFechar={() => onAbrir(null)} />
                </li>
              ) : (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onAbrir(c.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Megaphone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {c.nome}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Criada {tempoRelativo(c.criado_em)}
                        {c.ativa ? "" : " · cancelada"}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
