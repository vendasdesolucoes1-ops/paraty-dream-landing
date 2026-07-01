import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { LoteStatusBadge } from "@/components/dashboard/status-badge";
import { LoteFormDialog } from "@/components/dashboard/lote-form-dialog";
import type { Lote, LoteStatus, LoteTipo } from "@/lib/types";

export const Route = createFileRoute("/dashboard/lotes")({
  head: () => ({ meta: [{ title: "Lotes — Moradas de Paraty" }] }),
  component: LotesPage,
});

function formatCurrency(value: number | null) {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function LotesPage() {
  const [statusFilter, setStatusFilter] = useState<LoteStatus | "todos">("todos");
  const [tipoFilter, setTipoFilter] = useState<LoteTipo | "todos">("todos");

  const {
    data: lotes,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["lotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lotes")
        .select("*")
        .order("numero_lote", { ascending: true });
      if (error) throw error;
      return data as Lote[];
    },
  });

  const filtered = useMemo(() => {
    if (!lotes) return [];
    return lotes.filter((lote) => {
      if (statusFilter !== "todos" && lote.status !== statusFilter) return false;
      if (tipoFilter !== "todos" && lote.tipo !== tipoFilter) return false;
      return true;
    });
  }, [lotes, statusFilter, tipoFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow text-muted-foreground">Empreendimento</p>
          <h1 className="text-3xl font-display text-primary">Lotes</h1>
        </div>
        <LoteFormDialog />
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as LoteStatus | "todos")}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="disponivel">Disponível</SelectItem>
            <SelectItem value="reservado">Reservado</SelectItem>
            <SelectItem value="vendido">Vendido</SelectItem>
          </SelectContent>
        </Select>

        <Select value={tipoFilter} onValueChange={(v) => setTipoFilter(v as LoteTipo | "todos")}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="residencial">Residencial</SelectItem>
            <SelectItem value="comercial">Comercial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Quadra</TableHead>
              <TableHead>Metragem</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-destructive py-8">
                  Erro ao carregar os lotes.
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhum lote encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((lote) => (
                <TableRow key={lote.id}>
                  <TableCell className="font-medium">{lote.numero_lote}</TableCell>
                  <TableCell>{lote.quadra ?? "—"}</TableCell>
                  <TableCell>{lote.metragem ? `${lote.metragem} m²` : "—"}</TableCell>
                  <TableCell className="capitalize">{lote.tipo ?? "—"}</TableCell>
                  <TableCell>{formatCurrency(lote.valor)}</TableCell>
                  <TableCell>
                    <LoteStatusBadge status={lote.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
