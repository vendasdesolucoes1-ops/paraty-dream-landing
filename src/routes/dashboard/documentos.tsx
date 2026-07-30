import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronDown, Folder, Pencil, Plus, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  DOCUMENTO_CATEGORIA_OPTIONS,
  type DocumentoCategoria,
  type DocumentoWithLead,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DocumentoUploadDialog } from "@/components/documentos/documento-upload-dialog";
import { DocumentoCard } from "@/components/documentos/documento-card";
import { DocumentoPreviewDialog } from "@/components/documentos/documento-preview-dialog";
import { DocumentoEditDialog } from "@/components/documentos/documento-edit-dialog";
import {
  ProcessoEditDialog,
  type ProcessoEditTarget,
} from "@/components/documentos/processo-edit-dialog";

export const Route = createFileRoute("/dashboard/documentos")({
  head: () => ({ meta: [{ title: "Documentos — Moradas de Paraty" }] }),
  component: DocumentosPage,
});

const ALL_CATEGORIAS = "todas";

interface ProcessoGroup {
  key: string;
  titulo: string;
  categoria: string | null;
  documentos: DocumentoWithLead[];
}

function ProcessoSection({
  group,
  onSelect,
  onEdit,
  onEditProcesso,
}: {
  group: ProcessoGroup;
  onSelect: (documento: DocumentoWithLead) => void;
  onEdit: (documento: DocumentoWithLead) => void;
  onEditProcesso: (target: ProcessoEditTarget) => void;
}) {
  const [open, setOpen] = useState(true);
  const isRealProcesso = group.key !== "__sem_processo__";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="shadow-sm">
        <CardContent className="p-4 flex items-center gap-3">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-center gap-3 min-w-0 flex-1 text-left">
              <Folder className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg text-primary truncate">{group.titulo}</p>
              </div>
              {group.categoria ? (
                <Badge variant="secondary" className="text-xs font-normal shrink-0">
                  {group.categoria}
                </Badge>
              ) : null}
              <span className="text-xs text-muted-foreground shrink-0">
                {group.documentos.length} doc{group.documentos.length === 1 ? "" : "s"}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>
          </CollapsibleTrigger>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() =>
              onEditProcesso({
                id: isRealProcesso ? group.key : null,
                titulo: group.titulo,
                categoria: group.categoria,
                documentoIds: group.documentos.map((d) => d.id),
              })
            }
          >
            <Pencil className="h-4 w-4 mr-1" />
            {isRealProcesso ? "Renomear" : "Nomear"}
          </Button>
          {isRealProcesso ? (
            <DocumentoUploadDialog
              defaultProcesso={{ id: group.key, titulo: group.titulo }}
              trigger={
                <Button variant="outline" size="sm" className="shrink-0">
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar
                </Button>
              }
            />
          ) : null}
        </CardContent>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.documentos.map((documento) => (
                <DocumentoCard
                  key={documento.id}
                  documento={documento}
                  onClick={() => onSelect(documento)}
                  onEdit={() => onEdit(documento)}
                />
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function DocumentosPage() {
  const [categoriaFilter, setCategoriaFilter] = useState<DocumentoCategoria | "">("");
  const [search, setSearch] = useState("");
  const [selectedDocumento, setSelectedDocumento] = useState<DocumentoWithLead | null>(null);
  const [editingDocumento, setEditingDocumento] = useState<DocumentoWithLead | null>(null);

  const {
    data: documentos,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["documentos", categoriaFilter, search],
    queryFn: async () => {
      let query = supabase
        .from("documentos")
        .select(
          "*, lead:leads(id, nome), processo:processos(id, titulo, categoria), compra:compras(id, lote:lotes(numero_lote, quadra), cliente:clientes(id, nome))",
        )
        .order("created_at", { ascending: false });

      if (categoriaFilter) query = query.eq("categoria", categoriaFilter);
      if (search.trim()) query = query.ilike("titulo", `%${search.trim()}%`);

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as DocumentoWithLead[];
    },
  });

  const groups = useMemo<ProcessoGroup[]>(() => {
    const byProcesso = new Map<string, ProcessoGroup>();
    const orphans: DocumentoWithLead[] = [];

    for (const documento of documentos ?? []) {
      if (documento.processo_id && documento.processo) {
        const existing = byProcesso.get(documento.processo_id);
        if (existing) {
          existing.documentos.push(documento);
        } else {
          byProcesso.set(documento.processo_id, {
            key: documento.processo_id,
            titulo: documento.processo.titulo,
            categoria: documento.processo.categoria,
            documentos: [documento],
          });
        }
      } else {
        orphans.push(documento);
      }
    }

    const result = Array.from(byProcesso.values()).sort((a, b) =>
      a.titulo.localeCompare(b.titulo, "pt-BR"),
    );

    if (orphans.length > 0) {
      result.push({
        key: "__sem_processo__",
        titulo: "Sem processo",
        categoria: null,
        documentos: orphans,
      });
    }

    return result;
  }, [documentos]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-muted-foreground">Arquivos</p>
          <h1 className="text-3xl font-display text-primary">Documentos</h1>
          <p className="text-muted-foreground">
            Documentos agrupados por processo — contratos, propostas e arquivos institucionais.
          </p>
        </div>
        <DocumentoUploadDialog
          trigger={
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Enviar Documento
            </Button>
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={categoriaFilter || ALL_CATEGORIAS}
          onValueChange={(v) =>
            setCategoriaFilter(v === ALL_CATEGORIAS ? "" : (v as DocumentoCategoria))
          }
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIAS}>Todas as categorias</SelectItem>
            {DOCUMENTO_CATEGORIA_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Buscar por título"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-destructive">Erro ao carregar os documentos.</p>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            Nenhum documento encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <ProcessoSection
              key={group.key}
              group={group}
              onSelect={setSelectedDocumento}
              onEdit={setEditingDocumento}
            />
          ))}
        </div>
      )}

      <DocumentoPreviewDialog
        documento={selectedDocumento}
        open={!!selectedDocumento}
        onOpenChange={(open) => {
          if (!open) setSelectedDocumento(null);
        }}
      />

      <DocumentoEditDialog
        documento={editingDocumento}
        open={!!editingDocumento}
        onOpenChange={(open) => {
          if (!open) setEditingDocumento(null);
        }}
      />
    </div>
  );
}
