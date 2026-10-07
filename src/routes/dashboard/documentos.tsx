import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  FileText,
  Folder,
  Pencil,
  Plus,
  Search,
  SearchX,
  Upload,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  DOCUMENTO_CATEGORIA_OPTIONS,
  type DocumentoCategoria,
  type DocumentoWithLead,
} from "@/lib/types";
import { DOCUMENTO_CATEGORIA_LABELS, formatBytes } from "@/lib/documento-utils";
import { useMontado } from "@/hooks/use-montado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Chip } from "@/components/ds/chip";
import { Pill } from "@/components/ds/pill";
import { QueryState } from "@/components/ds/query-state";
import { Reveal, atraso } from "@/components/ds/reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { DocumentoUploadDialog } from "@/components/documentos/documento-upload-dialog";
import { DocumentoCard } from "@/components/documentos/documento-card";
import { DocumentoPreviewDialog } from "@/components/documentos/documento-preview-dialog";
import { DocumentoEditDialog } from "@/components/documentos/documento-edit-dialog";
import { COR_CATEGORIA } from "@/components/documentos/documento-estilo";
import { ResumoFaixa } from "@/components/documentos/resumo-faixa";
import {
  ProcessoEditDialog,
  type ProcessoEditTarget,
} from "@/components/documentos/processo-edit-dialog";

export const Route = createFileRoute("/dashboard/documentos")({
  head: () => ({ meta: [{ title: "Documentos — Moradas de Paraty" }] }),
  component: DocumentosPage,
});

const SEM_PROCESSO = "__sem_processo__";

interface ProcessoGroup {
  key: string;
  titulo: string;
  categoria: string | null;
  documentos: DocumentoWithLead[];
}

/** Quantos documentos de cada categoria, na ordem em que a lista de categorias as traz. */
function porCategoria(documentos: DocumentoWithLead[]) {
  return DOCUMENTO_CATEGORIA_OPTIONS.map((opt) => ({
    categoria: opt.value,
    total: documentos.filter((d) => d.categoria === opt.value).length,
  })).filter((c) => c.total > 0);
}

/**
 * Barra do processo: uma fatia por categoria de documento, do tamanho da sua
 * parte. Cresce da esquerda ao abrir a tela. Leitura em texto logo abaixo.
 */
function BarraCategorias({
  documentos,
  ordem,
}: {
  documentos: DocumentoWithLead[];
  ordem: number;
}) {
  const montado = useMontado(140 + Math.min(ordem * 70, 420));
  const partes = porCategoria(documentos);
  return (
    <span className="mt-2.5 block max-w-sm">
      <span
        aria-hidden
        className={cn(
          "flex h-1.5 origin-left gap-0.5 overflow-hidden rounded-full transition-transform duration-700 ease-[var(--ease-out)] motion-reduce:transition-none",
          montado ? "scale-x-100" : "scale-x-0",
        )}
      >
        {partes.map((p) => (
          <span
            key={p.categoria}
            style={{ flexGrow: p.total, flexBasis: 0 }}
            className={cn("rounded-full", COR_CATEGORIA[p.categoria])}
          />
        ))}
      </span>
      <span className="mt-2 hidden flex-wrap gap-x-3 gap-y-0.5 text-[0.72rem] text-muted-foreground sm:flex">
        {partes.map((p) => (
          <span key={p.categoria} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn("h-1.5 w-1.5 rounded-full", COR_CATEGORIA[p.categoria])}
            />
            {DOCUMENTO_CATEGORIA_LABELS[p.categoria]}
            <span className="tabular-nums text-foreground">{p.total}</span>
          </span>
        ))}
      </span>
    </span>
  );
}

