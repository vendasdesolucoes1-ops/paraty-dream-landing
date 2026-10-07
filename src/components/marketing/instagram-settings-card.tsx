import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Instagram } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ds/pill";
import { Campo, SeloIcone } from "@/components/ajustes/campos";
import { Card, CardContent } from "@/components/ui/card";
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
  const conectado = Boolean(config?.instagram_token && config?.instagram_user_id);

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
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 p-6 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="flex min-w-0 items-center gap-3">
              <SeloIcone icone={Instagram} />
              <span className="min-w-0">
                <span className="block font-sans text-[1.0625rem] font-semibold leading-snug tracking-[-0.011em]">
                  Configurações do Instagram
                </span>
                <span className="mt-1 flex">
                  <Pill tone={conectado ? "success" : "neutral"} dot>
                    {conectado ? "Credenciais salvas" : "Não configurado"}
                  </Pill>
                </span>
              </span>
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-[var(--ease-out)]",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="max-w-xl space-y-5 border-t border-border pt-6">
            <Campo id="instagram_user_id" label="Instagram User ID">
              <Input
                id="instagram_user_id"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              />
            </Campo>
            <Campo id="instagram_token" label="Access Token">
              <Input
                id="instagram_token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </Campo>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : "Salvar token"}
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
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
