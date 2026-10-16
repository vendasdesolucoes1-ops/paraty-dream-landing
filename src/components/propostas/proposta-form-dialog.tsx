// Nova proposta ou nova versão de uma proposta. Proposta enviada não se edita:
// mudou valor ou condição, sai uma versão nova (o banco numera) e a anterior
// fica no histórico da negociação.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Lote } from "@/lib/types";
import { rotuloLote, type PropostaComLote, type PropostaStatus } from "@/lib/propostas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  valor_total: string;
  entrada: string;
  parcelas: string;
  valida_ate: string;
  condicoes: string;
  status: Extract<PropostaStatus, "rascunho" | "enviada">;
};

/** Mesmo critério do diálogo de compra: ponto é milhar, vírgula é decimal. */
function numOrNull(value: string): number | null {
  const trimmed = value.trim().replace(/\./g, "").replace(",", ".");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function paraCampo(n: number | null | undefined): string {
  return n == null ? "" : String(n).replace(".", ",");
}

/** Validade padrão: 15 dias a partir de hoje, em data local. */
function validadePadrao(): string {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function PropostaFormDialog({
  open,
  onOpenChange,
  leadId,
  loteInteresseId,
  base,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  /** Lote já vinculado ao lead: vem pré-selecionado numa proposta nova. */
  loteInteresseId: string | null;
  /** Presente = nova versão desta proposta (os campos vêm preenchidos). */
  base?: PropostaComLote | null;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({
    lote_id: SEM_LOTE,
    valor_total: "",
    entrada: "",
    parcelas: "",
    valida_ate: "",
    condicoes: "",
    status: "rascunho",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      lote_id: (base ? base.lote_id : loteInteresseId) ?? SEM_LOTE,
      valor_total: paraCampo(base?.valor_total),
      entrada: paraCampo(base?.entrada),
      parcelas: base?.parcelas?.toString() ?? "",
      valida_ate: validadePadrao(),
      condicoes: base?.condicoes ?? "",
      status: "rascunho",
    });
  }, [open, base, loteInteresseId]);

  const { data: lotes } = useQuery({
    queryKey: ["lotes-para-proposta"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lotes")
        .select("id, numero_lote, quadra, metragem, status, valor")
        .order("numero_lote");
      if (error) throw error;
      return data as unknown as Pick<
        Lote,
        "id" | "numero_lote" | "quadra" | "metragem" | "status" | "valor"
      >[];
    },
    enabled: open,
  });

  // Lote vendido não recebe proposta; o lote atual continua na lista mesmo assim.
  const lotesDisponiveis = (lotes ?? []).filter(
    (lote) => lote.status !== "vendido" || lote.id === form.lote_id,
  );

  function escolherLote(id: string) {
    const lote = lotes?.find((l) => l.id === id);
    setForm((c) => ({
      ...c,
      lote_id: id,
      // Sugere o preço de tabela só quando o valor ainda está em branco.
      valor_total: c.valor_total || paraCampo(lote?.valor ?? null),
    }));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const valor = numOrNull(form.valor_total);
      if (valor == null || valor <= 0) throw new Error("Informe o valor total da proposta.");
      const parcelas = numOrNull(form.parcelas);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)("propostas").insert({
        lead_id: leadId,
        lote_id: form.lote_id === SEM_LOTE ? null : form.lote_id,
        valor_total: valor,
        entrada: numOrNull(form.entrada),
        parcelas: parcelas == null ? null : Math.round(parcelas),
        valida_ate: form.valida_ate || null,
        condicoes: form.condicoes.trim() || null,
        status: form.status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(base ? "Nova versão criada." : "Proposta criada.");
      queryClient.invalidateQueries({ queryKey: ["propostas"] });
      queryClient.invalidateQueries({ queryKey: ["dash", "forecast"] });
      onOpenChange(false);
    },
    onError: (error: { message?: string }) =>
      toast.error(error?.message || "Não foi possível salvar a proposta."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-primary">
            {base ? `Nova versão (a partir da v${base.versao})` : "Nova proposta"}
          </DialogTitle>
          <DialogDescription>
            {base
              ? "A versão anterior continua no histórico. A numeração é feita automaticamente."
              : "Valor e condições oferecidos ao lead. Cada lote tem sua própria sequência de versões."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Lote</Label>
              <Select value={form.lote_id} onValueChange={escolherLote}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_LOTE}>Sem lote definido</SelectItem>
                  {lotesDisponiveis.map((lote) => (
                    <SelectItem key={lote.id} value={lote.id}>
                      {rotuloLote(lote)}
                      {lote.metragem ? ` · ${lote.metragem} m²` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="proposta-total">Valor total (R$)</Label>
              <Input
                id="proposta-total"
                inputMode="decimal"
                value={form.valor_total}
                onChange={(e) => setForm((c) => ({ ...c, valor_total: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="proposta-entrada">Entrada (R$)</Label>
              <Input
                id="proposta-entrada"
                inputMode="decimal"
                value={form.entrada}
                onChange={(e) => setForm((c) => ({ ...c, entrada: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="proposta-parcelas">Nº de parcelas</Label>
              <Input
                id="proposta-parcelas"
                inputMode="numeric"
                placeholder="Ex: 120"
                value={form.parcelas}
                onChange={(e) => setForm((c) => ({ ...c, parcelas: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="proposta-validade">Válida até</Label>
              <Input
                id="proposta-validade"
                type="date"
                value={form.valida_ate}
                onChange={(e) => setForm((c) => ({ ...c, valida_ate: e.target.value }))}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Situação</Label>
              <Select
                value={form.status}
                onValueChange={(v: FormState["status"]) => setForm((c) => ({ ...c, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rascunho">Rascunho (ainda não enviada)</SelectItem>
                  <SelectItem value="enviada">Enviada ao lead</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="proposta-condicoes">Condições</Label>
            <Textarea
              id="proposta-condicoes"
              rows={3}
              placeholder="Ex: entrada em 3x, parcelas corrigidas pelo IPCA, desconto à vista…"
              value={form.condicoes}
              onChange={(e) => setForm((c) => ({ ...c, condicoes: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : base ? "Criar versão" : "Criar proposta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
