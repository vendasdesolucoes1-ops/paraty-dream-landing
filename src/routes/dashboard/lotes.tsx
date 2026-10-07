import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  Box,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Map as MapIcon,
  MapPinned,
  Pencil,
  Plus,
  Search,
  Table2,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Chip } from "@/components/ds/chip";
import { Pill } from "@/components/ds/pill";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import { Reveal, atraso } from "@/components/ds/reveal";
import { EmptyState } from "@/components/dashboard/empty-state";
import { LoteStatusEditableBadge } from "@/components/dashboard/status-badge";
import { LOTE_STATUS_DOT } from "@/components/dashboard/lote-status";
import { LoteFormDialog } from "@/components/dashboard/lote-form-dialog";
import { LotePlantaViewer } from "@/components/dashboard/lote-planta-viewer";
import { PageHeader } from "@/components/dashboard/page-header";
import { ResumoLotes } from "@/components/lotes/resumo-lotes";
import { Segmentado } from "@/components/visoes/segmentado";
import { cn } from "@/lib/utils";
import type { Lote, LoteStatus, LoteTipo } from "@/lib/types";

// three.js + @react-three/fiber pesam ~1MB — carregado só quando o usuário de
// fato abre a aba 3D, não em toda visita à página de Lotes (Tabela/Planta).
const Loteamento3DView = lazy(() =>
  import("@/components/loteamento-3d/Loteamento3DView").then((m) => ({
    default: m.Loteamento3DView,
  })),
);

const VIEW_STORAGE_KEY = "lotes-view";
type LotesView = "tabela" | "planta" | "3d";

export const Route = createFileRoute("/dashboard/lotes")({
  head: () => ({ meta: [{ title: "Lotes — Moradas de Paraty" }] }),
  component: LotesPage,
});

const QUADRA_OPTIONS = Array.from({ length: 10 }, (_, i) => String(i + 1));
const PAGE_SIZE = 20;

const STATUS_CHIPS: { value: LoteStatus; label: string }[] = [
  { value: "disponivel", label: "Disponível" },
  { value: "reservado", label: "Reservado" },
  { value: "vendido", label: "Vendido" },
];

// Empty string means "no filter applied" for every field below.
type MetragemFilter = "" | "ate200" | "200-300" | "300-400" | "acima400";

// Sentinel values for the Radix Select items, which cannot use an empty string.
// They map to/from the real (empty-string) filter state at the UI boundary only.
const ALL_QUADRAS = "todas";
const ALL_METRAGENS = "todas";

const TIPO_TONE = {
  residencial: "info",
  comercial: "accent",
} as const satisfies Record<LoteTipo, "info" | "accent">;

const TIPO_LABELS: Record<LoteTipo, string> = {
  residencial: "Residencial",
  comercial: "Comercial",
};

