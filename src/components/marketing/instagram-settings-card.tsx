import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Instagram } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function useInstagramConfig() {
  return useQuery({
    queryKey: ["instagram-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracoes")
        .select("chave, valor")
        .in("chave", ["instagram_token", "instagram_user_id"]);
      if (error) throw error;
      const map = Object.fromEntries((data ?? []).map((row) => [row.chave, row.valor ?? ""]));
      return {
        instagram_token: map.instagram_token ?? "",
        instagram_user_id: map.instagram_user_id ?? "",
      };
    },
  });
}

export function InstagramSettingsCard({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const [userId, setUserId] = useState("");
  const [token, setToken] = useState("");

  const { data: config } = useInstagramConfig();

  useEffect(() => {
    if (config) {
      setUserId(config.instagram_user_id);
      setToken(config.instagram_token);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error: userIdError } = await supabase
        .from("configuracoes")
        .update({ valor: userId })
        .eq("chave", "instagram_user_id");
      if (userIdError) throw userIdError;

      const { error: tokenError } = await supabase
        .from("configuracoes")
        .update({ valor: token })
        .eq("chave", "instagram_token");
      if (tokenError) throw tokenError;
    },
    onSuccess: () => {
      toast.success("Configurações do Instagram salvas.");
      queryClient.invalidateQueries({ queryKey: ["instagram-config"] });
    },
    onError: () => toast.error("Erro ao salvar as configurações do Instagram."),
  });

  return (
    <Card className="shadow-sm">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-lg font-display text-primary flex items-center gap-2">
              <Instagram className="h-5 w-5 text-gold" />
              Configurações do Instagram
            </CardTitle>
            <ChevronDown
              className={cn(
                "h-5 w-5 text-muted-foreground transition-transform shrink-0",
                open && "rotate-180",
              )}
            />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="instagram_user_id">Instagram User ID</Label>
              <Input
                id="instagram_user_id"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagram_token">Access Token</Label>
              <Input
                id="instagram_token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : "Salvar token"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Para obter seu token, acesse developers.facebook.com, crie um app, conecte sua conta
              Business do Instagram e gere um token de longa duração com permissão
              instagram_content_publish.
            </p>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
