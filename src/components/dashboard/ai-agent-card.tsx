import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AiAgent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

const DEFAULT_AGENT_NAME = "Agente Moradas de Paraty";
const DEFAULT_TRANSFER_KEYWORDS = ["atendente", "humano", "falar com alguém", "corretor"];

export function AiAgentCard({ instanceId }: { instanceId: string }) {
  const queryClient = useQueryClient();
  const [keywordsInput, setKeywordsInput] = useState("");

  const { data: agent, isLoading } = useQuery({
    queryKey: ["ai-agent", instanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("*")
        .eq("instance_id", instanceId)
        .maybeSingle();
      if (error) throw error;
      return data as AiAgent | null;
    },
  });

  useEffect(() => {
    if (agent) setKeywordsInput((agent.transfer_keywords ?? []).join(", "));
  }, [agent]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ai_agents").insert({
        name: DEFAULT_AGENT_NAME,
        instance_id: instanceId,
        is_active: true,
        transfer_keywords: DEFAULT_TRANSFER_KEYWORDS,
        transfer_to_human_enabled: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agente IA criado e ativado.");
      queryClient.invalidateQueries({ queryKey: ["ai-agent", instanceId] });
    },
    onError: () => toast.error("Erro ao criar o agente IA."),
  });

  const toggleMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      if (!agent) return;
      const { error } = await supabase
        .from("ai_agents")
        .update({ is_active: isActive })
        .eq("id", agent.id);
      if (error) throw error;
      return isActive;
    },
    onSuccess: (isActive) => {
      toast.success(isActive ? "Agente IA ativado." : "Agente IA pausado.");
      queryClient.invalidateQueries({ queryKey: ["ai-agent", instanceId] });
    },
    onError: () => toast.error("Erro ao atualizar o agente."),
  });

  const saveKeywordsMutation = useMutation({
    mutationFn: async () => {
      if (!agent) return;
      const keywords = keywordsInput
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
      const { error } = await supabase
        .from("ai_agents")
        .update({ transfer_keywords: keywords })
        .eq("id", agent.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Palavras-chave salvas.");
      queryClient.invalidateQueries({ queryKey: ["ai-agent", instanceId] });
    },
    onError: () => toast.error("Erro ao salvar as palavras-chave."),
  });

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-display text-primary flex items-center gap-2">
          <Bot className="h-5 w-5 text-gold" />
          Agente IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !agent ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Nenhum agente configurado para esta instância. Crie o agente para começar a qualificar
              leads automaticamente pelo WhatsApp.
            </p>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Criando..." : "Criar Agente"}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{agent.name}</p>
                <p className="text-xs text-muted-foreground">
                  {agent.is_active
                    ? "Respondendo leads automaticamente"
                    : "Pausado — mensagens não serão respondidas pela IA"}
                </p>
              </div>
              <Switch
                checked={agent.is_active}
                onCheckedChange={(checked) => toggleMutation.mutate(checked)}
                disabled={toggleMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="transfer_keywords">Palavras-chave de transferência para humano</Label>
              <Input
                id="transfer_keywords"
                placeholder="atendente, humano, corretor"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Separe por vírgula. Quando o lead usar uma dessas palavras, a conversa é transferida
                para um atendente humano.
              </p>
            </div>

            <Button
              onClick={() => saveKeywordsMutation.mutate()}
              disabled={saveKeywordsMutation.isPending}
            >
              {saveKeywordsMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
