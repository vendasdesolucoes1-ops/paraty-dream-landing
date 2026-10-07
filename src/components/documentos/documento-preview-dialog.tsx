import { useEffect, useState } from "react";
import { AlertCircle, Download, ExternalLink, FileQuestion } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DOCUMENTOS_BUCKET, formatBytes, isImageTipo, isPdfTipo } from "@/lib/documento-utils";
import type { DocumentoWithLead } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CategoriaTag, IconeArquivo } from "@/components/documentos/pecas";

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
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        {documento ? (
          <>
            <DialogHeader className="flex-row flex-wrap items-center gap-x-4 gap-y-3 space-y-0 border-b border-border px-6 py-4 pr-14 text-left">
              <IconeArquivo tipo={documento.tipo_arquivo} />
              <div className="min-w-0 flex-1 basis-48">
                <DialogTitle className="truncate font-sans text-[1.0625rem] font-semibold leading-snug tracking-[-0.014em]">
                  {documento.titulo}
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem]">
                    <CategoriaTag categoria={documento.categoria} />
                    <span className="tabular-nums">
                      <span className="uppercase">{documento.tipo_arquivo}</span>
                      {" · "}
                      {formatBytes(documento.tamanho_bytes)}
                    </span>
                  </div>
                </DialogDescription>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {signedUrl ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(signedUrl, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    Abrir
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={handleDownload} disabled={downloading}>
                  <Download className="h-4 w-4" aria-hidden />
                  {downloading ? "Gerando..." : "Baixar"}
                </Button>
              </div>
            </DialogHeader>

            <div className="flex min-h-[40vh] items-center justify-center overflow-y-auto bg-muted/40 p-4 sm:p-6">
              {loading ? (
                <div
                  aria-hidden
                  className="skeleton-shimmer h-[min(62vh,44rem)] w-full rounded-xl bg-muted"
                />
              ) : error || (!signedUrl && !blobUrl) ? (
                <div
                  role="alert"
                  className="animate-swap flex flex-col items-center gap-3 py-12 text-center"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-danger-soft text-danger">
                    <AlertCircle className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="text-sm text-foreground">
                    {error ?? "Erro ao gerar link de visualização."}
                  </p>
                </div>
              ) : isPdfTipo(documento.tipo_arquivo) && pdfSrc ? (
                <object
                  data={pdfSrc}
                  type="application/pdf"
                  className="animate-swap h-[min(70vh,48rem)] w-full rounded-xl border border-border bg-card shadow-[var(--shadow-card)]"
                >
                  <div className="space-y-4 p-6 text-center text-sm text-muted-foreground">
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
                        <ExternalLink className="h-4 w-4" aria-hidden />
                        Abrir em nova aba
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleDownload}>
                        <Download className="h-4 w-4" aria-hidden />
                        Baixar
                      </Button>
                    </div>
                  </div>
                </object>
              ) : isImageTipo(documento.tipo_arquivo) && signedUrl ? (
                <img
                  src={signedUrl}
                  alt={documento.titulo}
                  className="animate-swap max-h-[70vh] max-w-full rounded-xl object-contain shadow-[var(--shadow-card)] ring-1 ring-border"
                />
              ) : (
                <div className="animate-swap flex flex-col items-center gap-3 py-12 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-card text-muted-foreground shadow-[var(--shadow-card)] ring-1 ring-border">
                    <FileQuestion className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="max-w-xs text-sm text-muted-foreground">
                    Pré-visualização não disponível para este tipo de arquivo. Use o botão
                    &ldquo;Baixar&rdquo;.
                  </p>
                </div>
              )}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
