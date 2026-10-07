// Estilo por tipo de arquivo e por categoria: um lugar só para a cor de cada
// coisa, sempre por token. Usado pelo cartão, pelo preview, pelo envio e pelo
// cabeçalho de cada processo.
import { File as FileIcon, FileImage, FileText, type LucideIcon } from "lucide-react";
import { isImageTipo, isPdfTipo } from "@/lib/documento-utils";
import type { DocumentoCategoria } from "@/lib/types";

/** Ícone e cor do selo conforme o arquivo: PDF, imagem ou outro. */
export function estiloArquivo(tipo: string): { icon: LucideIcon; selo: string } {
  if (isPdfTipo(tipo)) return { icon: FileText, selo: "bg-danger-soft text-danger" };
  if (isImageTipo(tipo)) return { icon: FileImage, selo: "bg-info-soft text-info" };
  return { icon: FileIcon, selo: "bg-muted text-muted-foreground" };
}

/** Cor de cada categoria (ponto da etiqueta e fatia da barra do processo). */
export const COR_CATEGORIA: Record<DocumentoCategoria, string> = {
  contrato: "bg-chart-3",
  escritura: "bg-chart-5",
  planta: "bg-chart-2",
  comprovante: "bg-chart-4",
  documento_pessoal: "bg-chart-6",
  proposta: "bg-chart-1",
  institucional: "bg-chart-muted",
  outro: "bg-chart-muted",
};
