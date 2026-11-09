import { Link } from "@tanstack/react-router";
import { Pill } from "@/components/ds/pill";
import { SkeletonRows } from "@/components/ds/query-state";
import { descreverWhatsapp, ORIGEM } from "@/lib/rodizio-formato";
import { useHistoricoRodizio } from "@/lib/rodizio";

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/**
 * Últimas atribuições: rodízio, distribuição, entregas manuais e remoções.
 * Cada linha diz também se o WhatsApp do aviso saiu para o vendedor e quando
 * (a hora da atribuição sozinha não prova que ele ficou sabendo).
 */
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
        const zap = descreverWhatsapp(a);
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
            <div className="flex flex-wrap items-center gap-1.5">
              {zap ? (
                <span title={zap.dica}>
                  <Pill tone={zap.tom} dot>
                    {zap.rotulo}
                  </Pill>
                </span>
              ) : null}
              <Pill tone={o.tom}>{o.rotulo}</Pill>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
