import { useState } from "react";
import { FileImage, FileText, File as FileIcon, Pencil, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DOCUMENTO_CATEGORIA_LABELS,
  DOCUMENTOS_BUCKET,
  formatBytes,
  isImageTipo,
  isPdfTipo,
} from "@/lib/documento-utils";
import { supabase } from "@/lib/supabase";
import type { DocumentoWithLead } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function DocumentoIcon({ tipoArquivo }: { tipoArquivo: string }) {
  if (isPdfTipo(tipoArquivo)) return <FileText className="h-8 w-8 text-forest-deep" />;
  if (isImageTipo(tipoArquivo)) return <FileImage className="h-8 w-8 text-forest-deep" />;
  return <FileIcon className="h-8 w-8 text-forest-deep" />;
}

export function DocumentoCard({
  documento,
  onClick,
  onEdit,
}: {
  documento: DocumentoWithLead;
  onClick: () => void;
  onEdit?: () => void;
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
      queryClient.invalidateQueries({ queryKey: ["documentos"] });
    },
    onError: (error) => {
      console.error("[DocumentoCard] delete failed", error);
      toast.error("Erro ao excluir documento");
    },
  });

  return (
    <>
      <Card
        className="shadow-sm cursor-pointer transition-colors hover:border-primary/40"
        onClick={onClick}
      >
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-md bg-secondary/60 p-2">
              <DocumentoIcon tipoArquivo={documento.tipo_arquivo} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm leading-tight truncate">{documento.titulo}</p>
              <p className="text-xs text-muted-foreground uppercase mt-0.5">
                {documento.tipo_arquivo} · {formatBytes(documento.tamanho_bytes)}
              </p>
            </div>
            {onEdit ? (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8"
                title="Editar documento"
                aria-label="Editar documento"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmOpen(true);
              }}
              aria-label="Excluir documento"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary" className="text-xs font-normal">
              {DOCUMENTO_CATEGORIA_LABELS[documento.categoria]}
            </Badge>
            {documento.lead ? (
              <Badge variant="outline" className="text-xs font-normal">
                {documento.lead.nome}
              </Badge>
            ) : null}
          </div>

          {documento.tags && documento.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {documento.tags.map((tag) => (
                <span key={tag} className="text-xs text-muted-foreground">
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O arquivo "{documento.titulo}" será removido
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
