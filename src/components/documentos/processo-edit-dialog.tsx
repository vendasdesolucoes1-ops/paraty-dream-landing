import { useEffect, useState, type FormEvent } from "react";
import { Folder, FolderPlus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Campo } from "@/components/documentos/pecas";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ds/kbd";

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!mutation.isPending) mutation.mutate();
  }

  const Icone = isNew ? FolderPlus : Folder;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        {target ? (
          <>
            <DialogHeader className="flex-row items-center gap-4 space-y-0 border-b border-border px-6 pb-5 pr-14 pt-6 text-left">
              <span
                aria-hidden
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"
              >
                <Icone className="h-5 w-5" />
              </span>
              <div className="min-w-0 space-y-1.5">
                <DialogTitle>{isNew ? "Nomear processo" : "Editar processo"}</DialogTitle>
                <DialogDescription className="text-[0.8125rem] leading-snug">
                  {isNew
                    ? `Crie um processo e vincule os ${target.documentoIds.length} documento(s) deste bloco.`
                    : "Altere o nome e a categoria deste bloco de documentos."}
                </DialogDescription>
              </div>
            </DialogHeader>

            <form
              id="form-processo"
              onSubmit={handleSubmit}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.requestSubmit();
                }
              }}
              className="space-y-4 px-6 py-6"
            >
              <Campo id="processo-titulo" label="Nome do processo" obrigatorio>
                <Input
                  id="processo-titulo"
                  autoFocus
                  autoComplete="off"
                  placeholder="Ex: Marcelo Max Barbosa Melo · Lote 69/4"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                />
              </Campo>

              <Campo id="processo-categoria" label="Categoria">
                <Input
                  id="processo-categoria"
                  autoComplete="off"
                  placeholder="Ex: venda, locação, institucional"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                />
              </Campo>

              <Campo id="processo-observacoes" label="Observações">
                <Textarea
                  id="processo-observacoes"
                  rows={3}
                  placeholder="Opcional"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </Campo>
            </form>

            <DialogFooter className="relative flex-row items-center justify-between gap-3 space-x-0 border-t border-border bg-card px-6 py-4 sm:justify-between">
              {mutation.isPending ? (
                <span
                  aria-hidden
                  className="skeleton-shimmer absolute inset-x-0 -top-px h-0.5 bg-accent/60"
                />
              ) : null}
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                <Kbd>⌘</Kbd>
                <Kbd>↵</Kbd> salvar
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" form="form-processo" disabled={mutation.isPending}>
                  {mutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
