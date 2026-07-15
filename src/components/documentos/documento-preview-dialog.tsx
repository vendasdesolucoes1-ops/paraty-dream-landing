import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DOCUMENTOS_BUCKET, isImageTipo, isPdfTipo } from "@/lib/documento-utils";
import type { DocumentoWithLead } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const SIGNED_URL_TTL_SECONDS = 60 * 5;

export function DocumentoPreviewDialog({
  documento,
  open,
  onOpenChange,
}: {
  documento: DocumentoWithLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open || !documento) {
      setSignedUrl(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setSignedUrl(null);

    supabase.storage
      .from(DOCUMENTOS_BUCKET)
      .createSignedUrl(documento.storage_path, SIGNED_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[DocumentoPreviewDialog] createSignedUrl failed", error);
          return;
        }
        setSignedUrl(data?.signedUrl ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, documento]);

  async function handleDownload() {
    if (!documento) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage
        .from(DOCUMENTOS_BUCKET)
        .createSignedUrl(documento.storage_path, SIGNED_URL_TTL_SECONDS, { download: true });
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    } catch (error) {
      console.error("[DocumentoPreviewDialog] download signed URL failed", error);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        {documento ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between gap-4 pr-6">
                <span className="truncate">{documento.titulo}</span>
                <Button variant="outline" size="sm" onClick={handleDownload} disabled={downloading}>
                  <Download className="h-4 w-4 mr-2" />
                  {downloading ? "Gerando..." : "Baixar"}
                </Button>
              </DialogTitle>
            </DialogHeader>

            <div className="min-h-[60vh] flex items-center justify-center">
              {loading ? (
                <Skeleton className="h-[60vh] w-full" />
              ) : !signedUrl ? (
                <p className="text-sm text-destructive">Erro ao gerar link de visualização.</p>
              ) : isPdfTipo(documento.tipo_arquivo) ? (
                <iframe
                  src={signedUrl}
                  title={documento.titulo}
                  className="w-full h-[70vh] border rounded-md"
                />
              ) : isImageTipo(documento.tipo_arquivo) ? (
                <img
                  src={signedUrl}
                  alt={documento.titulo}
                  className="max-h-[70vh] max-w-full rounded-md object-contain"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Pré-visualização não disponível para este tipo de arquivo. Use o botão "Baixar".
                </p>
              )}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
