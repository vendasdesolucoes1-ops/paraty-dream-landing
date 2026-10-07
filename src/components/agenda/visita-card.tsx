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
import { Avatar } from "@/components/ds/avatar";
import { Pill } from "@/components/ds/pill";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VisitaFormDialog } from "@/components/agenda/visita-form-dialog";
import { STATUS_BARRA, STATUS_LABELS, STATUS_TONE } from "@/components/agenda/visita-status";
import { formatDiaCurto, formatDiaSemana, formatHora } from "@/lib/format";

// leads.status_crm has no dedicated value for "no-show", so that transition
// leaves the lead as "agendado" (awaiting a new visit) rather than losing it.
const STATUS_CRM_MAP: Record<Exclude<VisitaStatus, "cancelada">, string> = {
  agendada: "agendado",
  confirmada: "agendado",
  realizada: "visitou",
  no_show: "agendado",
};

/**
 * Visita em formato de cartão: filete na cor do estado, horário em destaque,
 * lead, vendedor e as ações (WhatsApp, confirmar, remarcar…). Usado na lista
 * da agenda, na gaveta do dia e na ficha do lead no CRM.
 */
export function VisitaCard({
  visita,
  readOnly = false,
  mostrarData = true,
  passou = false,
}: {
  visita: VisitaWithRelations;
  readOnly?: boolean;
  /** Mostra "qui 09/10" sob o horário; na lista agrupada por dia fica redundante. */
  mostrarData?: boolean;
  /** Esmaece a visita que já passou (a lista da agenda decide pela marca "agora"). */
  passou?: boolean;
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

  const whatsappLink = visita.lead?.telefone
    ? `https://wa.me/${visita.lead.telefone.replace(/\D/g, "")}`
    : null;
  const encerrada = visita.status === "realizada" || visita.status === "cancelada";
  const nome = visita.lead?.nome ?? "Lead removido";

  return (
    <div
      className={cn(
        "group/visita relative flex items-center gap-4 overflow-hidden rounded-xl border border-border bg-card py-3.5 pl-6 pr-3 shadow-[var(--shadow-card)] transition-[border-color,box-shadow,opacity] duration-200 hover:border-foreground/20 hover:shadow-[var(--shadow-pop)] motion-reduce:transition-none",
        (passou || encerrada) && "opacity-80 hover:opacity-100",
      )}
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-1.5", STATUS_BARRA[visita.status])}
      />

      <div className="w-14 shrink-0">
        <p className="num text-[1.375rem] leading-none text-foreground">
          {formatHora(visita.data_hora)}
        </p>
        {mostrarData ? (
          <p className="mt-1.5 text-[0.7rem] capitalize tabular-nums leading-none text-muted-foreground">
            {formatDiaSemana(visita.data_hora)} {formatDiaCurto(visita.data_hora)}
          </p>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 leading-tight">
          <span
            className={cn(
              "truncate text-[0.9375rem] font-semibold text-foreground",
              visita.status === "cancelada" && "text-muted-foreground line-through",
              !visita.lead && "font-medium text-muted-foreground",
            )}
          >
            {nome}
          </span>
          {visita.lead?.is_teste ? (
            <span
              className="shrink-0"
              title="Visita de um lead gerado pelo painel Testar Agente — não é um cliente real."
            >
              <Pill tone="warning" className="text-[0.65rem] uppercase tracking-wide">
                Teste
              </Pill>
            </span>
          ) : null}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-muted-foreground">
          {visita.lead?.telefone ? <span className="tabular-nums">{visita.lead.telefone}</span> : null}
          {visita.vendedor?.nome ? (
            <span className="inline-flex items-center gap-1.5">
              <Avatar nome={visita.vendedor.nome} size="sm" className="h-5 w-5 text-[0.55rem]" />
              {visita.vendedor.nome}
            </span>
          ) : null}
        </div>
        <div className="mt-2 sm:hidden">
          <Pill tone={STATUS_TONE[visita.status]} dot>
            {STATUS_LABELS[visita.status]}
          </Pill>
        </div>
        {visita.observacoes ? (
          <p
            className="mt-1.5 line-clamp-1 text-[0.75rem] text-muted-foreground/90"
            title={visita.observacoes}
          >
            {visita.observacoes}
          </p>
        ) : null}
      </div>

      <Pill tone={STATUS_TONE[visita.status]} dot className="hidden shrink-0 sm:inline-flex">
        {STATUS_LABELS[visita.status]}
      </Pill>

      <div className="flex shrink-0 items-center">
        {whatsappLink ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground"
            asChild
          >
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              title="WhatsApp"
              aria-label={`Abrir conversa com ${nome} no WhatsApp`}
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
            </a>
          </Button>
        ) : null}

        {readOnly ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Ações da visita de ${nome}`}
              >
                <MoreVertical className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => statusMutation.mutate("confirmada")}>
                <UserCheck className="h-4 w-4 mr-2" aria-hidden />
                Confirmar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRescheduleOpen(true)}>
                <CalendarClock className="h-4 w-4 mr-2" aria-hidden />
                Remarcar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => statusMutation.mutate("realizada")}>
                <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden />
                Marcar Realizada
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => statusMutation.mutate("no_show")}>
                <UserX className="h-4 w-4 mr-2" aria-hidden />
                No-show
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => statusMutation.mutate("cancelada")}
                className="text-danger focus:text-danger"
              >
                <XCircle className="h-4 w-4 mr-2" aria-hidden />
                Cancelar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {readOnly ? null : (
        <VisitaFormDialog visita={visita} open={rescheduleOpen} onOpenChange={setRescheduleOpen} />
      )}
    </div>
  );
}
