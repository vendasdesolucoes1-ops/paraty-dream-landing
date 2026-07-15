import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  DOCUMENTO_CATEGORIA_OPTIONS,
  type DocumentoCategoria,
  type DocumentoWithLead,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

export const Route = createFileRoute("/dashboard/documentos")({
  head: () => ({ meta: [{ title: "Documentos — Moradas de Paraty" }] }),
  component: DocumentosPage,
});

const ALL_CATEGORIAS = "todas";

function DocumentosPage() {
  const [categoriaFilter, setCategoriaFilter] = useState<DocumentoCategoria | "">("");
  const [search, setSearch] = useState("");
  const [selectedDocumento, setSelectedDocumento] = useState<DocumentoWithLead | null>(null);

  const {
    data: documentos,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["documentos", categoriaFilter, search],
    queryFn: async () => {
      let query = supabase
        .from("documentos")
        .select("*, lead:leads(id, nome)")
        .order("created_at", { ascending: false });

      if (categoriaFilter) query = query.eq("categoria", categoriaFilter);
      if (search.trim()) query = query.ilike("titulo", `%${search.trim()}%`);

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as DocumentoWithLead[];
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-muted-foreground">Arquivos</p>
          <h1 className="text-3xl font-display text-primary">Documentos</h1>
          <p className="text-muted-foreground">
            Contratos, propostas e documentos pessoais organizados por categoria e lead.
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-destructive">Erro ao carregar os documentos.</p>
      ) : !documentos || documentos.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            Nenhum documento encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documentos.map((documento) => (
            <DocumentoCard
              key={documento.id}
              documento={documento}
              onClick={() => setSelectedDocumento(documento)}
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
    </div>
  );
}
