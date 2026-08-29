import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { WhatsappInstance } from "@/lib/types";
import { WhatsappInstanceCard } from "@/components/dashboard/whatsapp-status-card";
import { AiAgentPanel } from "@/components/dashboard/ai-agent-panel";
import { WhatsappCreateInstanceCard } from "@/components/dashboard/whatsapp-instance-settings";
import { TeamPanel } from "@/components/dashboard/team-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useProfile } from "@/hooks/use-profile";

export const Route = createFileRoute("/dashboard/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Moradas de Paraty" }] }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const [formOpen, setFormOpen] = useState(false);
  const { profile } = useProfile();
  const isAdmin = profile?.role === "admin";

  const { data: instances, isLoading } = useQuery({
    queryKey: ["whatsapp-instances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as WhatsappInstance[];
    },
  });

  const whatsappSection = (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-display text-primary">Instâncias Evolution API</h2>
            <p className="text-sm text-muted-foreground">Configure a conexão com sua VPS</p>
          </div>
          <Button onClick={() => setFormOpen((v) => !v)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Instância
          </Button>
        </div>

        {formOpen ? (
          <WhatsappCreateInstanceCard open={formOpen} onOpenChange={setFormOpen} />
        ) : null}

        {isLoading ? (
          <Skeleton className="h-72 w-full rounded-xl" />
        ) : !instances || instances.length === 0 ? (
          !formOpen ? (
            <EmptyState
              icon={MessageSquare}
              title="Nenhuma instância configurada"
              description='Clique em "Nova Instância" para conectar seu WhatsApp.'
            />
          ) : null
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {instances.map((instance) => (
              <WhatsappInstanceCard key={instance.id} instance={instance} />
            ))}
          </div>
        )}
      </section>

      {instances && instances.length > 0 ? (
        <section className="space-y-4">
          {instances.map((instance) => (
            <AiAgentPanel key={instance.id} instanceId={instance.id} />
          ))}
        </section>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sistema"
        title="Configurações"
        description="Configure a conexão com a Evolution API para enviar e receber mensagens diretamente no CRM."
      />

      {isAdmin ? (
        <Tabs defaultValue="whatsapp">
          <TabsList>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            <TabsTrigger value="equipe">Equipe</TabsTrigger>
          </TabsList>
          <TabsContent value="whatsapp" className="pt-4">
            {whatsappSection}
          </TabsContent>
          <TabsContent value="equipe" className="pt-4">
            <TeamPanel />
          </TabsContent>
        </Tabs>
      ) : (
        whatsappSection
      )}
    </div>
  );
}
