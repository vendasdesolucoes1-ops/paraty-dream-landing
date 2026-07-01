import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { WhatsappInstance } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_LABELS: Record<string, string> = {
  connecting: "Conectando",
  open: "Conectado",
  connected: "Conectado",
  close: "Desconectado",
  disconnected: "Desconectado",
  unknown: "Desconhecido",
};

function statusVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "open" || status === "connected") return "default";
  if (status === "connecting") return "secondary";
  return "destructive";
}

export function WhatsappInstanceSettings() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ instance_name: "", api_url: "", api_key: "" });

  const { data: instance } = useQuery({
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
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "open" || status === "connected") return false;
      return 10_000;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("whatsapp-instance/create", {
        body: form,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instance"] });
      setForm({ instance_name: "", api_url: "", api_key: "" });
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!instance) return;
      const { error } = await supabase.functions.invoke("whatsapp-instance/connect", {
        body: { instance_name: instance.instance_name },
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-instance"] }),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-display text-primary">WhatsApp</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {!instance ? (
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="instance_name">Nome da instância</Label>
              <Input
                id="instance_name"
                required
                value={form.instance_name}
                onChange={(e) => setForm((f) => ({ ...f, instance_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api_url">URL da Evolution API</Label>
              <Input
                id="api_url"
                required
                placeholder="https://sua-evolution-api.com"
                value={form.api_url}
                onChange={(e) => setForm((f) => ({ ...f, api_url: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api_key">API Key</Label>
              <Input
                id="api_key"
                required
                type="password"
                value={form.api_key}
                onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
              />
            </div>
            {createMutation.isError ? (
              <p className="text-sm text-destructive">
                Erro ao criar a instância. Verifique os dados e tente novamente.
              </p>
            ) : null}
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Criando..." : "Criar instância"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">{instance.instance_name}</span>
              <Badge variant={statusVariant(instance.status)}>
                {STATUS_LABELS[instance.status] ?? instance.status}
              </Badge>
            </div>

            {instance.status !== "open" && instance.status !== "connected" ? (
              <div className="space-y-3">
                {instance.qr_code ? (
                  <img
                    src={
                      instance.qr_code.startsWith("data:")
                        ? instance.qr_code
                        : `data:image/png;base64,${instance.qr_code}`
                    }
                    alt="QR Code do WhatsApp"
                    className="w-56 h-56 border rounded-lg"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhum QR code disponível. Clique em reconectar para gerar um novo.
                  </p>
                )}
                <Button
                  onClick={() => connectMutation.mutate()}
                  disabled={connectMutation.isPending}
                >
                  {connectMutation.isPending ? "Conectando..." : "Reconectar"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Número conectado e pronto para uso.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
