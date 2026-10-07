import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CalendarRange, List, Plus, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Chip } from "@/components/ds/chip";
import { Reveal, atraso } from "@/components/ds/reveal";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import { Segmentado } from "@/components/visoes/segmentado";
import { VisitaFormDialog } from "@/components/agenda/visita-form-dialog";
import { VisitaCard } from "@/components/agenda/visita-card";
import { AgendaCalendar } from "@/components/agenda/agenda-calendar";
import { NavegadorPeriodo } from "@/components/agenda/navegador-periodo";
import { ResumoVisitas } from "@/components/agenda/resumo-visitas";
import { PageHeader } from "@/components/dashboard/page-header";
import { formatDataLonga, inicioDoDia } from "@/lib/format";
import type { VisitaWithRelations } from "@/lib/types";
import { useProfile } from "@/hooks/use-profile";
import { startOfDay, startOfWeek } from "@/components/agenda/periodo";
import { MarcaAgora } from "@/components/agenda/marca-agora";

const VIEW_STORAGE_KEY = "agenda-view";
type AgendaView = "lista" | "semana" | "mes";
type Periodo = "hoje" | "semana" | "todas";

export const Route = createFileRoute("/dashboard/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Moradas de Paraty" }] }),
  component: AgendaPage,
});

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// Date range fetched for the active view. null bound = unbounded (period "todas").
function computeRange(
  view: AgendaView,
  periodo: Periodo,
  refDate: Date,
): { from: string | null; to: string | null } {
  if (view === "mes") {
    const gridStart = startOfWeek(new Date(refDate.getFullYear(), refDate.getMonth(), 1));
    const gridEnd = new Date(gridStart);
    gridEnd.setDate(gridEnd.getDate() + 41);
    return { from: startOfDay(gridStart).toISOString(), to: endOfDay(gridEnd).toISOString() };
  }
  if (view === "semana") {
    const ws = startOfWeek(refDate);
    const we = new Date(ws);
    we.setDate(we.getDate() + 6);
    return { from: startOfDay(ws).toISOString(), to: endOfDay(we).toISOString() };
  }
  // lista
  const now = new Date();
  if (periodo === "hoje") {
    return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
  }
  if (periodo === "semana") {
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    return { from: startOfDay(now).toISOString(), to: endOfDay(end).toISOString() };
  }
  return { from: null, to: null };
}

