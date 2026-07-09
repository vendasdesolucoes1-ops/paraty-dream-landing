import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { LEAD_STATUS_COLUMNS, type Lead } from "@/lib/types";
import { LeadCard } from "@/components/dashboard/lead-card";
import { LeadFormDialog } from "@/components/dashboard/lead-form-dialog";
import { useProfile } from "@/hooks/use-profile";

export const Route = createFileRoute("/dashboard/crm")({
  head: () => ({ meta: [{ title: "CRM — Moradas de Paraty" }] }),
  component: CrmPage,
});

function CrmPage() {
  const queryClient = useQueryClient();
  const { profile } = useProfile();
  const isVendedor = profile?.role === "vendedor";

  const {
    data: leads,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["leads", isVendedor ? profile?.vendedor_id : "all"],
    queryFn: async () => {
      let query = supabase.from("leads").select("*").order("created_at", { ascending: false });
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
          | { session_id: string }
          | { session_id: string }[]
          | null;
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
        <div className="flex gap-4 overflow-x-auto pb-4">
          {LEAD_STATUS_COLUMNS.map((column) => {
            const columnLeads = columns.get(column.value) ?? [];
            return (
              <div key={column.value} className="w-72 shrink-0 space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-medium text-foreground">{column.label}</h2>
                  <span className="text-xs text-muted-foreground">{columnLeads.length}</span>
                </div>
                <div className="space-y-3 min-h-24 rounded-lg bg-muted/40 p-2">
                  {columnLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      hasHumanTakeover={!!lead.telefone && activeTakeoverPhones?.has(lead.telefone)}
                    />
                  ))}
                  {columnLeads.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">Sem leads</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
