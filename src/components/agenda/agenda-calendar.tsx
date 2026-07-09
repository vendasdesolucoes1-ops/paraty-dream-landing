import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { VisitaWithRelations } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { VisitaFormDialog } from "@/components/agenda/visita-form-dialog";
import { VisitaCard } from "@/components/agenda/visita-card";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

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

function dayKey(date: Date) {
  return startOfDay(date).toISOString();
}

function isSameDay(a: Date, b: Date) {
  return dayKey(a) === dayKey(b);
}

function buildMonthGrid(monthStart: Date) {
  const firstWeekday = monthStart.getDay();
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - firstWeekday);

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart);
    date.setDate(date.getDate() + i);
    return date;
  });
}

function formatMonthLabel(date: Date) {
  const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function AgendaCalendar({
  isVendedor,
  vendedorId,
}: {
  isVendedor: boolean;
  vendedorId: string | null;
}) {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [newVisitDate, setNewVisitDate] = useState<Date | null>(null);

  const gridDays = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const rangeStart = gridDays[0];
  const rangeEnd = gridDays[gridDays.length - 1];

  const { data: visitas, isLoading } = useQuery({
    queryKey: ["visitas", "calendar", visibleMonth.toISOString(), isVendedor ? vendedorId : "all"],
    queryFn: async () => {
      let query = supabase
        .from("visitas")
        .select("*, lead:leads(id, nome, telefone), vendedor:vendedores(id, nome)")
        .gte("data_hora", startOfDay(rangeStart).toISOString())
        .lte("data_hora", endOfDay(rangeEnd).toISOString())
        .order("data_hora", { ascending: true });

      if (isVendedor && vendedorId) {
        query = query.eq("vendedor_id", vendedorId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as VisitaWithRelations[];
    },
    enabled: !isVendedor || !!vendedorId,
  });

  const visitasByDay = useMemo(() => {
    const map = new Map<string, VisitaWithRelations[]>();
    for (const visita of visitas ?? []) {
      const key = dayKey(new Date(visita.data_hora));
      const list = map.get(key) ?? [];
      list.push(visita);
      map.set(key, list);
    }
    return map;
  }, [visitas]);

  const today = new Date();
  const selectedDayVisitas = selectedDay ? (visitasByDay.get(dayKey(selectedDay)) ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-xl text-primary">{formatMonthLabel(visibleMonth)}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVisibleMonth(startOfMonth(new Date()))}
          >
            Hoje
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-[32rem] w-full" />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 bg-muted/40">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="p-2 text-center text-xs font-medium text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {gridDays.map((date) => {
              const inMonth = date.getMonth() === visibleMonth.getMonth();
              const isToday = isSameDay(date, today);
              const dayVisitas = visitasByDay.get(dayKey(date)) ?? [];
              const visible = dayVisitas.slice(0, 3);
              const extra = dayVisitas.length - visible.length;

              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() =>
                    dayVisitas.length > 0 ? setSelectedDay(date) : setNewVisitDate(date)
                  }
                  className={cn(
                    "min-h-24 border-t border-l p-1.5 text-left align-top last:border-r [&:nth-child(7n)]:border-r flex flex-col gap-1",
                    !inMonth && "bg-muted/20 text-muted-foreground/60",
                    isToday && "bg-sand-light",
                  )}
                >
                  <span
                    className={cn("text-xs font-medium", isToday && "text-primary font-semibold")}
                  >
                    {date.getDate()}
                  </span>
                  <div className="space-y-0.5">
                    {visible.map((visita) => {
                      const isRealizada = visita.status === "realizada";
                      const firstName = visita.lead?.nome?.split(" ")[0] ?? "Lead";
                      const horario = new Date(visita.data_hora).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      return (
                        <div
                          key={visita.id}
                          className={cn(
                            "truncate rounded px-1 py-0.5 text-[10px] leading-tight",
                            isRealizada
                              ? "bg-muted text-muted-foreground opacity-60"
                              : "bg-primary/10 text-primary",
                          )}
                        >
                          {isRealizada ? "✓ " : ""}
                          {horario} {firstName}
                        </div>
                      );
                    })}
                    {extra > 0 ? (
                      <p className="text-[10px] text-muted-foreground px-1">+{extra} mais</p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Sheet open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selectedDay ? (
            <>
              <SheetHeader>
                <SheetTitle className="font-display text-xl text-primary">
                  {selectedDay.toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                  })}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-4 space-y-3">
                {selectedDayVisitas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma visita agendada para este dia.
                  </p>
                ) : (
                  selectedDayVisitas.map((visita) => <VisitaCard key={visita.id} visita={visita} />)
                )}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <VisitaFormDialog
        defaultDate={newVisitDate ?? undefined}
        open={!!newVisitDate}
        onOpenChange={(open) => !open && setNewVisitDate(null)}
      />
    </div>
  );
}
