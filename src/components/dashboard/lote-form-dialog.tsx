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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import {
  LOTE_TIPO_OPTIONS,
  LOTE_STATUS_OPTIONS,
  type LoteTipo,
  type LoteStatus,
} from "@/lib/types";

const emptyForm = {
  numero_lote: "",
  quadra: "",
  metragem: "",
  tipo: "residencial" as LoteTipo,
  valor: "",
  status: "disponivel" as LoteStatus,
  observacoes: "",
};

export function LoteFormDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("lotes").insert({
        numero_lote: form.numero_lote,
        quadra: form.quadra || null,
        metragem: form.metragem ? Number(form.metragem) : null,
        tipo: form.tipo,
        valor: form.valor ? Number(form.valor) : null,
        status: form.status,
        observacoes: form.observacoes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lotes"] });
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
        <Button>Novo Lote</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo lote</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="numero_lote">Número do lote</Label>
              <Input
                id="numero_lote"
                required
                value={form.numero_lote}
                onChange={(e) => setForm((f) => ({ ...f, numero_lote: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quadra">Quadra</Label>
              <Input
                id="quadra"
                value={form.quadra}
                onChange={(e) => setForm((f) => ({ ...f, quadra: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="metragem">Metragem (m²)</Label>
              <Input
                id="metragem"
                type="number"
                step="0.01"
                value={form.metragem}
                onChange={(e) => setForm((f) => ({ ...f, metragem: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valor">Valor (R$)</Label>
              <Input
                id="valor"
                type="number"
                step="0.01"
                value={form.valor}
                onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={form.tipo}
                onValueChange={(value: LoteTipo) => setForm((f) => ({ ...f, tipo: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOTE_TIPO_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value: LoteStatus) => setForm((f) => ({ ...f, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOTE_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              value={form.observacoes}
              onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
            />
          </div>

          {mutation.isError ? (
            <p className="text-sm text-destructive">Erro ao salvar o lote. Tente novamente.</p>
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
