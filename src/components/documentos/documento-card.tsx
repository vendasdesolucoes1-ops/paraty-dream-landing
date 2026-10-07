import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DOCUMENTOS_BUCKET, formatBytes } from "@/lib/documento-utils";
import { atraso } from "@/components/ds/reveal";
import { Pill } from "@/components/ds/pill";
import { formatDiaCurto } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { compraLabel, type DocumentoWithLead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CategoriaTag, IconeArquivo } from "@/components/documentos/pecas";

const ACAO =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function DocumentoCard({
  documento,
  onClick,
  onEdit,
  indice = 0,
}: {
  documento: DocumentoWithLead;
  onClick: () => void;
  onEdit?: () => void;
  /** Posição na lista, para a entrada em cascata. */
  indice?: number;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error: storageError } = await supabase.storage
        .from(DOCUMENTOS_BUCKET)
        .remove([documento.storage_path]);
      if (storageError) {
        console.error("[DocumentoCard] storage remove failed", storageError);
      }
      const { error } = await supabase.from("documentos").delete().eq("id", documento.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento excluído");
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["documentos"] });
    },
    onError: (error) => {
      console.error("[DocumentoCard] delete failed", error);
      toast.error("Erro ao excluir documento");
    },
  });

  return (
    <>
      {/* A entrada (animate-swap) e o hover (card-hover) usam `transform`: em
          elementos separados, senão a animação prende o hover. */}
      <div className="animate-swap h-full" style={atraso(indice, 45, 360)}>
        <div className="card-hover group/doc relative flex h-full items-start gap-3.5 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] focus-within:border-foreground/30">
          <IconeArquivo tipo={documento.tipo_arquivo} />

          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onClick}
              aria-label={`Abrir ${documento.titulo}`}
              className="block max-w-full truncate rounded-sm text-left text-[0.9375rem] font-semibold leading-tight text-foreground after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              {documento.titulo}
            </button>
            <p className="mt-1 truncate text-[0.75rem] tabular-nums text-muted-foreground">
              <span className="uppercase">{documento.tipo_arquivo}</span>
              {" · "}
              {formatBytes(documento.tamanho_bytes)}
              {documento.created_at ? ` · ${formatDiaCurto(documento.created_at)}` : null}
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <CategoriaTag categoria={documento.categoria} />
              {documento.lead ? (
                <Pill className="max-w-full">
                  <span className="truncate">{documento.lead.nome}</span>
                </Pill>
              ) : null}
              {documento.compra ? (
                <Pill tone="info" className="max-w-full">
                  <span className="truncate">{compraLabel(documento.compra)}</span>
                </Pill>
              ) : null}
            </div>

            {documento.tags && documento.tags.length > 0 ? (
              <p className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[0.75rem] text-muted-foreground">
                {documento.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </p>
            ) : null}
          </div>

          <div
            className={cn(
              "relative z-10 -mr-1.5 -mt-1.5 flex shrink-0 items-center gap-0.5 transition-opacity duration-150",
              "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/doc:opacity-100 [@media(hover:hover)]:group-focus-within/doc:opacity-100",
            )}
          >
            {onEdit ? (
              <button
                type="button"
                className={ACAO}
                title="Editar documento"
                aria-label={`Editar ${documento.titulo}`}
                onClick={onEdit}
              >
                <Pencil className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              className={cn(ACAO, "hover:bg-danger-soft hover:text-danger")}
              title="Excluir documento"
              aria-label={`Excluir ${documento.titulo}`}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="items-center gap-3 text-center sm:items-start sm:text-left">
            <span
              aria-hidden
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-danger-soft text-danger"
            >
              <Trash2 className="h-5 w-5" />
            </span>
            <DialogTitle className="font-sans text-[1.0625rem] font-semibold leading-snug tracking-[-0.014em]">
              Excluir documento?
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              Esta ação não pode ser desfeita. O arquivo &ldquo;{documento.titulo}&rdquo; será
              removido permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              type="button"
              variant="ghost"
              disabled={deleteMutation.isPending}
              onClick={() => setConfirmOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
