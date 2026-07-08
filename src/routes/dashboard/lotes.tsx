import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LoteStatusEditableBadge } from "@/components/dashboard/status-badge";
import { LoteFormDialog } from "@/components/dashboard/lote-form-dialog";
import type { Lote, LoteStatus, LoteTipo } from "@/lib/types";

export const Route = createFileRoute("/dashboard/lotes")({
  head: () => ({ meta: [{ title: "Lotes — Moradas de Paraty" }] }),
  component: LotesPage,
});

const QUADRA_OPTIONS = Array.from({ length: 10 }, (_, i) => String(i + 1));
const PAGE_SIZE = 20;

// Empty string means "no filter applied" for every field below.
type MetragemFilter = "" | "ate200" | "200-300" | "300-400" | "acima400";

// Sentinel values for the Radix Select items, which cannot use an empty string.
// They map to/from the real (empty-string) filter state at the UI boundary only.
const ALL_QUADRAS = "todas";
const ALL_STATUS = "todos";
const ALL_TIPOS = "todos";
const ALL_METRAGENS = "todas";

const TIPO_BADGE_STYLES: Record<LoteTipo, string> = {
  residencial: "bg-sky-100 text-sky-800 hover:bg-sky-100",
  comercial: "bg-violet-100 text-violet-800 hover:bg-violet-100",
};

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

  const {
    data: lotes,
    isLoading,
    isError,
  } = useQuery({
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

  const { data: summary } = useQuery({
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

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display text-primary">Lotes</h1>
            <p className="text-muted-foreground">
              Gestão do estoque de lotes — Loteamento Residencial Sophia Saíde
            </p>
          </div>
          <LoteFormDialog trigger={<Button>+ Novo Lote</Button>} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Lotes disponíveis</p>
                {!summary ? (
                  <Skeleton className="h-8 w-12 mt-1" />
                ) : (
                  <p className="text-2xl font-semibold">{summary.disponiveis}</p>
                )}
              </div>
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-normal">
                Disponível
              </Badge>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Lotes reservados</p>
                {!summary ? (
                  <Skeleton className="h-8 w-12 mt-1" />
                ) : (
                  <p className="text-2xl font-semibold">{summary.reservados}</p>
                )}
              </div>
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 font-normal">
                Reservado
              </Badge>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Lotes vendidos</p>
                {!summary ? (
                  <Skeleton className="h-8 w-12 mt-1" />
                ) : (
                  <p className="text-2xl font-semibold">{summary.vendidos}</p>
                )}
              </div>
              <Badge className="bg-red-100 text-red-800 hover:bg-red-100 font-normal">
                Vendido
              </Badge>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={quadraFilter || ALL_QUADRAS}
            onValueChange={updateFilter((v: string) => setQuadraFilter(v === ALL_QUADRAS ? "" : v))}
          >
            <SelectTrigger className="w-40">
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
            value={statusFilter || ALL_STATUS}
            onValueChange={updateFilter((v: string) =>
              setStatusFilter(v === ALL_STATUS ? "" : (v as LoteStatus)),
            )}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUS}>Todos os status</SelectItem>
              <SelectItem value="disponivel">Disponível</SelectItem>
              <SelectItem value="reservado">Reservado</SelectItem>
              <SelectItem value="vendido">Vendido</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={tipoFilter || ALL_TIPOS}
            onValueChange={updateFilter((v: string) =>
              setTipoFilter(v === ALL_TIPOS ? "" : (v as LoteTipo)),
            )}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TIPOS}>Todos os tipos</SelectItem>
              <SelectItem value="residencial">Residencial</SelectItem>
              <SelectItem value="comercial">Comercial</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={metragemFilter || ALL_METRAGENS}
            onValueChange={updateFilter((v: string) =>
              setMetragemFilter(v === ALL_METRAGENS ? "" : (v as MetragemFilter)),
            )}
          >
            <SelectTrigger className="w-44">
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

          <Input
            placeholder="Buscar por número do lote"
            value={search}
            onChange={(e) => updateFilter(setSearch)(e.target.value)}
            className="w-56"
          />

          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Limpar filtros
            </Button>
          ) : null}
        </div>

        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quadra</TableHead>
                <TableHead>Nº Lote</TableHead>
                <TableHead>Metragem</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Observações</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-destructive py-8">
                    Erro ao carregar os lotes.
                  </TableCell>
                </TableRow>
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhum lote encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((lote, index) => (
                  <TableRow key={lote.id} className={index % 2 === 1 ? "bg-muted/30" : undefined}>
                    <TableCell>{lote.quadra ?? "—"}</TableCell>
                    <TableCell className="font-medium">{lote.numero_lote}</TableCell>
                    <TableCell>{formatMetragem(lote.metragem)}</TableCell>
                    <TableCell>
                      {lote.tipo ? (
                        <Badge className={`font-normal ${TIPO_BADGE_STYLES[lote.tipo]}`}>
                          {TIPO_LABELS[lote.tipo]}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{formatCurrency(lote.valor)}</TableCell>
                    <TableCell>
                      <LoteStatusEditableBadge loteId={lote.id} status={lote.status} />
                    </TableCell>
                    <TableCell className="max-w-[180px]">
                      {lote.observacoes ? (
                        lote.observacoes.length > 30 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate block cursor-default">
                                {lote.observacoes.slice(0, 30)}…
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">{lote.observacoes}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="truncate block">{lote.observacoes}</span>
                        )
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEditingLote(lote)}
                          title="Editar lote"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="Excluir lote"
                          onClick={() => {
                            if (window.confirm(`Excluir o lote ${lote.numero_lote}?`)) {
                              deleteMutation(lote.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {!isLoading && !isError && filtered.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Mostrando {rangeStart}–{rangeEnd} de {filtered.length} lotes
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Próximo
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        ) : null}

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