function AgendaPage() {
  const { profile } = useProfile();
  const isVendedor = profile?.role === "vendedor";

  const [view, setView] = useState<AgendaView>(() => {
    if (typeof window === "undefined") return "lista";
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === "mes" || stored === "semana" || stored === "lista" ? stored : "lista";
  });
  // Shared period filter — a single state that persists across view switches.
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const [refDate, setRefDate] = useState<Date>(() => new Date());
  // Vendedores see only their own visits by default; this reveals the whole
  // team's schedule (read-only) so they can check general availability.
  const [teamView, setTeamView] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  const scopeToVendedor = isVendedor && !teamView;
  // A vendedor browsing the whole team can look but not edit others' visits.
  const readOnly = isVendedor && teamView;

  const range = useMemo(() => computeRange(view, periodo, refDate), [view, periodo, refDate]);

  const visitasQuery = useQuery({
    queryKey: [
      "visitas",
      view,
      periodo,
      range.from,
      range.to,
      scopeToVendedor ? profile?.vendedor_id : "all",
    ],
    enabled: !scopeToVendedor || !!profile?.vendedor_id,
    queryFn: async () => {
      let query = supabase
        .from("visitas")
        .select("*, lead:leads(id, nome, telefone, is_teste), vendedor:vendedores(id, nome)")
        .order("data_hora", { ascending: true });

      if (range.from) query = query.gte("data_hora", range.from);
      if (range.to) query = query.lte("data_hora", range.to);
      if (scopeToVendedor && profile?.vendedor_id) {
        query = query.eq("vendedor_id", profile.vendedor_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as VisitaWithRelations[];
    },
  });
  const { data: visitas, isLoading } = visitasQuery;

  const groups = useMemo(() => {
    const map = new Map<string, VisitaWithRelations[]>();
    for (const visita of visitas ?? []) {
      const key = startOfDay(new Date(visita.data_hora)).toISOString();
      const list = map.get(key) ?? [];
      list.push(visita);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({ date: new Date(key), items }));
  }, [visitas]);

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-8">
      <Reveal ordem={0}>
        <PageHeader
          eyebrow="Relacionamento"
          title="Agenda"
          description="Visitas agendadas e histórico de atendimentos."
          action={
            <VisitaFormDialog
              trigger={
                <Button>
                  <Plus className="h-4 w-4" aria-hidden />
                  Nova Visita
                </Button>
              }
            />
          }
        />
      </Reveal>

      <Reveal ordem={1} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            {view === "lista" ? (
              <div role="group" aria-label="Período" className="flex flex-wrap items-center gap-2">
                <Chip ativo={periodo === "hoje"} onClick={() => setPeriodo("hoje")}>
                  Hoje
                </Chip>
                <Chip ativo={periodo === "semana"} onClick={() => setPeriodo("semana")}>
                  Esta semana
                </Chip>
                <Chip ativo={periodo === "todas"} onClick={() => setPeriodo("todas")}>
                  Todas
                </Chip>
              </div>
            ) : (
              <NavegadorPeriodo
                modo={view === "mes" ? "mes" : "semana"}
                refDate={refDate}
                onChange={setRefDate}
              />
            )}

            {isVendedor ? (
              <Chip ativo={teamView} onClick={() => setTeamView((v) => !v)}>
                <Users className="h-3.5 w-3.5" aria-hidden />
                {teamView ? "Vendo toda a equipe" : "Ver toda a equipe"}
              </Chip>
            ) : null}
          </div>

          <Segmentado
            rotulo="Visualização da agenda"
            valor={view}
            onChange={setView}
            opcoes={[
              { valor: "lista", rotulo: "Lista", icone: <List aria-hidden /> },
              { valor: "semana", rotulo: "Semana", icone: <CalendarRange aria-hidden /> },
              { valor: "mes", rotulo: "Mês", icone: <CalendarDays aria-hidden /> },
            ]}
          />
        </div>

        {readOnly ? (
          <p className="flex animate-swap items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-[0.8125rem] text-muted-foreground">
            <Users className="h-4 w-4 shrink-0" aria-hidden />
            Visualizando a agenda de toda a equipe (somente leitura).
          </p>
        ) : null}

        <ResumoVisitas visitas={visitas ?? []} />
      </Reveal>

      <Reveal ordem={2}>
        {view !== "lista" ? (
          <AgendaCalendar
            mode={view === "mes" ? "mes" : "semana"}
            visitas={visitas ?? []}
            refDate={refDate}
            readOnly={readOnly}
            carregando={isLoading}
          />
        ) : (
          <QueryState
            query={{
              data: visitas ?? [],
              isPending: isLoading,
              isError: visitasQuery.isError,
              isRefetching: visitasQuery.isRefetching,
              refetch: visitasQuery.refetch,
            }}
            skeleton={<SkeletonRows rows={4} className="h-[4.5rem]" />}
            isEmpty={() => groups.length === 0}
            empty={
              <EmptyState
                icon={CalendarDays}
                title="Nenhuma visita encontrada"
                description="Ajuste o período ou agende uma nova visita."
                action={
                  periodo !== "todas" ? (
                    <Button variant="outline" onClick={() => setPeriodo("todas")}>
                      Ver todas as visitas
                    </Button>
                  ) : undefined
                }
              />
            }
          >
            {() => {
              const agora = new Date();
              const hoje = inicioDoDia(agora).getTime();
              return (
                <div key={periodo} className="animate-swap space-y-9">
                  {groups.map((group) => {
                    const ehHoje = group.date.getTime() === hoje;
                    const ehAmanha = group.date.getTime() === hoje + 86_400_000;
                    const proxima = ehHoje
                      ? group.items.findIndex((v) => new Date(v.data_hora) > agora)
                      : -1;
                    const posAgora = ehHoje ? (proxima === -1 ? group.items.length : proxima) : -1;
                    const titulo = group.date.toISOString();
                    return (
                      <section key={titulo} aria-labelledby={`dia-${titulo}`}>
                        <header className="mb-3 flex items-center justify-between gap-3">
                          <h2
                            id={`dia-${titulo}`}
                            className="flex items-center gap-2.5 font-sans text-[1.0625rem] font-semibold tracking-[-0.014em] text-foreground"
                          >
                            {formatDataLonga(group.date)}
                            {ehHoje ? (
                              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-foreground">
                                Hoje
                              </span>
                            ) : ehAmanha ? (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                Amanhã
                              </span>
                            ) : null}
                          </h2>
                          <span className="text-[0.8125rem] tabular-nums text-muted-foreground">
                            {group.items.length} {group.items.length === 1 ? "visita" : "visitas"}
                          </span>
                        </header>
                        <div className="space-y-2">
                          {group.items.map((visita, i) => (
                            <div
                              key={visita.id}
                              className="animate-swap space-y-2"
                              style={atraso(i, 55)}
                            >
                              {i === posAgora ? <MarcaAgora /> : null}
                              <VisitaCard
                                visita={visita}
                                readOnly={readOnly}
                                mostrarData={false}
                                passou={new Date(visita.data_hora) <= agora}
                              />
                            </div>
                          ))}
                          {posAgora === group.items.length ? <MarcaAgora /> : null}
                        </div>
                      </section>
                    );
                  })}
                </div>
              );
            }}
          </QueryState>
        )}
      </Reveal>
    </div>
  );
}
