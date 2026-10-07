import { Link } from "@tanstack/react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import { CalendarCheck, MessageCircle } from "lucide-react";
import { Bloco, LINK_BLOCO } from "@/components/ds/bloco";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import type { VisitaProxima } from "@/lib/dashboard-queries";
import { formatHora, inicioDoDia, linkWhatsapp, rotuloDia } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "em 25 min", "em 2 h 10 min" até a próxima visita. */
function emBreve(data: string, agora = new Date()): string | null {
  const min = Math.round((new Date(data).getTime() - agora.getTime()) / 60_000);
  if (min <= 0 || min > 12 * 60) return null;
  if (min < 60) return `em ${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `em ${h} h ${r} min` : `em ${h} h`;
}

/**
 * Visitas de hoje aos próximos 7 dias em linha do tempo. A visita que vem a
 * seguir ganha destaque com contagem regressiva; as que já passaram ficam
 * esmaecidas, e uma marca "agora" separa o que passou do que falta.
 */
export function Agenda({ query }: { query: UseQueryResult<VisitaProxima[]> }) {
  return (
    <Bloco
      titulo="Agenda"
      descricao="Hoje e os próximos 7 dias"
      acao={
        <Link to="/dashboard/agenda" className={LINK_BLOCO}>
          Ver agenda
        </Link>
      }
    >
      <QueryState
        query={query}
        skeleton={<SkeletonRows rows={4} className="h-12" />}
        isEmpty={(d) => d.length === 0}
        empty={
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
            <CalendarCheck className="h-7 w-7 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold text-foreground">Semana livre</p>
            <p className="max-w-[15rem] text-[0.8125rem] text-muted-foreground">
              Nenhuma visita marcada para os próximos 7 dias.
            </p>
          </div>
        }
      >
        {(visitas) => {
          const agora = new Date();
          const hoje = inicioDoDia(agora).getTime();
          const grupos = new Map<number, VisitaProxima[]>();
          for (const v of visitas) {
            const dia = inicioDoDia(new Date(v.data_hora)).getTime();
            grupos.set(dia, [...(grupos.get(dia) ?? []), v]);
          }
          const proxima = visitas.find((v) => new Date(v.data_hora) > agora);
          const temHoje = grupos.has(hoje);
          return (
            <div className="space-y-6">
              {!temHoje ? (
                <p className="rounded-lg bg-muted px-3 py-2.5 text-[0.8125rem] text-muted-foreground">
                  Hoje livre — nenhuma visita marcada.
                </p>
              ) : null}
              {[...grupos.entries()].map(([dia, lista]) => (
                <div key={dia}>
                  <h3 className="mb-2 flex items-center justify-between font-sans text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <span className={cn(dia === hoje && "text-foreground")}>
                      {rotuloDia(new Date(dia))}
                    </span>
                    <span className="font-medium normal-case tracking-normal tabular-nums">
                      {lista.length} {lista.length === 1 ? "visita" : "visitas"}
                    </span>
                  </h3>
                  <ol className="relative space-y-1 before:absolute before:bottom-3 before:left-[0.4375rem] before:top-3 before:w-px before:bg-border">
                    {lista.map((v, i) => {
                      const passou = new Date(v.data_hora) <= agora;
                      const eProxima = v.id === proxima?.id;
                      const wa = v.lead ? linkWhatsapp(v.lead.telefone) : null;
                      const antes = lista[i - 1];
                      const marcaAgora =
                        dia === hoje &&
                        !passou &&
                        (!antes || new Date(antes.data_hora) <= agora) &&
                        i > 0;
                      return (
                        <li key={v.id}>
                          {marcaAgora ? (
                            <div
                              aria-label="Agora"
                              className="relative my-1.5 flex items-center gap-2 pl-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-danger"
                            >
                              <span className="h-2 w-2 rounded-full bg-danger ring-4 ring-danger/15" />
                              Agora
                              <span aria-hidden className="h-px flex-1 bg-danger/30" />
                            </div>
                          ) : null}
                          <div
                            className={cn(
                              "group/linha relative flex items-center gap-3 rounded-xl py-2 pl-6 pr-2 transition-colors duration-150 hover:bg-muted/60 focus-within:bg-muted/60",
                              eProxima && "bg-accent/10 hover:bg-accent/15",
                              passou && "opacity-55",
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "absolute left-0 top-1/2 h-[0.9375rem] w-[0.9375rem] -translate-y-1/2 rounded-full border-2 border-background",
                                v.aConfirmar ? "bg-warning" : "bg-chart-1",
                                eProxima && "bg-accent ring-4 ring-accent/20",
                              )}
                            />
                            <span className="w-11 shrink-0 text-[0.9375rem] font-semibold tabular-nums text-foreground">
                              {formatHora(v.data_hora)}
                            </span>
                            <div className="min-w-0 flex-1">
                              {v.lead ? (
                                <Link
                                  to="/dashboard/crm"
                                  search={{ lead: v.lead.id }}
                                  className="block truncate text-[0.875rem] font-medium text-foreground after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                                >
                                  {v.lead.nome}
                                </Link>
                              ) : (
                                <span className="block truncate text-[0.875rem] text-muted-foreground">
                                  Lead removido
                                </span>
                              )}
                              <p className="mt-0.5 truncate text-[0.75rem] text-muted-foreground">
                                {eProxima && emBreve(v.data_hora) ? (
                                  <span className="font-semibold text-foreground">
                                    {emBreve(v.data_hora)}
                                  </span>
                                ) : v.aConfirmar ? (
                                  <span className="font-medium text-warning">
                                    Horário a confirmar
                                  </span>
                                ) : v.status === "confirmada" ? (
                                  <span className="text-success">Confirmada</span>
                                ) : (
                                  "Agendada"
                                )}
                              </p>
                            </div>
                            {wa && v.lead ? (
                              <a
                                href={wa}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Abrir conversa com ${v.lead.nome} no WhatsApp`}
                                title="WhatsApp"
                                className="relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-[color,background-color] duration-150 hover:bg-card hover:text-foreground hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <MessageCircle className="h-4 w-4" aria-hidden />
                              </a>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>
          );
        }}
      </QueryState>
    </Bloco>
  );
}
