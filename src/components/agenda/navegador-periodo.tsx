import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMonthLabel, formatWeekLabel } from "@/components/agenda/periodo";

/**
 * Navegação do calendário: título do período, setas e "Hoje". O título troca
 * com um fade a cada mudança (a `key` refaz o elemento) e é anunciado a
 * leitores de tela por `aria-live`.
 */
export function NavegadorPeriodo({
  modo,
  refDate,
  onChange,
}: {
  modo: "mes" | "semana";
  refDate: Date;
  onChange: (date: Date) => void;
}) {
  const label = modo === "mes" ? formatMonthLabel(refDate) : formatWeekLabel(refDate);

  function navegar(delta: number) {
    const d = new Date(refDate);
    if (modo === "mes") d.setMonth(d.getMonth() + delta);
    else d.setDate(d.getDate() + delta * 7);
    onChange(d);
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => navegar(-1)}
          aria-label={modo === "mes" ? "Mês anterior" : "Semana anterior"}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => navegar(1)}
          aria-label={modo === "mes" ? "Próximo mês" : "Próxima semana"}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
        <Button variant="outline" className="ml-1" onClick={() => onChange(new Date())}>
          Hoje
        </Button>
      </div>
      <h2
        key={label}
        aria-live="polite"
        className="animate-swap font-sans text-[1.25rem] font-semibold leading-none tracking-[-0.02em] text-foreground"
      >
        {label}
      </h2>
    </div>
  );
}
