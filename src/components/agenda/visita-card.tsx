import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  MessageCircle,
  MoreVertical,
  CheckCircle2,
  CalendarClock,
  UserCheck,
  UserX,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { VisitaStatus, VisitaWithRelations } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VisitaFormDialog } from "@/components/agenda/visita-form-dialog";

const STATUS_STYLES: Record<VisitaStatus, string> = {
  agendada: "bg-sky-100 text-sky-800 hover:bg-sky-100",
  confirmada: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  realizada: "bg-muted text-muted-foreground",
  cancelada: "bg-red-100 text-red-800 hover:bg-red-100",
  no_show: "bg-orange-100 text-orange-800 hover:bg-orange-100",
};

const STATUS_LABELS: Record<VisitaStatus, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  no_show: "No-show",
};

// leads.status_crm has no dedicated value for "no-show", so that transition
// leaves the lead as "agendado" (awaiting a new visit) rather than losing it.
const STATUS_CRM_MAP: Record<Exclude<VisitaStatus, "cancelada">, string> = {
  agendada: "agendado",
  confirmada: "agendado",
  realizada: "visitou",
  no_show: "agendado",
};

export function VisitaCard({ visita }: { visita: VisitaWithRelations }) {
  const queryClient = useQueryClient();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const statusMutation = useMutation({
    mutationFn: async (newStatus: VisitaStatus) => {
      const { error } = await supabase
        .from("visitas")
        .update({ status: newStatus })
        .eq("id", visita.id);
      if (error) throw error;

      if (newStatus !== "cancelada") {
        await supabase
          .from("leads")
          .update({ status_crm: STATUS_CRM_MAP[newStatus] })
          .eq("id", visita.lead_id);
      }
    },
    onSuccess: () => {
      toast.success("Status da visita atualizado.");
      queryClient.invalidateQueries({ queryKey: ["visitas"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: () => toast.error("Erro ao atualizar o status da visita."),
  });

  const horario = new Date(visita.data_hora).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const whatsappLink = visita.lead?.telefone
    ? `https://wa.me/${visita.lead.telefone.replace(/\D/g, "")}`
    : null;

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 flex items-center gap-4">
        <div className="w-14 shrink-0 text-center">
          <p className="text-lg font-display text-primary leading-none">{horario}</p>
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{visita.lead?.nome ?? "Lead removido"}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-0.5">
            {visita.lead?.telefone ? <span>{visita.lead.telefone}</span> : null}
            {visita.vendedor?.nome ? <span>Vendedor: {visita.vendedor.nome}</span> : null}
          </div>
        </div>

        <Badge className={cn("font-normal shrink-0", STATUS_STYLES[visita.status])}>
          {STATUS_LABELS[visita.status]}
        </Badge>

        {whatsappLink ? (
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
            <a href={whatsappLink} target="_blank" rel="noreferrer" title="WhatsApp">
              <MessageCircle className="h-4 w-4" />
            </a>
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => statusMutation.mutate("confirmada")}>
              <UserCheck className="h-4 w-4 mr-2" />
              Confirmar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setRescheduleOpen(true)}>
              <CalendarClock className="h-4 w-4 mr-2" />
              Remarcar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => statusMutation.mutate("realizada")}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Marcar Realizada
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => statusMutation.mutate("no_show")}>
              <UserX className="h-4 w-4 mr-2" />
              No-show
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => statusMutation.mutate("cancelada")}
              className="text-destructive focus:text-destructive"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancelar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardContent>

      <VisitaFormDialog visita={visita} open={rescheduleOpen} onOpenChange={setRescheduleOpen} />
    </Card>
  );
}
