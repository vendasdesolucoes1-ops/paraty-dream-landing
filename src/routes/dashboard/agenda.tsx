import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
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
import { VisitaFormDialog } from "@/components/agenda/visita-form-dialog";
import { VisitaCard } from "@/components/agenda/visita-card";
import type { VisitaWithRelations } from "@/lib/types";
import { useProfile } from "@/hooks/use-profile";

export const Route = createFileRoute("/dashboard/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Moradas de Paraty" }] }),
  component: AgendaPage,
});

type Periodo = "hoje" | "semana" | "todas";

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

function formatDayHeader(date: Date) {
  const label = date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function AgendaPage() {
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const { profile } = useProfile();
  const isVendedor = profile?.role === "vendedor";

  const { data: visitas, isLoading } = useQuery({
    queryKey: ["visitas", periodo, isVendedor ? profile?.vendedor_id : "all"],
    queryFn: async () => {
      let query = supabase
        .from("visitas")
        .select("*, lead:leads(id, nome, telefone), vendedor:vendedores(id, nome)")
        .order("data_hora", { ascending: true });

      const now = new Date();
      if (periodo === "hoje") {
        query = query
          .gte("data_hora", startOfDay(now).toISOString())
          .lte("data_hora", endOfDay(now).toISOString());
      } else if (periodo === "semana") {
        const end = new Date(now);
        end.setDate(end.getDate() + 7);
        query = query
          .gte("data_hora", startOfDay(now).toISOString())
          .lte("data_hora", endOfDay(end).toISOString());
      }

      if (isVendedor && profile?.vendedor_id) {
        query = query.eq("vendedor_id", profile.vendedor_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as VisitaWithRelations[];
    },
    enabled: !isVendedor || !!profile?.vendedor_id,
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
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Visita
            </Button>
          }
        />
      </div>

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

      {isLoading ? (
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
            <div key={group.date.toISOString()} className="space-y-3">
              <h2 className="font-display text-lg text-primary">{formatDayHeader(group.date)}</h2>
              <div className="space-y-2">
                {group.items.map((visita) => (
                  <VisitaCard key={visita.id} visita={visita} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
