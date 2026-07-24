import { useMemo, useState, type DragEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { VisitaWithRelations } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { VisitaFormDialog } from "@/components/agenda/visita-form-dialog";
import { VisitaCard } from "@/components/agenda/visita-card";
import { STATUS_DOT } from "@/components/agenda/visita-status";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayKey(date: Date) {
  return startOfDay(date).toISOString();
}

function isSameDay(a: Date, b: Date) {
  return dayKey(a) === dayKey(b);
}

function startOfWeek(date: Date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function buildMonthGrid(refDate: Date) {
  const monthStart = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const gridStart = startOfWeek(monthStart);
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart);
    date.setDate(date.getDate() + i);
    return date;
  });
}

function buildWeekDays(refDate: Date) {
  const weekStart = startOfWeek(refDate);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    return date;
  });
}

function formatMonthLabel(date: Date) {
  const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatWeekLabel(refDate: Date) {
  const days = buildWeekDays(refDate);
  const first = days[0];
  const last = days[6];
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return `${fmt(first)} – ${fmt(last)}`;
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function AgendaCalendar({
  mode,
  visitas,
  refDate,
  onRefDateChange,
  readOnly = false,
}: {
  mode: "mes" | "semana";
  visitas: VisitaWithRelations[];
  refDate: Date;
  onRefDateChange: (date: Date) => void;
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [newVisitDate, setNewVisitDate] = useState<Date | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const visitasByDay = useMemo(() => {
    const map = new Map<string, VisitaWithRelations[]>();
    for (const visita of visitas) {
      const key = dayKey(new Date(visita.data_hora));
      const list = map.get(key) ?? [];
      list.push(visita);
      map.set(key, list);
    }
    return map;
  }, [visitas]);

  // Drag-and-drop reschedule: keep the time of day, move to the dropped date.
  const moveMutation = useMutation({
    mutationFn: async ({ visita, target }: { visita: VisitaWithRelations; target: Date }) => {
      const original = new Date(visita.data_hora);
      const next = new Date(target);
      next.setHours(original.getHours(), original.getMinutes(), 0, 0);
      const { error } = await supabase
        .from("visitas")
        .update({ data_hora: next.toISOString() })
        .eq("id", visita.id);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      toast.success(
        `Visita remarcada para ${next.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "long",
        })}.`,
      );
      queryClient.invalidateQueries({ queryKey: ["visitas"] });
    },
    onError: () => toast.error("Erro ao remarcar a visita."),
  });

  function handleDrop(target: Date, e: DragEvent) {
    e.preventDefault();
    setDragOverKey(null);
    if (readOnly) return;
    const id = e.dataTransfer.getData("text/visita-id");
    const visita = visitas.find((v) => v.id === id);
    if (!visita) return;
    if (isSameDay(new Date(visita.data_hora), target)) return;
    moveMutation.mutate({ visita, target });
  }

  const today = new Date();
  const selectedDayVisitas = selectedDay ? (visitasByDay.get(dayKey(selectedDay)) ?? []) : [];

  const label = mode === "mes" ? formatMonthLabel(refDate) : formatWeekLabel(refDate);

  function navigate(delta: number) {
    const d = new Date(refDate);
    if (mode === "mes") d.setMonth(d.getMonth() + delta);
    else d.setDate(d.getDate() + delta * 7);
    onRefDateChange(d);
  }

  function dayChip(visita: VisitaWithRelations) {
    return (
      <div
        key={visita.id}
        draggable={!readOnly}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/visita-id", visita.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedDay(startOfDay(new Date(visita.data_hora)));
        }}
        className={cn(
          "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] leading-tight bg-secondary/60 text-foreground/80 transition-colors hover:bg-secondary",
          !readOnly && "cursor-grab active:cursor-grabbing",
          visita.status === "realizada" && "opacity-60",
          visita.status === "cancelada" && "line-through opacity-50",
        )}
      >
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: STATUS_DOT[visita.status] }}
        />
        <span className="tabular-nums">{timeOf(visita.data_hora)}</span>
        <span className="truncate">{visita.lead?.nome?.split(" ")[0] ?? "Lead"}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-xl text-primary">{label}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="transition-colors"
            onClick={() => onRefDateChange(new Date())}
          >
            Hoje
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 transition-transform hover:-translate-x-0.5"
            onClick={() => navigate(-1)}
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 transition-transform hover:translate-x-0.5"
            onClick={() => navigate(1)}
            aria-label="Próximo"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {mode === "mes" ? (
        <div
          key={`${refDate.getFullYear()}-${refDate.getMonth()}`}
          className="border rounded-lg overflow-hidden animate-in fade-in duration-300"
        >
          <div className="grid grid-cols-7 bg-muted/40">
            {WEEKDAY_LABELS.map((wl) => (
              <div key={wl} className="p-2 text-center text-xs font-medium text-muted-foreground">
                <span className="hidden sm:inline">{wl}</span>
                <span className="sm:hidden">{wl[0]}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {buildMonthGrid(refDate).map((date) => {
              const inMonth = date.getMonth() === refDate.getMonth();
              const isToday = isSameDay(date, today);
              const dayVisitas = visitasByDay.get(dayKey(date)) ?? [];
              const visible = dayVisitas.slice(0, 3);
              const extra = dayVisitas.length - visible.length;
              const key = dayKey(date);

              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() =>
                    dayVisitas.length > 0 ? setSelectedDay(date) : setNewVisitDate(date)
                  }
                  onDragOver={(e) => {
                    if (readOnly) return;
                    e.preventDefault();
                    setDragOverKey(key);
                  }}
                  onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                  onDrop={(e) => handleDrop(date, e)}
                  className={cn(
                    "min-h-16 sm:min-h-24 border-t border-l p-1 sm:p-1.5 text-left align-top last:border-r [&:nth-child(7n)]:border-r flex flex-col gap-1 transition-colors",
                    !inMonth && "bg-muted/20 text-muted-foreground/60",
                    isToday && "bg-gold/10 ring-1 ring-inset ring-gold/60",
                    dragOverKey === key && "bg-primary/10 ring-1 ring-inset ring-primary/40",
                  )}
                >
                  <span
                    className={cn(
                      "text-xs font-medium inline-flex h-5 w-5 items-center justify-center rounded-full",
                      isToday && "bg-gold text-forest-deep font-semibold",
                    )}
                  >
                    {date.getDate()}
                  </span>
                  <div className="space-y-0.5 overflow-hidden">
                    {visible.map(dayChip)}
                    {extra > 0 ? (
                      <p className="text-[10px] text-muted-foreground px-1">+{extra} mais</p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          key={dayKey(startOfWeek(refDate))}
          className="border rounded-lg overflow-x-auto animate-in fade-in duration-300"
        >
          <div className="grid grid-cols-7 min-w-[640px]">
            {buildWeekDays(refDate).map((date) => {
              const isToday = isSameDay(date, today);
              const dayVisitas = visitasByDay.get(dayKey(date)) ?? [];
              const key = dayKey(date);
              return (
                <div
                  key={date.toISOString()}
                  onDragOver={(e) => {
                    if (readOnly) return;
                    e.preventDefault();
                    setDragOverKey(key);
                  }}
                  onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                  onDrop={(e) => handleDrop(date, e)}
                  className={cn(
                    "border-l last:border-r min-h-[24rem] flex flex-col transition-colors",
                    dragOverKey === key && "bg-primary/5",
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      dayVisitas.length > 0 ? setSelectedDay(date) : setNewVisitDate(date)
                    }
                    className={cn(
                      "px-2 py-2 text-center border-b transition-colors hover:bg-muted/40",
                      isToday && "bg-gold/10",
                    )}
                  >
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {WEEKDAY_LABELS[date.getDay()]}
                    </p>
                    <p
                      className={cn(
                        "text-sm font-display mx-auto mt-0.5 h-6 w-6 flex items-center justify-center rounded-full",
                        isToday ? "bg-gold text-forest-deep font-semibold" : "text-primary",
                      )}
                    >
                      {date.getDate()}
                    </p>
                  </button>
                  <div className="flex-1 p-1.5 space-y-1">
                    {dayVisitas.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground/60 text-center pt-4">—</p>
                    ) : (
                      dayVisitas.map(dayChip)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Sheet open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md overflow-y-auto animate-in slide-in-from-right duration-300"
        >
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
                  selectedDayVisitas.map((visita) => (
                    <VisitaCard key={visita.id} visita={visita} readOnly={readOnly} />
                  ))
                )}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {readOnly ? null : (
        <VisitaFormDialog
          defaultDate={newVisitDate ?? undefined}
          open={!!newVisitDate}
          onOpenChange={(open) => !open && setNewVisitDate(null)}
        />
      )}
    </div>
  );
}
