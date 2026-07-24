import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CalendarRange, List, Plus, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { VisitaFormDialog } from "@/components/agenda/visita-form-dialog";
import { VisitaCard } from "@/components/agenda/visita-card";
import { AgendaCalendar } from "@/components/agenda/agenda-calendar";
import type { VisitaWithRelations } from "@/lib/types";
import { useProfile } from "@/hooks/use-profile";

const VIEW_STORAGE_KEY = "agenda-view";
type AgendaView = "lista" | "semana" | "mes";
type Periodo = "hoje" | "semana" | "todas";

export const Route = createFileRoute("/dashboard/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Moradas de Paraty" }] }),
  component: AgendaPage,
});

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfWeek(date: Date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function formatDayHeader(date: Date) {
  const label = date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
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

  const { data: visitas, isLoading } = useQuery({
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
        .select("*, lead:leads(id, nome, telefone), vendedor:vendedores(id, nome)")
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display text-primary">Agenda</h1>
          <p className="text-muted-foreground">Visitas agendadas e histórico de atendimentos.</p>
        </div>
        <VisitaFormDialog
          trigger={
            <Button className="transition-transform duration-200 hover:scale-[1.02]">
              <Plus className="h-4 w-4 mr-2" />
              Nova Visita
            </Button>
          }
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {view === "lista" ? (
            <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="semana">Esta Semana</SelectItem>
                <SelectItem value="todas">Todas</SelectItem>
              </SelectContent>
            </Select>
          ) : null}

          {isVendedor ? (
            <Button
              variant={teamView ? "default" : "outline"}
              size="sm"
              onClick={() => setTeamView((v) => !v)}
              className="transition-colors"
            >
              <Users className="h-4 w-4 mr-2" />
              {teamView ? "Vendo toda a equipe" : "Ver toda a equipe"}
            </Button>
          ) : null}
        </div>

        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as AgendaView)}
        >
          <ToggleGroupItem value="lista" aria-label="Lista">
            <List className="h-4 w-4 mr-2" />
            Lista
          </ToggleGroupItem>
          <ToggleGroupItem value="semana" aria-label="Semana">
            <CalendarRange className="h-4 w-4 mr-2" />
            Semana
          </ToggleGroupItem>
          <ToggleGroupItem value="mes" aria-label="Mês">
            <CalendarDays className="h-4 w-4 mr-2" />
            Mês
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {readOnly ? (
        <p className="text-xs text-muted-foreground -mt-2">
          Visualizando a agenda de toda a equipe (somente leitura).
        </p>
      ) : null}

      {view !== "lista" ? (
        <AgendaCalendar
          mode={view === "mes" ? "mes" : "semana"}
          visitas={visitas ?? []}
          refDate={refDate}
          onRefDateChange={setRefDate}
          readOnly={readOnly}
        />
      ) : isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            Nenhuma visita encontrada para o período selecionado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <div
              key={group.date.toISOString()}
              className={cn("space-y-3 animate-in fade-in duration-300")}
            >
              <h2 className="font-display text-lg text-primary">{formatDayHeader(group.date)}</h2>
              <div className="space-y-2">
                {group.items.map((visita) => (
                  <VisitaCard key={visita.id} visita={visita} readOnly={readOnly} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
