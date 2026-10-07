import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, MapPinned } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { LOTE_STATUS_DOT } from "@/components/dashboard/status-badge";
import { Campo, FormGaveta, Secao } from "@/components/visoes/form-gaveta";
import {
  LOTE_TIPO_OPTIONS,
  LOTE_STATUS_OPTIONS,
  type Lote,
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

function formFromLote(lote: Lote) {
  return {
    numero_lote: lote.numero_lote,
    quadra: lote.quadra ?? "",
    metragem: lote.metragem?.toString() ?? "",
    tipo: (lote.tipo ?? "residencial") as LoteTipo,
    valor: lote.valor?.toString() ?? "",
    status: lote.status,
    observacoes: lote.observacoes ?? "",
  };
}

interface LoteFormDialogProps {
  lote?: Lote;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function LoteFormDialog({ lote, trigger, open, onOpenChange }: LoteFormDialogProps) {
  const isEdit = Boolean(lote);
  const [internalOpen, setInternalOpen] = useState(false);
  const actualOpen = open ?? internalOpen;
  const setActualOpen = onOpenChange ?? setInternalOpen;

  const [form, setForm] = useState(lote ? formFromLote(lote) : emptyForm);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (actualOpen) {
      setForm(lote ? formFromLote(lote) : emptyForm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualOpen, lote?.id]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        numero_lote: form.numero_lote,
        quadra: form.quadra || null,
        metragem: form.metragem ? Number(form.metragem) : null,
        tipo: form.tipo,
        valor: form.valor ? Number(form.valor) : null,
        status: form.status,
        observacoes: form.observacoes || null,
      };

      if (isEdit && lote) {
        const { error } = await supabase.from("lotes").update(payload).eq("id", lote.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("lotes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lotes"] });
      setActualOpen(false);
      if (!isEdit) setForm(emptyForm);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <FormGaveta
      open={actualOpen}
      onOpenChange={setActualOpen}
      trigger={trigger}
      icone={MapPinned}
      titulo={isEdit ? "Editar lote" : "Novo lote"}
      subtitulo={
        isEdit
          ? `Quadra ${lote?.quadra ?? "—"} · Lote ${lote?.numero_lote ?? ""}`
          : "Entra no estoque do loteamento."
      }
      descricao={
        isEdit
          ? "Altere os dados, o valor e o status do lote."
          : "Preencha os dados do lote para cadastrá-lo no estoque."
      }
      formId="form-lote"
      onSubmit={handleSubmit}
      rotuloSalvar={isEdit ? "Salvar" : "Criar"}
      rotuloSalvando="Salvando..."
      rotuloAtalho={isEdit ? "salvar" : "criar"}
      salvando={mutation.isPending}
      erro={mutation.isError ? "Erro ao salvar o lote. Tente novamente." : null}
    >
      <Secao titulo="Identificação">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="quadra" label="Quadra" obrigatorio>
            <Input
              id="quadra"
              type="number"
              inputMode="numeric"
              required
              autoFocus
              placeholder="Ex.: 3"
              value={form.quadra}
              onChange={(e) => setForm((f) => ({ ...f, quadra: e.target.value }))}
            />
          </Campo>
          <Campo id="numero_lote" label="Número do lote" obrigatorio>
            <Input
              id="numero_lote"
              type="number"
              inputMode="numeric"
              required
              placeholder="Ex.: 12"
              value={form.numero_lote}
              onChange={(e) => setForm((f) => ({ ...f, numero_lote: e.target.value }))}
            />
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Medidas e valor">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="metragem" label="Metragem">
            <Sufixo texto="m²">
              <Input
                id="metragem"
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="360"
                className="pr-10"
                value={form.metragem}
                onChange={(e) => setForm((f) => ({ ...f, metragem: e.target.value }))}
              />
            </Sufixo>
          </Campo>
          <Campo id="valor" label="Valor">
            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[0.8125rem] text-muted-foreground"
              >
                R$
              </span>
              <Input
                id="valor"
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="0,00"
                className="pl-9"
                value={form.valor}
                onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
              />
            </div>
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Classificação">
        <Opcoes
          rotulo="Tipo"
          valor={form.tipo}
          onChange={(tipo) => setForm((f) => ({ ...f, tipo }))}
          opcoes={LOTE_TIPO_OPTIONS}
        />
        <Opcoes
          rotulo="Status"
          valor={form.status}
          onChange={(status) => setForm((f) => ({ ...f, status }))}
          opcoes={LOTE_STATUS_OPTIONS}
          ponto={(v) => LOTE_STATUS_DOT[v]}
        />
      </Secao>

      <Secao titulo="Detalhes">
        <Campo id="observacoes" label="Observações" dica="Visível só para a equipe.">
          <Textarea
            id="observacoes"
            rows={3}
            placeholder="Esquina, ponto alto, combinados com o proprietário…"
            value={form.observacoes}
            onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
          />
        </Campo>
      </Secao>
    </FormGaveta>
  );
}

/** Input com unidade à direita. */
function Sufixo({ texto, children }: { texto: string; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[0.8125rem] text-muted-foreground"
      >
        {texto}
      </span>
    </div>
  );
}

/** Escolha única em pílulas (mesmo padrão de "Como chegou" no cadastro de cliente). */
function Opcoes<T extends string>({
  rotulo,
  valor,
  onChange,
  opcoes,
  ponto,
}: {
  rotulo: string;
  valor: T;
  onChange: (valor: T) => void;
  opcoes: { value: T; label: string }[];
  ponto?: (valor: T) => string;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="space-y-2">
      <p className="text-[0.8125rem] font-medium">{rotulo}</p>
      <div className="flex flex-wrap gap-2">
        {opcoes.map((opt) => {
          const ativo = valor === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => onChange(opt.value)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[0.8125rem] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15",
                ativo
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-input bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {ativo ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : ponto ? (
                <span aria-hidden className={cn("h-2 w-2 rounded-full", ponto(opt.value))} />
              ) : null}
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
