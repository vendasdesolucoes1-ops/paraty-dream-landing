import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function WhatsappCreateInstanceCard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ instance_name: "", api_url: "", api_key: "" });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("whatsapp-instance/create", {
        body: form,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Instância criada. Escaneie o QR code para conectar.");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      setForm({ instance_name: "", api_url: "", api_key: "" });
      onOpenChange(false);
    },
    onError: () => toast.error("Erro ao criar a instância. Verifique os dados."),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate();
  }

  return (
    <Card className="shadow-sm">
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xl font-display text-primary">
              Nova instância do WhatsApp
            </CardTitle>
            <ChevronDown
              className={cn(
                "h-5 w-5 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
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
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : "Criar instância"}
              </Button>
            </form>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
