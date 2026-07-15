import type { DocumentoCategoria } from "@/lib/types";

export const DOCUMENTOS_BUCKET = "documentos-arquivo";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg"]);

export function isImageTipo(tipoArquivo: string) {
  return IMAGE_EXTENSIONS.has(tipoArquivo.toLowerCase());
}

export function isPdfTipo(tipoArquivo: string) {
  return tipoArquivo.toLowerCase() === "pdf";
}

export function extensionFromFile(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName !== file.name) return fromName.toLowerCase();
  const fromMime = file.type.split("/").pop();
  return (fromMime || "bin").toLowerCase();
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

// The browser-reported file.type is empty for some mobile camera captures
// and can't be trusted blindly, so it's cross-checked against the file
// extension and only used when it looks like a real MIME type (has a "/").
// Falling through to application/octet-stream (Storage's default when no
// contentType is sent) is what made Chrome refuse to render PDFs inline —
// it treats octet-stream as "unknown, must download" regardless of the
// iframe.
export function resolveContentType(file: File, extension: string): string {
  if (file.type && file.type.includes("/")) return file.type;
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const DOCUMENTO_CATEGORIA_LABELS: Record<DocumentoCategoria, string> = {
  institucional: "Institucional",
  contrato: "Contrato",
  documento_pessoal: "Documento Pessoal",
  proposta: "Proposta",
  outro: "Outro",
};
