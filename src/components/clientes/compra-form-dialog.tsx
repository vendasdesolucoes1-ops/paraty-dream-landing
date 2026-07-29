// Compra = um contrato de um lote. Um cliente pode ter várias.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { COMPRA_STATUS_OPTIONS, type Compra, type CompraStatus, type Lote } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SEM_LOTE = "sem_lote";

type FormState = {
  lote_id: string;
  numero_contrato: string;
  data_compra: string;
  valor_total: string;
  valor_entrada: string;
  num_parcelas: string;
  valor_parcela: string;
  dia_vencimento: string;
  data_primeira_parcela: string;
  status: CompraStatus;
  escritura_emitida: boolean;
  observacoes: string;
};

const EMPTY: FormState = {
  lote_id: SEM_LOTE,
  numero_contrato: "",
  data_compra: "",
  valor_total: "",
  valor_entrada: "",
  num_parcelas: "",
  valor_parcela: "",
  dia_vencimento: "",
  data_primeira_parcela: "",
  status: "ativo",
  escritura_emitida: false,
  observacoes: "",
};

function numOrNull(value: string): number | null {
  const trimmed = value.trim().replace(/\./g, "").replace(",", ".");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value: string): string | null {
  return value.trim() || null;
}

function loteLabel(lote: Pick<Lote, "numero_lote" | "quadra" | "metragem">): string {
  const partes = [`Lote ${lote.numero_lote}`];
  if (lote.quadra) partes.push(`Quadra ${lote.quadra}`);
  if (lote.metragem) partes.push(`${lote.metragem} m²`);
  return partes.join(" · ");
}

