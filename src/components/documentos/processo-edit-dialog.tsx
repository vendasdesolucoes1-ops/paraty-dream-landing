import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
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

export interface ProcessoEditTarget {
  // null = grupo "Sem processo": criar um processo novo e vincular os documentos
  id: string | null;
  titulo: string;
  categoria: string | null;
  documentoIds: string[];
}

export function ProcessoEditDialog({
  target,
  open,
  onOpenChange,
}: {
  target: ProcessoEditTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const isNew = target?.id == null;

  useEffect(() => {
    if (!open || !target) return;
    setTitulo(target.id ? target.titulo : "");
    setCategoria(target.categoria ?? "");
    setObservacoes("");
  }, [open, target]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!target) return;
      const tituloLimpo = titulo.trim();
      if (!tituloLimpo) throw new Error("Informe o nome do processo.");
      const categoriaLimpa = categoria.trim() || "outro";
      const observacoesLimpas = observacoes.trim() || null;

      if (target.id) {
        const { error } = await supabase
          .from("processos")
          .update({
            titulo: tituloLimpo,
            categoria: categoriaLimpa,
            ...(observacoesLimpas ? { observacoes: observacoesLimpas } : {}),
          })
          .eq("id", target.id);
        if (error) throw error;
        return;
      }

      const { data, error } = await supabase
        .from("processos")
        .insert({
          titulo: tituloLimpo,
          categoria: categoriaLimpa,
          observacoes: observacoesLimpas,
        })
        .select()
        .single();
      if (error) throw error;

      if (target.documentoIds.length > 0) {
        const { error: linkError } = await supabase
          .from("documentos")
          .update({ processo_id: data.id })
          .in("id", target.documentoIds);
        if (linkError) throw linkError;
      }
    },
    onSuccess: () => {
      toast.success(isNew ? "Processo criado e documentos vinculados." : "Processo atualizado.");
      queryClient.invalidateQueries({ queryKey: ["documentos"] });
      queryClient.invalidateQueries({ queryKey: ["processos"] });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao salvar o processo."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {target ? (
          <>
            <DialogHeader>
              <DialogTitle>{isNew ? "Nomear processo" : "Editar processo"}</DialogTitle>
              <DialogDescription>
                {isNew
                  ? `Crie um processo e vincule os ${target.documentoIds.length} documento(s) deste bloco.`
                  : "Altere o nome e a categoria deste bloco de documentos."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="processo-titulo">Nome do processo</Label>
                <Input
                  id="processo-titulo"
                  placeholder="Ex: Marcelo Max Barbosa Melo · Lote 69/4"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="processo-categoria">Categoria</Label>
                <Input
                  id="processo-categoria"
                  placeholder="Ex: venda, locação, institucional"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="processo-observacoes">Observações</Label>
                <Textarea
                  id="processo-observacoes"
                  placeholder="Opcional"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>
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
