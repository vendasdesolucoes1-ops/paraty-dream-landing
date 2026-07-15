import { FileImage, FileText, File as FileIcon } from "lucide-react";
import {
  DOCUMENTO_CATEGORIA_LABELS,
  formatBytes,
  isImageTipo,
  isPdfTipo,
} from "@/lib/documento-utils";
import type { DocumentoWithLead } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function DocumentoIcon({ tipoArquivo }: { tipoArquivo: string }) {
  if (isPdfTipo(tipoArquivo)) return <FileText className="h-8 w-8 text-forest-deep" />;
  if (isImageTipo(tipoArquivo)) return <FileImage className="h-8 w-8 text-forest-deep" />;
  return <FileIcon className="h-8 w-8 text-forest-deep" />;
}

export function DocumentoCard({
  documento,
  onClick,
}: {
  documento: DocumentoWithLead;
  onClick: () => void;
}) {
  return (
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
  );
}
