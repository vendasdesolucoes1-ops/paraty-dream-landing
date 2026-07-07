import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { LOTE_STATUS_OPTIONS, type LoteStatus } from "@/lib/types";

const LOTE_STATUS_STYLES: Record<LoteStatus, string> = {
  disponivel: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  reservado: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  vendido: "bg-red-100 text-red-800 hover:bg-red-100",
};

const LOTE_STATUS_LABELS: Record<LoteStatus, string> = {
  disponivel: "Disponível",
  reservado: "Reservado",
  vendido: "Vendido",
};

export function LoteStatusBadge({ status }: { status: LoteStatus }) {
  return (
    <Badge className={cn("font-normal", LOTE_STATUS_STYLES[status])}>
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
            "font-normal cursor-pointer",
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
