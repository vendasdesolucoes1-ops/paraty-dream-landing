import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  DOCUMENTO_CATEGORIA_OPTIONS,
  type DocumentoCategoria,
  type DocumentoWithLead,
} from "@/lib/types";
import { ProcessoField } from "@/components/documentos/processo-field";
import {
  EMPTY_PROCESSO_VALUE,
  resolveProcessoId,
  type ProcessoFieldValue,
} from "@/lib/processo-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  useEffect(() => {
    if (!open || !documento) return;
    setTitulo(documento.titulo);
    setCategoria(documento.categoria);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {documento ? (
          <>
            <DialogHeader>
              <DialogTitle>Editar documento</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-doc-titulo">Título</Label>
                <Input
                  id="edit-doc-titulo"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={categoria}
                  onValueChange={(v: DocumentoCategoria) => setCategoria(v)}
                >
                  <SelectTrigger>
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
              </div>

              <ProcessoField value={processo} onChange={setProcesso} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
