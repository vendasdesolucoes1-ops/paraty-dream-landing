import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Link2, MessageSquarePlus, Smartphone } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Campo, ComIcone, Secao } from "@/components/ajustes/campos";
import { Kbd } from "@/components/ds/kbd";

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-[31rem]">
        <SheetTitle className="sr-only">Nova instância do WhatsApp</SheetTitle>
        <SheetDescription className="sr-only">
          Informe o nome, o endereço da Evolution API e a chave para criar a instância.
        </SheetDescription>

        <header className="flex items-center gap-4 border-b border-border px-7 pb-5 pr-14 pt-7">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"
          >
            <MessageSquarePlus className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[1.85rem] font-medium leading-none tracking-[-0.01em]">
              Nova instância
            </h2>
            <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">
              Depois de criar, escaneie o QR code para conectar o número.
            </p>
          </div>
        </header>

        <form
          id="form-instancia"
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.requestSubmit();
            }
          }}
          className="flex-1 space-y-8 overflow-y-auto px-7 py-6"
        >
          <Secao titulo="Identificação">
            <Campo
              id="instance_name"
              label="Nome da instância"
              obrigatorio
              dica="Como a instância aparece no painel e nas ferramentas."
            >
              <ComIcone icone={Smartphone}>
                <Input
                  id="instance_name"
                  required
                  autoFocus
                  autoComplete="off"
                  className="pl-9"
                  value={form.instance_name}
                  onChange={(e) => setForm((f) => ({ ...f, instance_name: e.target.value }))}
                />
              </ComIcone>
            </Campo>
          </Secao>

          <Secao titulo="Conexão com a Evolution API">
            <Campo id="api_url" label="URL da Evolution API" obrigatorio>
              <ComIcone icone={Link2}>
                <Input
                  id="api_url"
                  required
                  placeholder="https://sua-evolution-api.com"
                  className="pl-9"
                  value={form.api_url}
                  onChange={(e) => setForm((f) => ({ ...f, api_url: e.target.value }))}
                />
              </ComIcone>
            </Campo>
            <Campo
              id="api_key"
              label="API Key"
              obrigatorio
              dica="Chave de acesso da sua Evolution API."
            >
              <ComIcone icone={KeyRound}>
                <Input
                  id="api_key"
                  required
                  type="password"
                  autoComplete="off"
                  className="pl-9"
                  value={form.api_key}
                  onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                />
              </ComIcone>
            </Campo>
          </Secao>
        </form>

        <footer className="flex items-center justify-between gap-3 border-t border-border bg-card px-7 py-4">
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd> criar
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-instancia" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Criando..." : "Criar instância"}
            </Button>
          </div>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