function ProcessoSection({
  group,
  ordem,
  onSelect,
  onEdit,
  onEditProcesso,
}: {
  group: ProcessoGroup;
  ordem: number;
  onSelect: (documento: DocumentoWithLead) => void;
  onEdit: (documento: DocumentoWithLead) => void;
  onEditProcesso: (target: ProcessoEditTarget) => void;
}) {
  const [open, setOpen] = useState(true);
  const isRealProcesso = group.key !== SEM_PROCESSO;

  return (
    <div className="animate-swap" style={atraso(ordem, 70, 420)}>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:px-5">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="group/trig flex min-w-0 flex-1 basis-64 items-center gap-3.5 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card"
            >
              <span
                aria-hidden
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors duration-200",
                  isRealProcesso
                    ? "bg-secondary text-secondary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Folder className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-sans text-[0.9375rem] font-semibold leading-tight text-foreground">
                    {group.titulo}
                  </span>
                  {group.categoria ? <Pill className="shrink-0">{group.categoria}</Pill> : null}
                </span>
                <span className="mt-1 block text-[0.8125rem] tabular-nums text-muted-foreground">
                  {group.documentos.length} doc{group.documentos.length === 1 ? "" : "s"}
                </span>
                <BarraCategorias documentos={group.documentos} ordem={ordem} />
              </span>
              <ChevronDown
                aria-hidden
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[var(--ease-out)] group-hover/trig:text-foreground",
                  open && "rotate-180",
                )}
              />
            </button>
          </CollapsibleTrigger>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onEditProcesso({
                  id: isRealProcesso ? group.key : null,
                  titulo: group.titulo,
                  categoria: group.categoria,
                  documentoIds: group.documentos.map((d) => d.id),
                })
              }
            >
              <Pencil className="h-4 w-4" aria-hidden />
              {isRealProcesso ? "Renomear" : "Nomear"}
            </Button>
            {isRealProcesso ? (
              <DocumentoUploadDialog
                defaultProcesso={{ id: group.key, titulo: group.titulo }}
                trigger={
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4" aria-hidden />
                    Adicionar
                  </Button>
                }
              />
            ) : null}
          </div>
        </div>

        <CollapsibleContent className="border-t border-border data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-200">
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
            {group.documentos.map((documento, i) => (
              <DocumentoCard
                key={documento.id}
                documento={documento}
                indice={i}
                onClick={() => onSelect(documento)}
                onEdit={() => onEdit(documento)}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function EsqueletoGrupos() {
  return (
    <div className="space-y-4" aria-hidden>
      {Array.from({ length: 2 }, (_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:p-5"
        >
          <div className="flex items-center gap-3.5">
            <div className="skeleton-shimmer h-11 w-11 shrink-0 rounded-xl bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="skeleton-shimmer h-4 w-1/3 rounded bg-muted" />
              <div className="skeleton-shimmer h-3 w-16 rounded bg-muted" />
              <div className="skeleton-shimmer h-1.5 w-full max-w-sm rounded-full bg-muted" />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, j) => (
              <div key={j} className="skeleton-shimmer h-[7.25rem] rounded-xl bg-muted" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DocumentosPage() {
  const [categoriaFilter, setCategoriaFilter] = useState<DocumentoCategoria | "">("");
  const [search, setSearch] = useState("");
  const [selectedDocumento, setSelectedDocumento] = useState<DocumentoWithLead | null>(null);
  const [editingDocumento, setEditingDocumento] = useState<DocumentoWithLead | null>(null);
  const [editingProcesso, setEditingProcesso] = useState<ProcessoEditTarget | null>(null);
  // Última lista carregada: enquanto a busca ou o filtro novo chega, a anterior
  // fica na tela (esmaecida) em vez de piscar o esqueleto.
  const [ultimos, setUltimos] = useState<DocumentoWithLead[] | undefined>(undefined);

  const query = useQuery({
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

  useEffect(() => {
    if (query.data) setUltimos(query.data);
  }, [query.data]);

  const dados = query.data ?? ultimos;
  const desatualizado = query.data === undefined && dados !== undefined;
  const estado = {
    data: dados,
    isPending: dados === undefined && query.isPending,
    isError: query.isError,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  };

  const groups = useMemo<ProcessoGroup[]>(() => {
    const byProcesso = new Map<string, ProcessoGroup>();
    const orphans: DocumentoWithLead[] = [];

    for (const documento of dados ?? []) {
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
  }, [dados]);

  const resumo = useMemo(() => {
    const lista = dados ?? [];
    return {
      documentos: lista.length,
      processos: groups.filter((g) => g.key !== SEM_PROCESSO).length,
      bytes: lista.reduce((soma, d) => soma + (d.tamanho_bytes ?? 0), 0),
    };
  }, [dados, groups]);

  const filtrando = Boolean(categoriaFilter) || search.trim().length > 0;

  return (
    <div className="space-y-8">
      <Reveal ordem={0}>
        <PageHeader
          eyebrow="Arquivos"
          title="Documentos"
          description="Documentos agrupados por processo — contratos, propostas e arquivos institucionais."
          action={
            <DocumentoUploadDialog
              trigger={
                <Button>
                  <Upload className="h-4 w-4" aria-hidden />
                  Enviar Documento
                </Button>
              }
            />
          }
        />
      </Reveal>

      <Reveal ordem={1}>
        <ResumoFaixa
          rotulo="Resumo dos documentos"
          carregando={dados === undefined}
          itens={[
            {
              rotulo: "Documentos",
              valor: resumo.documentos,
              rodape: filtrando ? "no filtro" : "arquivados",
            },
            { rotulo: "Processos", valor: resumo.processos, rodape: "com documentos" },
            { rotulo: "Armazenado", texto: formatBytes(resumo.bytes), rodape: "em arquivos" },
          ]}
        />
      </Reveal>

      <Reveal ordem={2} className="space-y-6">
        <div className="space-y-4">
          <div className="relative w-full sm:w-96">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Buscar por título"
              aria-label="Buscar documento por título"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-9"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>

          <div
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
            role="group"
            aria-label="Filtrar por categoria"
          >
            <Chip ativo={categoriaFilter === ""} onClick={() => setCategoriaFilter("")}>
              Todas as categorias
            </Chip>
            {DOCUMENTO_CATEGORIA_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                ativo={categoriaFilter === opt.value}
                onClick={() => setCategoriaFilter(opt.value)}
              >
                {opt.label}
              </Chip>
            ))}
          </div>
        </div>

        <div
          className={cn(
            "transition-opacity duration-200",
            desatualizado && "pointer-events-none opacity-60",
          )}
          aria-busy={desatualizado}
        >
          <QueryState
            query={estado}
            skeleton={<EsqueletoGrupos />}
            isEmpty={() => groups.length === 0}
            empty={
              <EmptyState
                icon={filtrando ? SearchX : FileText}
                title="Nenhum documento encontrado"
                description="Envie um documento ou ajuste os filtros de busca."
                action={
                  filtrando ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCategoriaFilter("");
                        setSearch("");
                      }}
                    >
                      Limpar filtros
                    </Button>
                  ) : undefined
                }
              />
            }
          >
            {() => (
              <div key={categoriaFilter} className="space-y-4">
                {groups.map((group, i) => (
                  <ProcessoSection
                    key={group.key}
                    group={group}
                    ordem={i}
                    onSelect={setSelectedDocumento}
                    onEdit={setEditingDocumento}
                    onEditProcesso={setEditingProcesso}
                  />
                ))}
              </div>
            )}
          </QueryState>
        </div>
      </Reveal>

      <DocumentoPreviewDialog
        documento={selectedDocumento}
        open={!!selectedDocumento}
        onOpenChange={(open) => {
          if (!open) setSelectedDocumento(null);
        }}
      />

      <ProcessoEditDialog
        target={editingProcesso}
        open={!!editingProcesso}
        onOpenChange={(open) => {
          if (!open) setEditingProcesso(null);
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
