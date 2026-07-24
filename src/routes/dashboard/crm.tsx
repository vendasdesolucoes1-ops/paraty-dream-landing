import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { LEAD_STATUS_COLUMNS, type Lead, type LeadStatus } from "@/lib/types";
import { LeadCard } from "@/components/dashboard/lead-card";
import { LeadFormDialog } from "@/components/dashboard/lead-form-dialog";
import { LeadDetailDrawer } from "@/components/dashboard/lead-detail-drawer";
import { VisitaFormDialog } from "@/components/agenda/visita-form-dialog";
import { useProfile } from "@/hooks/use-profile";

export const Route = createFileRoute("/dashboard/crm")({
  head: () => ({ meta: [{ title: "CRM — Moradas de Paraty" }] }),
  component: CrmPage,
});

const STATUS_LABEL_MAP = Object.fromEntries(LEAD_STATUS_COLUMNS.map((c) => [c.value, c.label]));

function KanbanColumn({
  column,
  children,
}: {
  column: { value: string; label: string };
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.value });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "space-y-3 min-h-24 rounded-lg bg-muted/40 p-2 transition-colors",
        isOver ? "bg-primary/10 ring-2 ring-primary/30" : "",
      )}
    >
      {children}
    </div>
  );
}

function CrmPage() {
  const queryClient = useQueryClient();
  const { profile } = useProfile();
  const isVendedor = profile?.role === "vendedor";

  const leadsQueryKey = ["leads", isVendedor ? profile?.vendedor_id : "all"];

  const {
    data: leads,
    isLoading,
    isError,
  } = useQuery({
    queryKey: leadsQueryKey,
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("*")
        .is("deletado_em", null)
        .order("created_at", { ascending: false });
      if (isVendedor && profile?.vendedor_id) {
        query = query.eq("vendedor_id", profile.vendedor_id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as Lead[];
    },
    enabled: !isVendedor || !!profile?.vendedor_id,
  });

  useEffect(() => {
    const channel = supabase
      .channel("leads-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        queryClient.invalidateQueries({ queryKey: ["leads"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: activeTakeoverPhones } = useQuery({
    queryKey: ["active-takeover-phones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agent_human_takeover")
        .select("conversation_id, ai_agent_conversations(session_id)")
        .is("resolved_at", null);
      if (error) throw error;
      const phones = (data ?? []).flatMap((row) => {
        const conversations = row.ai_agent_conversations as
          { session_id: string } | { session_id: string }[] | null;
        if (!conversations) return [];
        return Array.isArray(conversations)
          ? conversations.map((c) => c.session_id)
          : [conversations.session_id];
      });
      return new Set(phones);
    },
  });

  const columns = useMemo(() => {
    const grouped = new Map<string, Lead[]>();
    for (const column of LEAD_STATUS_COLUMNS) grouped.set(column.value, []);
    for (const lead of leads ?? []) {
      grouped.get(lead.status_crm)?.push(lead);
    }
    return grouped;
  }, [leads]);

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const selectedLead = useMemo(
    () => leads?.find((lead) => lead.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  );

  // Lead being routed through the "Agendado" flow: dragged onto that column,
  // but status_crm only flips once VisitaFormDialog's own mutation succeeds.
  const [pendingAgendamentoLead, setPendingAgendamentoLead] = useState<Lead | null>(null);
  const agendamentoSavedRef = useRef(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function canDrag(lead: Lead) {
    if (!profile) return false;
    if (profile.role === "admin" || profile.role === "gestor") return true;
    return lead.vendedor_id === profile.vendedor_id;
  }

  async function logStatusChange(lead: Lead, newStatus: LeadStatus) {
    await supabase.from("interacoes").insert({
      lead_id: lead.id,
      tipo: "sistema",
      canal: "crm_kanban",
      conteudo: `Status alterado manualmente para ${STATUS_LABEL_MAP[newStatus] ?? newStatus} por ${profile?.nome ?? "usuário"}`,
    });
  }

  function moveLeadOptimistically(leadId: string, newStatus: LeadStatus) {
    queryClient.setQueryData<Lead[]>(leadsQueryKey, (old) =>
      old?.map((l) => (l.id === leadId ? { ...l, status_crm: newStatus } : l)),
    );
  }

  function revertLead(leadId: string, originalStatus: LeadStatus) {
    queryClient.setQueryData<Lead[]>(leadsQueryKey, (old) =>
      old?.map((l) => (l.id === leadId ? { ...l, status_crm: originalStatus } : l)),
    );
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const lead = active.data.current?.lead as Lead | undefined;
    if (!lead) return;

    const newStatus = over.id as LeadStatus;
    const originalStatus = lead.status_crm;
    if (newStatus === originalStatus) return;

    if (!canDrag(lead)) {
      toast.error("Você não tem permissão para mover este lead.");
      return;
    }

    if (newStatus === "agendado") {
      // Optimistic move; only persisted once the visita is actually saved.
      moveLeadOptimistically(lead.id, newStatus);
      agendamentoSavedRef.current = false;
      setPendingAgendamentoLead(lead);
      return;
    }

    moveLeadOptimistically(lead.id, newStatus);

    try {
      if (newStatus === "qualificado" && !lead.vendedor_id) {
        const { data: nextVendedorId, error: rrError } = await supabase.rpc(
          "get_next_round_robin_salesperson",
        );
        if (rrError) throw rrError;
        const { error } = await supabase
          .from("leads")
          .update({ status_crm: newStatus, vendedor_id: nextVendedorId })
          .eq("id", lead.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("leads")
          .update({ status_crm: newStatus })
          .eq("id", lead.id);
        if (error) throw error;
      }

      await logStatusChange(lead, newStatus);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    } catch {
      revertLead(lead.id, originalStatus);
      toast.error("Erro ao atualizar o status do lead.");
    }
  }

  function handleAgendamentoDialogChange(open: boolean) {
    if (!open) {
      if (pendingAgendamentoLead && !agendamentoSavedRef.current) {
        // Dialog closed without saving — revert the optimistic move.
        revertLead(pendingAgendamentoLead.id, pendingAgendamentoLead.status_crm);
      }
      setPendingAgendamentoLead(null);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    }
  }

  async function handleAgendamentoSaved() {
    agendamentoSavedRef.current = true;
    if (pendingAgendamentoLead) {
      await logStatusChange(pendingAgendamentoLead, "agendado");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow text-muted-foreground">Relacionamento</p>
          <h1 className="text-3xl font-display text-primary">CRM</h1>
        </div>
        <LeadFormDialog />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando leads...</p>
      ) : isError ? (
        <p className="text-destructive">Erro ao carregar os leads.</p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {LEAD_STATUS_COLUMNS.map((column) => {
              const columnLeads = columns.get(column.value) ?? [];
              return (
                <div key={column.value} className="w-72 shrink-0 space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-sm font-medium text-foreground">{column.label}</h2>
                    <span className="text-xs text-muted-foreground">{columnLeads.length}</span>
                  </div>
                  <KanbanColumn column={column}>
                    {columnLeads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        draggable={canDrag(lead)}
                        hasHumanTakeover={
                          !!lead.telefone && activeTakeoverPhones?.has(lead.telefone)
                        }
                        onClick={() => setSelectedLeadId(lead.id)}
                      />
                    ))}
                    {columnLeads.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">Sem leads</p>
                    ) : null}
                  </KanbanColumn>
                </div>
              );
            })}
          </div>
        </DndContext>
      )}

      <LeadDetailDrawer
        lead={selectedLead}
        open={!!selectedLeadId}
        onOpenChange={(open) => {
          if (!open) setSelectedLeadId(null);
        }}
      />

      {pendingAgendamentoLead ? (
        <VisitaFormDialog
          defaultLead={{
            id: pendingAgendamentoLead.id,
            nome: pendingAgendamentoLead.nome,
            telefone: pendingAgendamentoLead.telefone,
          }}
          open={!!pendingAgendamentoLead}
          onOpenChange={handleAgendamentoDialogChange}
          onSaved={handleAgendamentoSaved}
        />
      ) : null}
    </div>
  );
}
