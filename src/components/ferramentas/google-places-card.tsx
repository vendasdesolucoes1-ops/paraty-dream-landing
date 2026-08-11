import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin, Star } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { downloadCsv } from "@/lib/csv";
import { ToolCard } from "@/components/ferramentas/tool-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface PlaceResult {
  name: string;
  address: string;
  phone: string;
  website: string;
  rating: number | null;
}

export function GooglePlacesCard() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [maxResults, setMaxResults] = useState("25");
  const [results, setResults] = useState<PlaceResult[] | null>(null);

  const searchMutation = useMutation({
    mutationFn: async () => {
      if (!query.trim()) throw new Error("Informe o termo de busca.");
      const { data, error } = await supabase.functions.invoke("google-places", {
        body: { query, city, maxResults: Number(maxResults) },
      });
      if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? "erro");
      return data.data as PlaceResult[];
    },
    onSuccess: (data) => setResults(data),
    onError: (error: Error) => toast.error(error.message || "Erro ao buscar no Google Maps."),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!results || results.length === 0) return 0;
      const rows = results
        .filter((r) => r.phone)
        .map((r) => ({
          nome: r.name,
          telefone: r.phone.replace(/\D/g, ""),
          origem: "google_maps" as const,
          status_crm: "novo" as const,
        }));
      if (rows.length === 0) return 0;
      const { error, count } = await supabase
        .from("leads")
        .upsert(rows, { onConflict: "telefone", ignoreDuplicates: true, count: "exact" });
      if (error) throw error;
      return count ?? 0;
    },
    onSuccess: (count) => {
      toast.success(`${count} novos leads importados para o CRM.`);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: () => toast.error("Erro ao importar resultados para o CRM."),
  });

  function exportCsv() {
    if (!results) return;
    downloadCsv(
      "google-maps-leads.csv",
      ["Nome", "Endereço", "Telefone", "Website", "Avaliação"],
      results.map((r) => [r.name, r.address, r.phone, r.website, r.rating]),
    );
  }

  return (
    <ToolCard
      icon={MapPin}
      title="Extrator de leads (Google Maps)"
      subtitle="Busque empresas e profissionais no Google Maps e importe para o CRM"
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="places-query">Termo de busca</Label>
          <Input
            id="places-query"
            placeholder="corretores de imóveis Paraty"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="places-city">Cidade/Região</Label>
          <Input
            id="places-city"
            placeholder="Paraty, RJ"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Quantidade máxima</Label>
          <Select value={maxResults} onValueChange={setMaxResults}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={() => searchMutation.mutate()} disabled={searchMutation.isPending}>
        {searchMutation.isPending ? "Buscando..." : "Buscar no Google Maps"}
      </Button>

      {searchMutation.isPending ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : results ? (
        <div className="space-y-3">
          <p className="text-sm">
            <span className="font-medium">{results.length}</span> resultados encontrados
          </p>

          <div className="rounded-lg border overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Endereço</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Avaliação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.address}</TableCell>
                    <TableCell>{r.phone || "—"}</TableCell>
                    <TableCell className="max-w-[160px] truncate">
                      {r.website ? (
                        <a
                          href={r.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline underline-offset-4"
                        >
                          {r.website}
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {r.rating != null ? (
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-gold text-gold" />
                          {r.rating}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}>
              Exportar CSV
            </Button>
            <Button
              size="sm"
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending}
            >
              {importMutation.isPending ? "Importando..." : "Importar para CRM"}
            </Button>
          </div>
        </div>
      ) : null}
    </ToolCard>
  );
}
