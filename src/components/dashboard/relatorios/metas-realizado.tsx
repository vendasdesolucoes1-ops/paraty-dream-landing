import type { ReactNode } from "react";
import { useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { Bloco } from "@/components/ds/bloco";
import { Pill, type Tone } from "@/components/ds/pill";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import { formatNumero } from "@/lib/format";
import {
  INDICADOR_LABEL,
  chaveRelatorios,
  excluirMeta,
  formatPeriodo,
  type MetaRealizado,
} from "@/lib/relatorios";

/**
 * Situação da meta: atingida, no ritmo (o realizado acompanha o tempo que já
 * passou do período) ou abaixo do ritmo.
 */
function situacao(m: MetaRealizado): { tone: Tone; label: string } {
  const pct = m.percentual ?? 0;
  if (pct >= 1) return { tone: "success", label: "Atingida" };
  const decorrido = m.periodo_decorrido ?? 0;
  if (decorrido >= 1) return { tone: "danger", label: "Não atingida" };
  if (pct >= decorrido) return { tone: "info", label: "No ritmo" };
  return { tone: "warning", label: "Abaixo do ritmo" };
}

const BARRA: Record<Tone, string> = {
  success: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-muted-foreground",
  accent: "bg-accent",
};

/** Metas que tocam o período, cada uma com o realizado no período dela. */
export function MetasRealizado({
  query,
  acao,
}: {
  query: UseQueryResult<MetaRealizado[]>;
  acao?: ReactNode;
}) {
  return (
    <Bloco
      divisor
      titulo="Metas × realizado"
      descricao="Metas que tocam o período; o realizado é medido no período de cada meta"
      acao={acao}
    >
      <QueryState
        query={query}
        skeleton={<SkeletonRows rows={3} className="h-14" />}
        isEmpty={(d) => d.length === 0}
        empty={
          <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Nenhuma meta cadastrada para este período.
          </p>
        }
      >
        {(d) => (
          <ul className="divide-y divide-border">
            {d.map((m) => (
              <LinhaMeta key={m.meta_id} meta={m} />
            ))}
          </ul>
        )}
      </QueryState>
    </Bloco>
  );
}

function LinhaMeta({ meta: m }: { meta: MetaRealizado }) {
  const queryClient = useQueryClient();
  const s = situacao(m);
  const pct = m.percentual ?? 0;
  const decorrido = Math.min(Math.max(m.periodo_decorrido ?? 0, 0), 1);

  const exclusao = useMutation({
    mutationFn: () => excluirMeta(m.meta_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...chaveRelatorios, "metas"] });
      toast.success("Meta excluída.");
    },
    onError: () => toast.error("Erro ao excluir a meta."),
  });

  const quem = m.vendedor_id ? (m.vendedor_nome ?? "Vendedor") : "Equipe";

  return (
    <li className="grid grid-cols-1 items-center gap-x-6 gap-y-2 py-4 sm:grid-cols-[minmax(0,14rem)_1fr_auto]">
      <div className="min-w-0">
        <p className="truncate text-[0.9375rem] font-medium text-foreground">
          {INDICADOR_LABEL[m.indicador] ?? m.indicador} · {quem}
        </p>
        <p className="text-[0.75rem] text-muted-foreground">
          {formatPeriodo(m.periodo_inicio, m.periodo_fim)}
        </p>
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
          <span className="tabular-nums text-muted-foreground">
            <span className="font-semibold text-foreground">{formatNumero(m.realizado)}</span> de{" "}
            {formatNumero(m.alvo)}
          </span>
          <span className="tabular-nums font-semibold text-foreground">
            {Math.round(pct * 100)}%
          </span>
        </div>
        <div
          className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={Number(m.alvo)}
          aria-valuenow={Number(m.realizado)}
          aria-label={`${INDICADOR_LABEL[m.indicador]} de ${quem}`}
        >
          <div
            className={`h-full rounded-full ${BARRA[s.tone]} transition-[width] duration-700 ease-out`}
            style={{ width: `${Math.min(pct, 1) * 100}%` }}
          />
          {decorrido > 0 && decorrido < 1 ? (
            <span
              aria-hidden
              title="Quanto do período já passou"
              className="absolute inset-y-0 w-0.5 bg-foreground/50"
              style={{ left: `${decorrido * 100}%` }}
            />
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:justify-end">
        <Pill tone={s.tone} dot>
          {s.label}
        </Pill>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-danger"
              aria-label="Excluir meta"
            >
              <Trash2 />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir esta meta?</AlertDialogTitle>
              <AlertDialogDescription>
                {INDICADOR_LABEL[m.indicador]} · {quem} ·{" "}
                {formatPeriodo(m.periodo_inicio, m.periodo_fim)}. Os dados dos leads não mudam.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={exclusao.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={exclusao.isPending}
                onClick={() => exclusao.mutate()}
                className="bg-danger text-white hover:bg-danger/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}