function formatCurrency(value: number | null) {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatMetragem(value: number | null) {
  if (value == null) return "—";
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

function LotesPage() {
  const queryClient = useQueryClient();

  // Initial state: no filter active.
  const [quadraFilter, setQuadraFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<LoteStatus | "">("");
  const [tipoFilter, setTipoFilter] = useState<LoteTipo | "">("");
  const [metragemFilter, setMetragemFilter] = useState<MetragemFilter>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingLote, setEditingLote] = useState<Lote | null>(null);
  const [view, setView] = useState<LotesView>(() => {
    if (typeof window === "undefined") return "tabela";
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === "planta" || stored === "3d" ? stored : "tabela";
  });

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  const lotesQuery = useQuery({
    queryKey: ["lotes", quadraFilter, statusFilter, tipoFilter, metragemFilter, search],
    queryFn: async () => {
      let query = supabase
        .from("lotes")
        .select("*")
        .order("quadra", { ascending: true })
        .order("numero_lote", { ascending: true });

      // Only apply a filter clause when the corresponding value is non-empty.
      if (quadraFilter) query = query.eq("quadra", quadraFilter);
      if (statusFilter) query = query.eq("status", statusFilter);
      if (tipoFilter) query = query.eq("tipo", tipoFilter);
      if (search.trim()) query = query.ilike("numero_lote", `%${search.trim()}%`);

      if (metragemFilter === "ate200") {
        query = query.lte("metragem", 200);
      } else if (metragemFilter === "200-300") {
        query = query.gt("metragem", 200).lte("metragem", 300);
      } else if (metragemFilter === "300-400") {
        query = query.gt("metragem", 300).lte("metragem", 400);
      } else if (metragemFilter === "acima400") {
        query = query.gt("metragem", 400);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Lote[];
    },
  });

  const { data: lotes, isLoading, isError } = lotesQuery;

  const { data: summary, isError: summaryError } = useQuery({
    queryKey: ["lotes-summary"],
    queryFn: async () => {
      const [disponiveis, reservados, vendidos] = await Promise.all([
        supabase
          .from("lotes")
          .select("id", { count: "exact", head: true })
          .eq("status", "disponivel"),
        supabase
          .from("lotes")
          .select("id", { count: "exact", head: true })
          .eq("status", "reservado"),
        supabase.from("lotes").select("id", { count: "exact", head: true }).eq("status", "vendido"),
      ]);
      const firstError = disponiveis.error ?? reservados.error ?? vendidos.error;
      if (firstError) throw firstError;
      return {
        disponiveis: disponiveis.count ?? 0,
        reservados: reservados.count ?? 0,
        vendidos: vendidos.count ?? 0,
      };
    },
  });

  const deleteMutation = useMemo(
    () => async (id: string) => {
      const { error } = await supabase.from("lotes").delete().eq("id", id);
      if (error) {
        window.alert("Erro ao excluir o lote.");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["lotes"] });
      queryClient.invalidateQueries({ queryKey: ["lotes-summary"] });
    },
    [queryClient],
  );

  const filtered = lotes ?? [];
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length);

  function updateFilter<T>(setter: (v: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  function clearFilters() {
    setQuadraFilter("");
    setStatusFilter("");
    setTipoFilter("");
    setMetragemFilter("");
    setSearch("");
    setPage(1);
  }

  const hasActiveFilters =
    quadraFilter !== "" ||
    statusFilter !== "" ||
    tipoFilter !== "" ||
    metragemFilter !== "" ||
    search.trim() !== "";

  const filtrosKey = [quadraFilter, statusFilter, tipoFilter, metragemFilter, search].join("|");
  const consulta = {
    data: filtered,
    isPending: isLoading,
    isError,
    isRefetching: lotesQuery.isRefetching,
    refetch: lotesQuery.refetch,
  };

  const vazio = (
    <EmptyState
      icon={MapPinned}
      title="Nenhum lote encontrado."
      description={
        hasActiveFilters
          ? "Nenhum lote combina com os filtros escolhidos. Ajuste ou limpe os filtros."
          : "Cadastre o primeiro lote para começar o estoque."
      }
      action={
        hasActiveFilters ? (
          <Button variant="outline" onClick={clearFilters}>
            Limpar filtros
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto w-full max-w-[1200px] space-y-8">
        <Reveal ordem={0}>
          <PageHeader
            eyebrow="Loteamento"
            title="Lotes"
            description="Gestão do estoque de lotes — Loteamento Residencial Sophia Saíde"
            action={
              <>
                <Segmentado
                  rotulo="Visualização dos lotes"
                  valor={view}
                  onChange={setView}
                  opcoes={[
                    { valor: "tabela", rotulo: "Tabela", icone: <Table2 aria-hidden /> },
                    { valor: "planta", rotulo: "Planta", icone: <MapIcon aria-hidden /> },
                    { valor: "3d", rotulo: "3D", icone: <Box aria-hidden /> },
                  ]}
                />
                <LoteFormDialog
                  trigger={
                    <Button>
                      <Plus className="h-4 w-4" aria-hidden />
                      Novo Lote
                    </Button>
                  }
                />
              </>
            }
          />
        </Reveal>

        <Reveal ordem={1}>
          <ResumoLotes
            dados={summary}
            erro={summaryError}
            statusAtivo={statusFilter}
            onSelecionar={updateFilter((v: LoteStatus | "") => setStatusFilter(v))}
          />
        </Reveal>

        <Reveal ordem={2} className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                aria-label="Buscar por número do lote"
                placeholder="Buscar por número do lote"
                value={search}
                onChange={(e) => updateFilter(setSearch)(e.target.value)}
                className="w-64 pl-9"
              />
            </div>

            <Select
              value={quadraFilter || ALL_QUADRAS}
              onValueChange={updateFilter((v: string) =>
                setQuadraFilter(v === ALL_QUADRAS ? "" : v),
              )}
            >
              <SelectTrigger aria-label="Quadra" className="w-44">
                <SelectValue placeholder="Quadra" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_QUADRAS}>Todas as quadras</SelectItem>
                {QUADRA_OPTIONS.map((q) => (
                  <SelectItem key={q} value={q}>
                    Quadra {q}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={metragemFilter || ALL_METRAGENS}
              onValueChange={updateFilter((v: string) =>
                setMetragemFilter(v === ALL_METRAGENS ? "" : (v as MetragemFilter)),
              )}
            >
              <SelectTrigger aria-label="Metragem" className="w-48">
                <SelectValue placeholder="Metragem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_METRAGENS}>Todas as metragens</SelectItem>
                <SelectItem value="ate200">Até 200m²</SelectItem>
                <SelectItem value="200-300">200–300m²</SelectItem>
                <SelectItem value="300-400">300–400m²</SelectItem>
                <SelectItem value="acima400">Acima de 400m²</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters ? (
              <Button variant="ghost" size="sm" className="animate-swap" onClick={clearFilters}>
                Limpar filtros
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div role="group" aria-label="Status" className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Status
              </span>
              <Chip ativo={statusFilter === ""} onClick={() => updateFilter(setStatusFilter)("")}>
                Todos
              </Chip>
              {STATUS_CHIPS.map((s) => (
                <Chip
                  key={s.value}
                  ativo={statusFilter === s.value}
                  onClick={() => updateFilter(setStatusFilter)(s.value)}
                >
                  <span
                    aria-hidden
                    className={cn("h-1.5 w-1.5 rounded-full", LOTE_STATUS_DOT[s.value])}
                  />
                  {s.label}
                </Chip>
              ))}
            </div>
            <div role="group" aria-label="Tipo" className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Tipo
              </span>
              <Chip ativo={tipoFilter === ""} onClick={() => updateFilter(setTipoFilter)("")}>
                Todos
              </Chip>
              <Chip
                ativo={tipoFilter === "residencial"}
                onClick={() => updateFilter(setTipoFilter)("residencial")}
              >
                Residencial
              </Chip>
              <Chip
                ativo={tipoFilter === "comercial"}
                onClick={() => updateFilter(setTipoFilter)("comercial")}
              >
                Comercial
              </Chip>
            </div>
          </div>
        </Reveal>

        <Reveal ordem={3}>
          <div key={view} className="animate-swap">
            {view === "planta" ? (
              <QueryState query={{ ...consulta, isPending: false }} skeleton={null}>
                {() => (
                  <LotePlantaViewer
                    lotes={filtered}
                    onSelectLote={setEditingLote}
                    selecionadoId={editingLote?.id ?? null}
                    carregando={isLoading}
                  />
                )}
              </QueryState>
            ) : view === "3d" ? (
              <Suspense
                fallback={
                  <div className="flex h-[50vh] items-center justify-center gap-2.5 rounded-2xl border border-border bg-card text-[0.875rem] text-muted-foreground shadow-[var(--shadow-card)]">
                    <Loader2
                      className="h-4 w-4 animate-spin motion-reduce:animate-none"
                      aria-hidden
                    />
                    Carregando visualização 3D…
                  </div>
                }
              >
                <Loteamento3DView lotes={filtered} onSelectLote={setEditingLote} />
              </Suspense>
            ) : (
              <QueryState
                query={consulta}
                skeleton={<SkeletonRows rows={6} className="h-14" />}
                isEmpty={(d) => d.length === 0}
                empty={vazio}
              >
                {() => (
                  <div className="space-y-4">
                    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
                      <Table>
                        <TableHeader className="bg-muted/50">
                          <TableRow>
                            <TableHead className="pl-5">Quadra</TableHead>
                            <TableHead>Nº Lote</TableHead>
                            <TableHead className="text-right">Metragem</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Observações</TableHead>
                            <TableHead className="pr-4 text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody key={`${currentPage}|${filtrosKey}`}>
                          {paginated.map((lote, index) => (
                            <TableRow
                              key={lote.id}
                              className="group/linha animate-swap"
                              style={atraso(index, 22, 330)}
                            >
                              <TableCell className="pl-5 tabular-nums text-muted-foreground">
                                {lote.quadra ?? "—"}
                              </TableCell>
                              <TableCell className="num text-[0.9375rem]">
                                {lote.numero_lote}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatMetragem(lote.metragem)}
                              </TableCell>
                              <TableCell>
                                {lote.tipo ? (
                                  <Pill tone={TIPO_TONE[lote.tipo]}>{TIPO_LABELS[lote.tipo]}</Pill>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatCurrency(lote.valor)}
                              </TableCell>
                              <TableCell>
                                <LoteStatusEditableBadge loteId={lote.id} status={lote.status} />
                              </TableCell>
                              <TableCell className="max-w-[180px] text-muted-foreground">
                                {lote.observacoes ? (
                                  lote.observacoes.length > 30 ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="block cursor-default truncate">
                                          {lote.observacoes.slice(0, 30)}…
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs">
                                        {lote.observacoes}
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <span className="block truncate">{lote.observacoes}</span>
                                  )
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell className="pr-3">
                                <div className="flex items-center justify-end gap-0.5">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground"
                                    onClick={() => setEditingLote(lote)}
                                    title="Editar lote"
                                    aria-label={`Editar lote ${lote.numero_lote}`}
                                  >
                                    <Pencil className="h-4 w-4" aria-hidden />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:bg-danger-soft hover:text-danger"
                                    title="Excluir lote"
                                    aria-label={`Excluir lote ${lote.numero_lote}`}
                                    onClick={() => {
                                      if (window.confirm(`Excluir o lote ${lote.numero_lote}?`)) {
                                        deleteMutation(lote.id);
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-[0.8125rem] tabular-nums text-muted-foreground">
                        Mostrando {rangeStart}–{rangeEnd} de {filtered.length} lotes
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" aria-hidden />
                          Anterior
                        </Button>
                        <span className="text-[0.8125rem] tabular-nums text-muted-foreground">
                          Página {currentPage} de {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Próximo
                          <ChevronRight className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </QueryState>
            )}
          </div>
        </Reveal>

        {editingLote ? (
          <LoteFormDialog
            lote={editingLote}
            open={Boolean(editingLote)}
            onOpenChange={(open) => {
              if (!open) setEditingLote(null);
            }}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}
