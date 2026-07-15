import { useEffect, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
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
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open || !documento) {
      setSignedUrl(null);
      setBlobUrl(null);
      setError(null);
      return;
    }

    let cancelled = false;
    let createdBlobUrl: string | null = null;
    setLoading(true);
    setSignedUrl(null);
    setBlobUrl(null);
    setError(null);

    (async () => {
      try {
        const { data, error: signError } = await supabase.storage
          .from(DOCUMENTOS_BUCKET)
          .createSignedUrl(documento.storage_path, SIGNED_URL_TTL_SECONDS);
        if (signError) throw signError;
        const url = data?.signedUrl ?? null;
        if (cancelled) return;
        setSignedUrl(url);

        // For PDFs, fetch as blob so we can render via same-origin blob URL,
        // which avoids Chrome's occasional "Esta página foi bloqueada pelo Chrome"
        // block on cross-origin PDF iframes.
        if (url && isPdfTipo(documento.tipo_arquivo)) {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Falha ao baixar arquivo (${response.status})`);
          const blob = await response.blob();
          const pdfBlob =
            blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
          createdBlobUrl = URL.createObjectURL(pdfBlob);
          if (cancelled) {
            URL.revokeObjectURL(createdBlobUrl);
            return;
          }
          setBlobUrl(createdBlobUrl);
        }
      } catch (err) {
        console.error("[DocumentoPreviewDialog] preview failed", err);
        if (!cancelled) setError("Erro ao gerar link de visualização.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (createdBlobUrl) URL.revokeObjectURL(createdBlobUrl);
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

  const pdfSrc = blobUrl ?? signedUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        {documento ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between gap-4 pr-6">
                <span className="truncate">{documento.titulo}</span>
                <div className="flex items-center gap-2">
                  {signedUrl ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(signedUrl, "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Abrir
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    disabled={downloading}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {downloading ? "Gerando..." : "Baixar"}
                  </Button>
                </div>
              </DialogTitle>
            </DialogHeader>

            <div className="min-h-[60vh] flex items-center justify-center">
              {loading ? (
                <Skeleton className="h-[60vh] w-full" />
              ) : error || (!signedUrl && !blobUrl) ? (
                <p className="text-sm text-destructive">
                  {error ?? "Erro ao gerar link de visualização."}
                </p>
              ) : isPdfTipo(documento.tipo_arquivo) && pdfSrc ? (
                <object
                  data={pdfSrc}
                  type="application/pdf"
                  className="w-full h-[70vh] border rounded-md"
                >
                  <div className="p-6 text-center text-sm text-muted-foreground space-y-3">
                    <p>
                      Seu navegador bloqueou a pré-visualização do PDF. Use os botões abaixo para
                      abrir ou baixar o arquivo.
                    </p>
                    <div className="flex justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          window.open(signedUrl ?? pdfSrc, "_blank", "noopener,noreferrer")
                        }
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Abrir em nova aba
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleDownload}>
                        <Download className="h-4 w-4 mr-2" />
                        Baixar
                      </Button>
                    </div>
                  </div>
                </object>
              ) : isImageTipo(documento.tipo_arquivo) && signedUrl ? (
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