export function CompraFormDialog({
  open,
  onOpenChange,
  clienteId,
  compra,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string;
  /** Presente = edição. */
  compra?: Compra;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (!open) return;
    if (compra) {
      setForm({
        lote_id: compra.lote_id ?? SEM_LOTE,
        numero_contrato: compra.numero_contrato ?? "",
        data_compra: compra.data_compra ?? "",
        valor_total: compra.valor_total?.toString() ?? "",
        valor_entrada: compra.valor_entrada?.toString() ?? "",
        num_parcelas: compra.num_parcelas?.toString() ?? "",
        valor_parcela: compra.valor_parcela?.toString() ?? "",
        dia_vencimento: compra.dia_vencimento?.toString() ?? "",
        data_primeira_parcela: compra.data_primeira_parcela ?? "",
        status: compra.status,
        escritura_emitida: compra.escritura_emitida,
        observacoes: compra.observacoes ?? "",
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, compra]);

  // Na criação só fazem sentido os lotes livres; na edição o lote atual já está
  // 'vendido' pelo trigger e precisa continuar aparecendo na lista.
  const { data: lotes } = useQuery({
    queryKey: ["lotes-para-compra", compra?.lote_id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lotes")
        .select("id, numero_lote, quadra, metragem, status")
        .order("numero_lote");
      if (error) throw error;
      return data as unknown as Pick<
        Lote,
        "id" | "numero_lote" | "quadra" | "metragem" | "status"
      >[];
    },
    enabled: open,
  });

  const lotesDisponiveis = (lotes ?? []).filter(
    (lote) => lote.status !== "vendido" || lote.id === compra?.lote_id,
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        lote_id: form.lote_id === SEM_LOTE ? null : form.lote_id,
        numero_contrato: textOrNull(form.numero_contrato),
        data_compra: textOrNull(form.data_compra),
        valor_total: numOrNull(form.valor_total),
        valor_entrada: numOrNull(form.valor_entrada),
        num_parcelas: numOrNull(form.num_parcelas),
        valor_parcela: numOrNull(form.valor_parcela),
        dia_vencimento: numOrNull(form.dia_vencimento),
        data_primeira_parcela: textOrNull(form.data_primeira_parcela),
        status: form.status,
        escritura_emitida: form.escritura_emitida,
        observacoes: textOrNull(form.observacoes),
      };

      if (compra) {
        const { error } = await supabase.from("compras").update(payload).eq("id", compra.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("compras")
        .insert({ ...payload, cliente_id: clienteId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(compra ? "Compra atualizada." : "Compra registrada.");
      queryClient.invalidateQueries({ queryKey: ["compras"] });
      queryClient.invalidateQueries({ queryKey: ["lotes"] });
      queryClient.invalidateQueries({ queryKey: ["lotes-para-compra"] });
      onOpenChange(false);
    },
    onError: (error: { code?: string; message?: string }) => {
      // idx_compras_lote_ativo_unico: o lote já tem contrato ativo.
      if (error?.code === "23505") {
        toast.error("Este lote já tem um contrato ativo. Distrate o anterior antes.");
        return;
      }
      toast.error(error?.message || "Não foi possível salvar a compra.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-primary">
            {compra ? "Editar compra" : "Nova compra"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Lote</Label>
              <Select
                value={form.lote_id}
                onValueChange={(v) => setForm((c) => ({ ...c, lote_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_LOTE}>Sem lote definido</SelectItem>
                  {lotesDisponiveis.map((lote) => (
                    <SelectItem key={lote.id} value={lote.id}>
                      {loteLabel(lote)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Lotes já vendidos não aparecem — o status do lote acompanha a compra
                automaticamente.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="compra-contrato">Nº do contrato</Label>
              <Input
                id="compra-contrato"
                value={form.numero_contrato}
                onChange={(e) => setForm((c) => ({ ...c, numero_contrato: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="compra-data">Data da compra</Label>
              <Input
                id="compra-data"
                type="date"
                value={form.data_compra}
                onChange={(e) => setForm((c) => ({ ...c, data_compra: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v: CompraStatus) => setForm((c) => ({ ...c, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPRA_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="compra-total">Valor total (R$)</Label>
              <Input
                id="compra-total"
                inputMode="decimal"
                value={form.valor_total}
                onChange={(e) => setForm((c) => ({ ...c, valor_total: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="compra-entrada">Entrada (R$)</Label>
              <Input
                id="compra-entrada"
                inputMode="decimal"
                value={form.valor_entrada}
                onChange={(e) => setForm((c) => ({ ...c, valor_entrada: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="compra-parcelas">Nº de parcelas</Label>
              <Input
                id="compra-parcelas"
                inputMode="numeric"
                placeholder="Ex: 180"
                value={form.num_parcelas}
                onChange={(e) => setForm((c) => ({ ...c, num_parcelas: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="compra-valor-parcela">Valor da parcela (R$)</Label>
              <Input
                id="compra-valor-parcela"
                inputMode="decimal"
                value={form.valor_parcela}
                onChange={(e) => setForm((c) => ({ ...c, valor_parcela: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="compra-vencimento">Dia do vencimento</Label>
              <Input
                id="compra-vencimento"
                inputMode="numeric"
                placeholder="1 a 31"
                value={form.dia_vencimento}
                onChange={(e) => setForm((c) => ({ ...c, dia_vencimento: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="compra-primeira">1ª parcela</Label>
              <Input
                id="compra-primeira"
                type="date"
                value={form.data_primeira_parcela}
                onChange={(e) => setForm((c) => ({ ...c, data_primeira_parcela: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 border-t pt-4">
            <Switch
              id="compra-escritura"
              checked={form.escritura_emitida}
              onCheckedChange={(v) => setForm((c) => ({ ...c, escritura_emitida: v }))}
            />
            <Label htmlFor="compra-escritura" className="font-normal">
              Escritura emitida
            </Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="compra-obs">Observações</Label>
            <Textarea
              id="compra-obs"
              rows={3}
              value={form.observacoes}
              onChange={(e) => setForm((c) => ({ ...c, observacoes: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : compra ? "Salvar alterações" : "Registrar compra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
