import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Pill, type Tone } from "@/components/ds/pill";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { LOTE_STATUS_OPTIONS, type LoteStatus } from "@/lib/types";

/** Disponível = success, reservado = warning, vendido = danger (só tokens). */
export const LOTE_STATUS_TONE: Record<LoteStatus, Tone> = {
  disponivel: "success",
  reservado: "warning",
  vendido: "danger",
};

/** Bolinha do estado, para legendas, resumos e itens de menu. */
export const LOTE_STATUS_DOT: Record<LoteStatus, string> = {
  disponivel: "bg-success",
  reservado: "bg-warning",
  vendido: "bg-danger",
};

/** Barra/preenchimento sólido do estado, para a barra proporcional do resumo. */
export const LOTE_STATUS_BAR: Record<LoteStatus, string> = {
  disponivel: "bg-success",
  reservado: "bg-warning",
  vendido: "bg-danger",
};

export const LOTE_STATUS_LABELS: Record<LoteStatus, string> = {
  disponivel: "Disponível",
  reservado: "Reservado",
  vendido: "Vendido",
};

export function LoteStatusBadge({ status }: { status: LoteStatus }) {
  return (
    <Pill tone={LOTE_STATUS_TONE[status]} dot>
      {LOTE_STATUS_LABELS[status]}
    </Pill>
  );
}

export function LoteStatusEditableBadge({
  loteId,
  status,
}: {
  loteId: string;
  status: LoteStatus;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (newStatus: LoteStatus) => {
      const { error } = await supabase.from("lotes").update({ status: newStatus }).eq("id", loteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lotes"] });
      setOpen(false);
    },
  });

  return (
    <Select
      open={open}
      onOpenChange={setOpen}
      value={status}
      onValueChange={(value) => mutation.mutate(value as LoteStatus)}
    >
      <SelectTrigger
        aria-label={`Status do lote: ${LOTE_STATUS_LABELS[status]}. Alterar`}
        className="group/status h-auto w-auto rounded-full border-0 bg-transparent p-0 shadow-none hover:bg-transparent focus:ring-0 focus-visible:ring-2 focus-visible:ring-ring [&>svg]:hidden"
      >
        {/* div, não span: o SelectTrigger aplica line-clamp aos spans filhos diretos. */}
        <div className="inline-flex">
          <Pill
            tone={LOTE_STATUS_TONE[status]}
            dot
            className={cn(
              "cursor-pointer transition-[filter,opacity] duration-150 group-hover/status:brightness-95 motion-reduce:transition-none",
              mutation.isPending && "opacity-60",
            )}
          >
            {LOTE_STATUS_LABELS[status]}
            <ChevronDown
              aria-hidden
              className="-mr-0.5 h-3 w-3 opacity-0 transition-opacity duration-150 group-hover/status:opacity-70 group-focus-visible/status:opacity-70 group-data-[state=open]/status:opacity-70"
            />
          </Pill>
        </div>
      </SelectTrigger>
      <SelectContent>
        {LOTE_STATUS_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className={cn("h-2 w-2 rounded-full", LOTE_STATUS_DOT[opt.value])}
              />
              {opt.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
