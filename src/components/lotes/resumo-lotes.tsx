import { useContagem } from "@/hooks/use-contagem";
import { useMontado } from "@/hooks/use-montado";
import { LOTE_STATUS_DOT, LOTE_STATUS_LABELS } from "@/components/dashboard/lote-status";
import { formatNumero, formatPorcento } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LoteStatus } from "@/lib/types";

export interface ResumoLotesDados {
  disponiveis: number;
  reservados: number;
  vendidos: number;
}

const ORDEM: { status: LoteStatus; chave: keyof ResumoLotesDados; rotulo: string }[] = [
  { status: "disponivel", chave: "disponiveis", rotulo: "Lotes disponíveis" },
  { status: "reservado", chave: "reservados", rotulo: "Lotes reservados" },
  { status: "vendido", chave: "vendidos", rotulo: "Lotes vendidos" },
];

function Numero({
  valor,
  className,
  erro,
}: {
  valor: number | undefined;
  className?: string;
  erro?: boolean;
}) {
  const exibido = useContagem(valor);
  if (valor === undefined) {
    return erro ? (
      <span className={className}>—</span>
    ) : (
      <span
        aria-hidden
        className={cn("skeleton-shimmer inline-block h-9 w-14 rounded-lg bg-muted", className)}
      />
    );
  }
  return <span className={className}>{formatNumero(exibido ?? 0)}</span>;
}

/**
 * Placar do estoque: total, quanto está disponível, reservado e vendido, e uma
 * barra única com a proporção de cada estado que cresce até o valor. Cada
 * número é um botão que filtra a lista por aquele status.
 */
export function ResumoLotes({
  dados,
  erro,
  statusAtivo,
  onSelecionar,
}: {
  dados: ResumoLotesDados | undefined;
  erro?: boolean;
  statusAtivo: LoteStatus | "";
  onSelecionar: (status: LoteStatus | "") => void;
}) {
  const montado = useMontado(250);
  const total = dados ? dados.disponiveis + dados.reservados + dados.vendidos : undefined;

  return (
    <section
      aria-label="Resumo do estoque"
      className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] sm:p-7"
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4 lg:gap-x-8">
        <div className="col-span-2 flex flex-col lg:col-span-1 lg:border-r lg:border-border lg:pr-8">
          <span className="text-[0.8125rem] font-medium text-muted-foreground">
            Total no loteamento
          </span>
          <Numero
            valor={total}
            erro={erro}
            className="num mt-2.5 text-[2.5rem] leading-none text-foreground"
          />
          <span className="mt-2.5 text-[0.8125rem] text-muted-foreground">lotes cadastrados</span>
        </div>

        {ORDEM.map(({ status, chave, rotulo }) => {
          const valor = dados?.[chave];
          const ativo = statusAtivo === status;
          return (
            <button
              key={status}
              type="button"
              aria-pressed={ativo}
              aria-label={`${rotulo}${valor === undefined ? "" : `: ${valor}`}. ${ativo ? "Remover filtro" : "Filtrar lista"}`}
              onClick={() => onSelecionar(ativo ? "" : status)}
              className={cn(
                "group/resumo -mx-2.5 -my-2 flex min-w-0 flex-col rounded-xl px-2.5 py-2 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                ativo && "bg-muted",
              )}
            >
              <span className="flex items-center gap-2 text-[0.8125rem] font-medium text-muted-foreground group-hover/resumo:text-foreground">
                <span aria-hidden className={cn("h-2 w-2 rounded-full", LOTE_STATUS_DOT[status])} />
                {rotulo}
              </span>
              <Numero
                valor={valor}
                erro={erro}
                className="num mt-2.5 text-[2.5rem] leading-none text-foreground transition-transform duration-200 ease-[var(--ease-out)] group-hover/resumo:-translate-y-0.5 motion-reduce:transform-none"
              />
              <span className="mt-2.5 text-[0.8125rem] tabular-nums text-muted-foreground">
                {dados && total !== undefined && valor !== undefined
                  ? `${formatPorcento(valor, total)} do estoque`
                  : " "}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="mt-6 flex h-3 w-full gap-[3px] overflow-hidden rounded-full bg-chart-track"
        role="img"
        aria-label={
          dados
            ? ORDEM.map((o) => `${LOTE_STATUS_LABELS[o.status]}: ${dados[o.chave]}`).join(", ")
            : "Proporção do estoque por status"
        }
      >
        {dados && total
          ? ORDEM.filter((o) => dados[o.chave] > 0).map((o, i) => (
              <span
                key={o.status}
                title={`${LOTE_STATUS_LABELS[o.status]}: ${dados[o.chave]}`}
                className={cn(
                  LOTE_STATUS_DOT[o.status],
                  "transition-[flex-grow] duration-700 ease-out first:rounded-l-full last:rounded-r-full motion-reduce:transition-none",
                )}
                style={{
                  flexGrow: montado ? dados[o.chave] : 0,
                  flexBasis: 0,
                  minWidth: montado ? 6 : 0,
                  transitionDelay: `${i * 70}ms`,
                }}
              />
            ))
          : null}
      </div>
    </section>
  );
}
