import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { WhatsappInstance } from "@/lib/types";
import { WhatsappInstanceCard } from "@/components/dashboard/whatsapp-status-card";
import { AiAgentPanel } from "@/components/dashboard/ai-agent-panel";
import { WhatsappCreateInstanceCard } from "@/components/dashboard/whatsapp-instance-settings";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/dashboard/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Moradas de Paraty" }] }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const [formOpen, setFormOpen] = useState(false);

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

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow text-muted-foreground">Sistema</p>
        <h1 className="text-3xl font-display text-primary">Integração WhatsApp</h1>
        <p className="text-muted-foreground mt-1">
          Configure a conexão com a Evolution API para enviar e receber mensagens diretamente no
          CRM.
        </p>
      </div>

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
            <p className="text-sm text-muted-foreground border rounded-lg p-6 text-center">
              Nenhuma instância configurada. Clique em "Nova Instância" para conectar seu WhatsApp.
            </p>
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
}
