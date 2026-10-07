import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { LOTE_STATUS_OPTIONS, type LoteStatus } from "@/lib/types";

const LOTE_STATUS_STYLES: Record<LoteStatus, string> = {
  disponivel: "border-transparent bg-success-soft text-success hover:bg-success-soft",
  reservado: "border-transparent bg-warning-soft text-warning hover:bg-warning-soft",
  vendido: "border-transparent bg-danger-soft text-danger hover:bg-danger-soft",
};

const LOTE_STATUS_LABELS: Record<LoteStatus, string> = {
  disponivel: "Disponível",
  reservado: "Reservado",
  vendido: "Vendido",
};

export function LoteStatusBadge({ status }: { status: LoteStatus }) {
  return (
    <Badge className={cn("font-medium", LOTE_STATUS_STYLES[status])}>
      {LOTE_STATUS_LABELS[status]}
    </Badge>
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
      <SelectTrigger className="h-auto w-auto border-0 bg-transparent p-0 shadow-none focus:ring-0 [&>svg]:hidden">
        <Badge
          className={cn(
            "font-medium cursor-pointer",
            LOTE_STATUS_STYLES[status],
            mutation.isPending && "opacity-60",
          )}
        >
          {LOTE_STATUS_LABELS[status]}
        </Badge>
      </SelectTrigger>
      <SelectContent>
        {LOTE_STATUS_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
