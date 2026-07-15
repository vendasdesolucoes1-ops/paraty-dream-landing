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
