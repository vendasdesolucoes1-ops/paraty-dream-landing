import { useEffect, useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  DOCUMENTO_CATEGORIA_OPTIONS,
  type DocumentoCategoria,
  type DocumentoWithLead,
} from "@/lib/types";
import { compraLabel } from "@/lib/types";
import { ProcessoField } from "@/components/documentos/processo-field";
import { CompraField } from "@/components/documentos/compra-field";
import {
  EMPTY_PROCESSO_VALUE,
  resolveProcessoId,
  type ProcessoFieldValue,
} from "@/lib/processo-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Kbd } from "@/components/ds/kbd";
import { Campo, GavetaCabecalho, GavetaRodape, Secao } from "@/components/documentos/pecas";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function DocumentoEditDialog({
  documento,
  open,
  onOpenChange,
}: {
  documento: DocumentoWithLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState<DocumentoCategoria>("outro");
  const [processo, setProcesso] = useState<ProcessoFieldValue>(EMPTY_PROCESSO_VALUE);
  const [compraId, setCompraId] = useState<string | null>(null);
  const [compraRotulo, setCompraRotulo] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !documento) return;
    setTitulo(documento.titulo);
    setCategoria(documento.categoria);
    setCompraId(documento.compra_id);
    setCompraRotulo(documento.compra ? compraLabel(documento.compra) : null);
    setProcesso(
      documento.processo_id
        ? {
            ...EMPTY_PROCESSO_VALUE,
            processoId: documento.processo_id,
            processoLabel: documento.processo?.titulo ?? "Processo vinculado",
          }
        : EMPTY_PROCESSO_VALUE,
    );
  }, [open, documento]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!documento) return;
      if (!titulo.trim()) throw new Error("Informe um título.");

      const processoId = await resolveProcessoId(processo);

      const { error } = await supabase
        .from("documentos")
        .update({
          titulo: titulo.trim(),
          categoria,
          processo_id: processoId,
          compra_id: compraId,
        })
        .eq("id", documento.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento atualizado.");
      queryClient.invalidateQueries({ queryKey: ["documentos"] });
      queryClient.invalidateQueries({ queryKey: ["processos"] });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao atualizar o documento."),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!mutation.isPending) mutation.mutate();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-[31rem]">
        <GavetaCabecalho
          icon={Pencil}
          titulo="Editar documento"
          descricao={
            documento ? (
              <span className="line-clamp-1">{documento.titulo}</span>
            ) : (
              "Altere título, categoria e vínculos."
            )
          }
        />

        {documento ? (
          <>
            <form
              id="form-documento-edicao"
              onSubmit={handleSubmit}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.requestSubmit();
                }
              }}
              className="flex-1 space-y-8 overflow-y-auto px-7 py-6"
            >
              <Secao titulo="Detalhes">
                <Campo id="edit-doc-titulo" label="Título" obrigatorio>
                  <Input
                    id="edit-doc-titulo"
                    autoComplete="off"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                  />
                </Campo>

                <Campo id="edit-doc-categoria" label="Categoria">
                  <Select
                    value={categoria}
                    onValueChange={(v: DocumentoCategoria) => setCategoria(v)}
                  >
                    <SelectTrigger id="edit-doc-categoria">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENTO_CATEGORIA_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Campo>
              </Secao>

              <Secao titulo="Vínculos">
                <ProcessoField value={processo} onChange={setProcesso} />

                <CompraField
                  value={compraId}
                  label={compraRotulo}
                  onChange={(id, rotulo) => {
                    setCompraId(id);
                    setCompraRotulo(rotulo);
                  }}
                />
              </Secao>
            </form>

            <GavetaRodape
              ocupado={mutation.isPending}
              dica={
                <>
                  <Kbd>⌘</Kbd>
                  <Kbd>↵</Kbd> salvar
                </>
              }
            >
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" form="form-documento-edicao" disabled={mutation.isPending}>
                {mutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </GavetaRodape>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
