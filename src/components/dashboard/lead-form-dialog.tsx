import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { LEAD_ORIGEM_OPTIONS, type LeadOrigem } from "@/lib/types";

const emptyForm = {
  nome: "",
  email: "",
  telefone: "",
  cidade: "",
  metragem_interesse: "",
  tipo_lote_interesse: "",
  origem: "lp" as LeadOrigem,
};

export function LeadFormDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("leads").insert({
        nome: form.nome,
        email: form.email || null,
        telefone: form.telefone || null,
        cidade: form.cidade || null,
        metragem_interesse: form.metragem_interesse ? Number(form.metragem_interesse) : null,
        tipo_lote_interesse: form.tipo_lote_interesse || null,
        origem: form.origem,
        status_crm: "novo",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setForm(emptyForm);
      setOpen(false);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Novo Lead</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo lead</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              required
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input
                id="telefone"
                value={form.telefone}
                onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cidade">Cidade</Label>
              <Input
                id="cidade"
                value={form.cidade}
                onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="metragem_interesse">Metragem de interesse</Label>
              <Input
                id="metragem_interesse"
                type="number"
                step="0.01"
                value={form.metragem_interesse}
                onChange={(e) => setForm((f) => ({ ...f, metragem_interesse: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tipo_lote_interesse">Tipo de lote de interesse</Label>
              <Input
                id="tipo_lote_interesse"
                value={form.tipo_lote_interesse}
                onChange={(e) => setForm((f) => ({ ...f, tipo_lote_interesse: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Origem</Label>
              <Select
                value={form.origem}
                onValueChange={(value: LeadOrigem) => setForm((f) => ({ ...f, origem: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_ORIGEM_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {mutation.isError ? (
            <p className="text-sm text-destructive">Erro ao salvar o lead. Tente novamente.</p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
