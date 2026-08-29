import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Lock, Search, UserCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/hooks/use-profile";
import type { Cliente } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ClienteFichaSheet } from "@/components/clientes/cliente-ficha-sheet";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";

export const Route = createFileRoute("/dashboard/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Moradas de Paraty" }] }),
  component: ClientesPage,
});

type ClienteComContagem = Cliente & { compras: { count: number }[] };

function ClientesPage() {
  const { profile } = useProfile();
  const [search, setSearch] = useState("");
  const [selecionado, setSelecionado] = useState<Cliente | null>(null);

  const podeVer = profile?.role === "admin" || profile?.role === "gestor";

  const {
    data: clientes,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["clientes", search],
    queryFn: async () => {
      let query = supabase.from("clientes").select("*, compras(count)").order("nome");
      if (search.trim()) {
        const termo = search.trim();
        query = query.or(`nome.ilike.%${termo}%,cpf.ilike.%${termo}%,telefone.ilike.%${termo}%`);
      }
      const { data, error } = await query;
      if (error) {
        console.error("[clientes] falha ao carregar:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }
      return data as unknown as ClienteComContagem[];
    },
    enabled: podeVer,
  });

  // O RLS já bloqueia no banco; isto evita a tela de erro para quem não deveria
  // sequer ver o item no menu.
  if (profile && !podeVer) {
    return (
      <EmptyState
        icon={Lock}
        title="Acesso restrito"
        description="Esta área é restrita a administradores e gestores."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pós-venda"
        title="Clientes"
        description="Compradores, seus lotes e a documentação de cada contrato."
      />

      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome, CPF ou telefone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-destructive">Erro ao carregar os clientes.</p>
      ) : (clientes ?? []).length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title={search.trim() ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
          description={
            search.trim()
              ? "Ajuste os termos da busca e tente novamente."
              : "Converta um lead em cliente pelo CRM."
          }
        />
      ) : (
        <div className="space-y-3">
          {(clientes ?? []).map((cliente) => {
            const totalCompras = cliente.compras?.[0]?.count ?? 0;
            return (
              <Card
                key={cliente.id}
                className="shadow-sm cursor-pointer transition-colors hover:border-primary/40"
                onClick={() => setSelecionado(cliente)}
              >
                <CardContent className="p-4 flex flex-wrap items-center gap-3">
                  <div className="rounded-md bg-secondary/60 p-2 shrink-0">
                    <UserCheck className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg text-primary truncate">{cliente.nome}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[cliente.cpf, cliente.telefone, cliente.email].filter(Boolean).join(" · ") ||
                        "Sem dados de contato"}
                    </p>
                  </div>
                  <Badge variant="secondary" className="font-normal shrink-0">
                    {totalCompras} lote{totalCompras === 1 ? "" : "s"}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ClienteFichaSheet
        cliente={selecionado}
        open={Boolean(selecionado)}
        onOpenChange={(v) => {
          if (!v) setSelecionado(null);
        }}
      />
    </div>
  );
}
