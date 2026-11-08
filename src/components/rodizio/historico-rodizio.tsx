import { Link } from "@tanstack/react-router";
import { Pill } from "@/components/ds/pill";
import { SkeletonRows } from "@/components/ds/query-state";
import { ORIGEM } from "@/lib/rodizio-formato";
import { useHistoricoRodizio } from "@/lib/rodizio";

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** Últimas atribuições: rodízio, distribuição, entregas manuais e remoções. */
export function HistoricoRodizio() {
  const { data, isLoading, error } = useHistoricoRodizio(50);

  if (isLoading) return <SkeletonRows rows={3} className="h-12" />;
  if (error) {
    return <p className="text-[0.8125rem] text-danger">Não foi possível carregar o histórico.</p>;
  }
  if (!data?.length) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-[0.8125rem] text-muted-foreground">
        Nenhuma atribuição registrada ainda. Elas aparecem aqui a partir de agora.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-background">
      {data.map((a) => {
        const o = ORIGEM[a.origem] ?? ORIGEM.sistema;
        return (
          <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">
              {DATA_HORA.format(new Date(a.criado_em))}
            </span>
            <div className="min-w-0 flex-1 basis-48 text-[0.875rem]">
              {a.lead_id ? (
                <Link
                  to="/dashboard/crm"
                  search={{ lead: a.lead_id }}
                  className="font-medium hover:underline"
                >
                  {a.lead_nome || "Lead sem nome"}
                </Link>
              ) : (
                <span className="font-medium">Lead apagado</span>
              )}
              <span className="text-muted-foreground">
                {a.origem === "remocao" ? " saiu de " : " → "}
                {a.vendedor_nome}
                {a.autor_nome ? ` · por ${a.autor_nome}` : ""}
              </span>
            </div>
            <Pill tone={o.tom}>{o.rotulo}</Pill>
          </li>
        );
      })}
    </ul>
  );
}
