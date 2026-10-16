import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ds/chip";
import {
  PRESETS_PERIODO,
  formatPeriodo,
  periodoDoPreset,
  type Periodo,
  type PresetPeriodo,
} from "@/lib/relatorios";

/**
 * Filtro de período da tela de Relatórios: atalhos em pílula e, para qualquer
 * outro intervalo, as duas datas. Mexer numa data solta o atalho.
 */
export function FiltroPeriodo({
  periodo,
  preset,
  onChange,
}: {
  periodo: Periodo;
  preset: PresetPeriodo | null;
  onChange: (periodo: Periodo, preset: PresetPeriodo | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Atalhos de período">
        {PRESETS_PERIODO.map((p) => (
          <Chip
            key={p.value}
            ativo={preset === p.value}
            onClick={() => onChange(periodoDoPreset(p.value), p.value)}
          >
            {p.label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted-foreground">
        <label className="sr-only" htmlFor="periodo-inicio">
          Data inicial
        </label>
        <Input
          id="periodo-inicio"
          type="date"
          className="h-8 w-[9.5rem]"
          value={periodo.inicio}
          max={periodo.fim}
          onChange={(e) => e.target.value && onChange({ ...periodo, inicio: e.target.value }, null)}
        />
        <span aria-hidden>até</span>
        <label className="sr-only" htmlFor="periodo-fim">
          Data final
        </label>
        <Input
          id="periodo-fim"
          type="date"
          className="h-8 w-[9.5rem]"
          value={periodo.fim}
          min={periodo.inicio}
          onChange={(e) => e.target.value && onChange({ ...periodo, fim: e.target.value }, null)}
        />
        <span className="sr-only" aria-live="polite">
          Período: {formatPeriodo(periodo.inicio, periodo.fim)}
        </span>
      </div>
    </div>
  );
}
