import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { WhatsappInstance } from "@/lib/types";
import { WhatsappStatusCard } from "@/components/dashboard/whatsapp-status-card";
import { WhatsappMetrics } from "@/components/dashboard/whatsapp-metrics";
import { AiAgentCard } from "@/components/dashboard/ai-agent-card";
import { WhatsappCreateInstanceCard } from "@/components/dashboard/whatsapp-instance-settings";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/dashboard/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Moradas de Paraty" }] }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const { data: instance, isLoading } = useQuery({
    queryKey: ["whatsapp-instance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as WhatsappInstance | null;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow text-muted-foreground">Sistema</p>
        <h1 className="text-3xl font-display text-primary">Configurações</h1>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full rounded-xl" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
      ) : instance ? (
        <>
          <WhatsappStatusCard instance={instance} />
          <WhatsappMetrics />
          <AiAgentCard instanceId={instance.id} />
        </>
      ) : (
        <>
          <WhatsappMetrics />
          <WhatsappCreateInstanceCard />
        </>
      )}
    </div>
  );
}
