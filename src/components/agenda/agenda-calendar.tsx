import { useMemo, useState, type DragEvent, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { VisitaWithRelations } from "@/lib/types";
import { Pill } from "@/components/ds/pill";
import { atraso } from "@/components/ds/reveal";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { VisitaFormDialog } from "@/components/agenda/visita-form-dialog";
import { VisitaCard } from "@/components/agenda/visita-card";
import { MarcaAgora } from "@/components/agenda/marca-agora";
import { STATUS_DOT, STATUS_EVENTO, STATUS_LABELS } from "@/components/agenda/visita-status";
import {
  DIAS_SEMANA,
  buildMonthGrid,
  buildWeekDays,
  dayKey,
  isSameDay,
  startOfDay,
  startOfWeek,
  timeOf,
} from "@/components/agenda/periodo";
import { formatDataLonga } from "@/lib/format";

const MAX_POR_DIA_MES = 3;

function BarraCarregando() {
  return (
    <span
      aria-hidden
      className="skeleton-shimmer absolute inset-x-0 top-0 z-10 h-0.5 bg-accent/60"
    />
  );
}

function descricaoDia(date: Date, total: number) {
  const dia = date.toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
  if (total === 0) return `${dia}, sem visitas`;
  return `${dia}, ${total} ${total === 1 ? "visita" : "visitas"}`;
}

export function AgendaCalendar({
  mode,
  visitas,
  refDate,
  readOnly = false,
  carregando = false,
}: {
  mode: "mes" | "semana";
  visitas: VisitaWithRelations[];
  refDate: Date;
  readOnly?: boolean;
  /** Enquanto as visitas do período chegam, a grade fica de pé com um brilho no topo. */
  carregando?: boolean;
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
  const agora = today.getTime();
  const selectedDayVisitas = selectedDay ? (visitasByDay.get(dayKey(selectedDay)) ?? []) : [];

  function abrirDia(date: Date) {
    const lista = visitasByDay.get(dayKey(date)) ?? [];
    if (lista.length > 0) setSelectedDay(date);
    else setNewVisitDate(date);
  }

  function dragProps(date: Date) {
    const key = dayKey(date);
    return {
      onDragOver: (e: DragEvent) => {
        if (readOnly) return;
        e.preventDefault();
        setDragOverKey(key);
      },
      onDragLeave: () => setDragOverKey((k) => (k === key ? null : k)),
      onDrop: (e: DragEvent) => handleDrop(date, e),
    };
  }

  /** Visita arrastável: abre o dia ao clicar (ou Enter/Espaço). */
  function evento(visita: VisitaWithRelations, grande = false, idx = 0) {
    const nome = visita.lead?.nome ?? "Lead removido";
    const abrir = () => setSelectedDay(startOfDay(new Date(visita.data_hora)));
    return (
      <div
        key={visita.id}
        role="button"
        tabIndex={0}
        draggable={!readOnly}
        aria-label={`${timeOf(visita.data_hora)}, ${nome}, ${STATUS_LABELS[visita.status]}`}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/visita-id", visita.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={(e) => {
          e.stopPropagation();
          abrir();
        }}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            abrir();
          }
        }}
        title={`${timeOf(visita.data_hora)} · ${nome} · ${STATUS_LABELS[visita.status]}`}
        style={atraso(idx, 35, 280)}
        className={cn(
          "animate-swap min-w-0 border-l-[3px] transition-[transform,box-shadow,filter] duration-150 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
          STATUS_EVENTO[visita.status],
          grande
            ? "rounded-lg px-2 py-1.5 hover:-translate-y-px"
            : "rounded-[0.3125rem] px-1.5 py-[3px] hover:brightness-95",
          !readOnly && "cursor-grab active:cursor-grabbing",
          visita.status === "cancelada" && "opacity-70",
        )}
      >
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span
            className={cn(
              "shrink-0 font-semibold tabular-nums",
              grande ? "text-[0.8125rem]" : "text-[0.6875rem]",
            )}
          >
            {timeOf(visita.data_hora)}
          </span>
          <span
            className={cn(
              "truncate font-medium text-foreground/90",
              grande ? "text-[0.8125rem]" : "text-[0.6875rem]",
              visita.status === "cancelada" && "line-through",
            )}
          >
            {grande ? nome : (visita.lead?.nome?.split(" ")[0] ?? "Lead")}
          </span>
        </div>
        {grande && visita.vendedor?.nome ? (
          <p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">
            {visita.vendedor.nome.split(" ")[0]} · {STATUS_LABELS[visita.status]}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {mode === "mes" ? (
        <div
          key={`${refDate.getFullYear()}-${refDate.getMonth()}`}
          aria-busy={carregando}
          className="animate-swap relative overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]"
        >
          {carregando ? <BarraCarregando /> : null}
          <div className="grid grid-cols-7 border-b border-border bg-muted/50">
            {DIAS_SEMANA.map((wl) => (
              <div
                key={wl}
                className="py-2.5 text-center text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
              >
                <span className="hidden sm:inline">{wl}</span>
                <span className="sm:hidden">{wl[0]}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-border">
            {buildMonthGrid(refDate).map((date) => {
              const inMonth = date.getMonth() === refDate.getMonth();
              const isToday = isSameDay(date, today);
              const dayVisitas = visitasByDay.get(dayKey(date)) ?? [];
              const visible = dayVisitas.slice(0, MAX_POR_DIA_MES);
              const extra = dayVisitas.length - visible.length;
              const key = dayKey(date);
              const arrastando = dragOverKey === key;

              return (
                <div
                  key={date.toISOString()}
                  onClick={() => abrirDia(date)}
                  {...dragProps(date)}
                  className={cn(
                    "group/dia relative flex min-h-[4.75rem] cursor-pointer flex-col gap-1 p-1 transition-colors duration-150 sm:min-h-[7.25rem] sm:p-1.5",
                    inMonth ? "bg-card hover:bg-muted/50" : "bg-muted/40 hover:bg-muted/70",
                    isToday && "bg-accent/10 hover:bg-accent/15",
                    arrastando && "bg-accent/20 ring-2 ring-inset ring-accent/70",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      aria-label={descricaoDia(date, dayVisitas.length)}
                      aria-current={isToday ? "date" : undefined}
                      className={cn(
                        "num inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[0.75rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isToday
                          ? "bg-primary text-primary-foreground"
                          : inMonth
                            ? "text-foreground"
                            : "text-muted-foreground/60",
                      )}
                    >
                      {date.getDate()}
                    </button>
                    {dayVisitas.length === 0 && !readOnly ? (
                      <Plus
                        aria-hidden
                        className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/dia:opacity-100"
                      />
                    ) : null}
                  </div>

                  {/* Celular: sem espaço para texto, só pontos na cor do estado. */}
                  {dayVisitas.length > 0 ? (
                    <div className="flex flex-wrap gap-0.5 px-0.5 sm:hidden" aria-hidden>
                      {dayVisitas.slice(0, 6).map((v) => (
                        <span
                          key={v.id}
                          className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[v.status])}
                        />
                      ))}
                    </div>
                  ) : null}
                  <div className="hidden min-w-0 flex-1 flex-col gap-[3px] overflow-hidden sm:flex">
                    {visible.map((v, k) => evento(v, false, k))}
                    {extra > 0 ? (
                      <p className="px-1 text-[0.6875rem] font-medium text-muted-foreground">
                        +{extra} mais
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          key={dayKey(startOfWeek(refDate))}
          aria-busy={carregando}
          className="animate-swap relative overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]"
        >
          {carregando ? <BarraCarregando /> : null}
          <div className="grid min-w-[52rem] grid-cols-7 divide-x divide-border">
            {buildWeekDays(refDate).map((date, i) => {
              const isToday = isSameDay(date, today);
              const dayVisitas = visitasByDay.get(dayKey(date)) ?? [];
              const key = dayKey(date);
              const arrastando = dragOverKey === key;
              const proximo = isToday
                ? dayVisitas.findIndex((v) => new Date(v.data_hora).getTime() > agora)
                : -1;
              // Hoje: a marca fica antes da primeira visita futura (ou no fim, se todas já passaram).
              const posAgora =
                !isToday || dayVisitas.length === 0
                  ? -1
                  : proximo === -1
                    ? dayVisitas.length
                    : proximo;
              return (
                <div
                  key={date.toISOString()}
                  {...dragProps(date)}
                  style={atraso(i, 50)}
                  className={cn(
                    "animate-swap flex min-h-[26rem] min-w-0 flex-col transition-colors duration-150",
                    isToday && "bg-accent/[0.06]",
                    arrastando && "bg-accent/15",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => abrirDia(date)}
                    aria-label={descricaoDia(date, dayVisitas.length)}
                    aria-current={isToday ? "date" : undefined}
                    className="group/cab flex flex-col items-center gap-1 border-b border-border px-2 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      {DIAS_SEMANA[date.getDay()]}
                    </span>
                    <span
                      className={cn(
                        "num inline-flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-[1.125rem] transition-transform duration-200 group-hover/cab:scale-105",
                        isToday ? "bg-primary text-primary-foreground" : "text-foreground",
                      )}
                    >
                      {date.getDate()}
                    </span>
                    <span className="h-4 text-[0.6875rem] text-muted-foreground">
                      {dayVisitas.length > 0
                        ? `${dayVisitas.length} ${dayVisitas.length === 1 ? "visita" : "visitas"}`
                        : null}
                    </span>
                  </button>
                  <div className="flex flex-1 flex-col gap-1.5 p-2">
                    {dayVisitas.length === 0 ? (
                      <p className="pt-6 text-center text-[0.75rem] text-muted-foreground/70">
                        Livre
                      </p>
                    ) : (
                      <>
                        {dayVisitas.map((v, idx) => (
                          <div key={v.id} className="contents">
                            {idx === posAgora ? <MarcaAgora /> : null}
                            {evento(v, true, idx)}
                          </div>
                        ))}
                        {posAgora === dayVisitas.length ? <MarcaAgora /> : null}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Sheet open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-[31rem]">
          {selectedDay ? (
            <>
              <header className="border-b border-border px-7 pb-5 pr-14 pt-7">
                <p className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <span aria-hidden className="h-px w-5 bg-accent" />
                  Visitas do dia
                </p>
                <SheetTitle className="mt-2.5 font-display text-[1.85rem] font-medium leading-none tracking-[-0.01em]">
                  {formatDataLonga(selectedDay)}
                </SheetTitle>
                <SheetDescription className="mt-2 flex items-center gap-2 text-[0.8125rem]">
                  <Pill tone={selectedDayVisitas.length > 0 ? "accent" : "neutral"}>
                    {selectedDayVisitas.length}{" "}
                    {selectedDayVisitas.length === 1 ? "visita" : "visitas"}
                  </Pill>
                </SheetDescription>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto px-7 py-6">
                {selectedDayVisitas.length === 0 ? (
                  <div className="flex animate-swap flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
                    <CalendarDays className="h-6 w-6 text-muted-foreground" aria-hidden />
                    <p className="text-sm text-muted-foreground">
                      Nenhuma visita agendada para este dia.
                    </p>
                  </div>
                ) : (
                  selectedDayVisitas.map((visita, i) => (
                    <div key={visita.id} className="animate-swap" style={atraso(i, 60)}>
                      <VisitaCard visita={visita} readOnly={readOnly} mostrarData={false} />
                    </div>
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
