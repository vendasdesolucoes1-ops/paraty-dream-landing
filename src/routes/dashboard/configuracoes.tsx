import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Plus, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { WhatsappInstance } from "@/lib/types";
import { WhatsappInstanceCard } from "@/components/dashboard/whatsapp-status-card";
import { AiAgentPanel } from "@/components/dashboard/ai-agent-panel";
import { WhatsappCreateInstanceCard } from "@/components/dashboard/whatsapp-instance-settings";
import { TeamPanel } from "@/components/dashboard/team-panel";
import { Button } from "@/components/ui/button";
import { Bloco } from "@/components/ds/bloco";
import { SkeletonRows } from "@/components/ds/query-state";
import { Reveal, atraso } from "@/components/ds/reveal";
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
    <div className="space-y-10">
      <Bloco
        titulo="Instâncias Evolution API"
        descricao="Configure a conexão com sua VPS"
        acao={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Nova Instância
          </Button>
        }
      >
        <WhatsappCreateInstanceCard open={formOpen} onOpenChange={setFormOpen} />

        {isLoading ? (
          <SkeletonRows rows={1} className="h-72" />
        ) : !instances || instances.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Nenhuma instância configurada"
            description='Clique em "Nova Instância" para conectar seu WhatsApp.'
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {instances.map((instance, i) => (
              <div key={instance.id} className="animate-swap" style={atraso(i, 70, 350)}>
                <WhatsappInstanceCard instance={instance} />
              </div>
            ))}
          </div>
        )}
      </Bloco>

      {instances && instances.length > 0 ? (
        <Bloco
          titulo="Agente de atendimento"
          descricao="Comportamento, conhecimento e testes do assistente de cada instância."
          divisor
        >
          <div className="space-y-6">
            {instances.map((instance, i) => (
              <div key={instance.id} className="animate-swap" style={atraso(i, 90, 360)}>
                <AiAgentPanel instanceId={instance.id} />
              </div>
            ))}
          </div>
        </Bloco>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-8">
      <Reveal ordem={0}>
        <PageHeader
          eyebrow="Sistema"
          title="Configurações"
          description="Configure a conexão com a Evolution API para enviar e receber mensagens diretamente no CRM."
        />
      </Reveal>

      <Reveal ordem={1}>
        {isAdmin ? (
          <Tabs defaultValue="whatsapp">
            <TabsList>
              <TabsTrigger value="whatsapp">
                <MessageSquare className="h-4 w-4" aria-hidden />
                WhatsApp
              </TabsTrigger>
              <TabsTrigger value="equipe">
                <Users className="h-4 w-4" aria-hidden />
                Equipe
              </TabsTrigger>
            </TabsList>
            <TabsContent value="whatsapp" className="mt-8">
              {whatsappSection}
            </TabsContent>
            <TabsContent value="equipe" className="mt-8">
              <TeamPanel />
            </TabsContent>
          </Tabs>
        ) : (
          whatsappSection
        )}
      </Reveal>
    </div>
  );
}
