import { useQuery } from "@tanstack/react-query";
import { Users, MessageSquare, KanbanSquare, Headset } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function startOfTodayIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function useMetrics() {
  return useQuery({
    queryKey: ["whatsapp-metrics"],
    queryFn: async () => {
      const today = startOfTodayIso();

      const [leadsToday, messagesToday, activeLeads, activeTakeovers] = await Promise.all([
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .gte("created_at", today),
        supabase
          .from("whatsapp_messages")
          .select("id", { count: "exact", head: true })
          .gte("created_at", today),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .not("status_crm", "in", "(fechado,perdido)"),
        supabase
          .from("ai_agent_human_takeover")
          .select("id", { count: "exact", head: true })
          .is("resolved_at", null),
      ]);

      const firstError =
        leadsToday.error ?? messagesToday.error ?? activeLeads.error ?? activeTakeovers.error;
      if (firstError) throw firstError;

      return {
        leadsToday: leadsToday.count ?? 0,
        messagesToday: messagesToday.count ?? 0,
        activeLeads: activeLeads.count ?? 0,
        activeTakeovers: activeTakeovers.count ?? 0,
      };
    },
    refetchInterval: 30_000,
  });
}

const METRIC_CARDS = [
  { key: "leadsToday", label: "Leads hoje", icon: Users },
  { key: "messagesToday", label: "Mensagens hoje", icon: MessageSquare },
  { key: "activeLeads", label: "Leads ativos no CRM", icon: KanbanSquare },
  { key: "activeTakeovers", label: "Atendimentos humanos agora", icon: Headset },
] as const;

export function WhatsappMetrics() {
  const { data, isLoading } = useMetrics();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {METRIC_CARDS.map(({ key, label, icon: Icon }) => (
        <Card key={key} className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-forest-deep/10 text-forest-deep flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              {isLoading ? (
                <Skeleton className="h-7 w-10 mb-1" />
              ) : (
                <p className="text-2xl font-semibold leading-tight">{data?.[key] ?? 0}</p>
              )}
              <p className="text-xs text-muted-foreground truncate">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
