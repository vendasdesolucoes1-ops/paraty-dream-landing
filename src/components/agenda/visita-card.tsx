import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Clock,
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
import {
  STATUS_LABELS,
  STATUS_STYLES,
  vendorColor,
  vendorInitials,
} from "@/components/agenda/visita-status";

// leads.status_crm has no dedicated value for "no-show", so that transition
// leaves the lead as "agendado" (awaiting a new visit) rather than losing it.
const STATUS_CRM_MAP: Record<Exclude<VisitaStatus, "cancelada">, string> = {
  agendada: "agendado",
  confirmada: "agendado",
  realizada: "visitou",
  no_show: "agendado",
};

export function VisitaCard({
  visita,
  readOnly = false,
}: {
  visita: VisitaWithRelations;
  readOnly?: boolean;
}) {
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

  const accent = vendorColor(visita.vendedor_id);

  return (
    <Card
      className="shadow-sm overflow-hidden border-l-4 transition-all duration-200 ease-in-out hover:shadow-md hover:-translate-y-0.5"
      style={{ borderLeftColor: accent }}
    >
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-14 shrink-0 text-center">
          <p className="text-lg font-display text-primary leading-none">{horario}</p>
          <Clock className="h-3 w-3 mx-auto mt-1 text-muted-foreground/70" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium truncate leading-tight">
            {visita.lead?.nome ?? "Lead removido"}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
            {visita.lead?.telefone ? <span>{visita.lead.telefone}</span> : null}
            {visita.vendedor?.nome ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-semibold text-white"
                  style={{ backgroundColor: accent }}
                  title={visita.vendedor.nome}
                >
                  {vendorInitials(visita.vendedor.nome)}
                </span>
                {visita.vendedor.nome}
              </span>
            ) : null}
          </div>
        </div>

        <Badge className={cn("font-normal shrink-0 border-0", STATUS_STYLES[visita.status])}>
          {STATUS_LABELS[visita.status]}
        </Badge>

        {whatsappLink ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 transition-transform duration-200 hover:scale-110"
            asChild
          >
            <a href={whatsappLink} target="_blank" rel="noreferrer" title="WhatsApp">
              <MessageCircle className="h-4 w-4" />
            </a>
          </Button>
        ) : null}

        {readOnly ? null : (
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
        )}
      </CardContent>

      {readOnly ? null : (
        <VisitaFormDialog visita={visita} open={rescheduleOpen} onOpenChange={setRescheduleOpen} />
      )}
    </Card>
  );
}
