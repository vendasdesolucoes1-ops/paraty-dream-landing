// Histórico de campanhas de disparo em massa: cada linha é uma campanha já
// registrada — mudar o filtro/fonte na aba de disparo não altera o que já rodou.
//
// É um painel, não um card: vive dentro do MassDispatcherCard como aba, para
// quem acabou de disparar conferir o resultado sem sair da tela nem rolar até
// outro card.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { DisparoCampanha, DisparoItem } from "@/lib/types";
import { Pill, type Tone } from "@/components/ds/pill";
import { atraso } from "@/components/ds/reveal";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_LABEL: Record<string, string> = {
  em_andamento: "Em andamento",
  concluido: "Concluído",
  interrompido: "Interrompido",
};

const STATUS_TOM: Record<string, Tone> = {
  em_andamento: "warning",
  concluido: "success",
  interrompido: "neutral",
};

const FONTE_LABEL: Record<string, string> = {
  crm: "Leads do CRM",
  csv: "Upload CSV",
  manual: "Lista manual",
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function CampanhaRow({ campanha, indice }: { campanha: DisparoCampanha; indice: number }) {
  const [open, setOpen] = useState(false);

  const { data: itens, isLoading } = useQuery({
    queryKey: ["disparos-itens", campanha.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disparos_itens")
        .select("*")
        .eq("campanha_id", campanha.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as DisparoItem[];
    },
    enabled: open,
  });

  const mensagemResumida =
    campanha.mensagem_template.length > 60
      ? `${campanha.mensagem_template.slice(0, 60)}…`
      : campanha.mensagem_template;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="animate-swap"
      style={atraso(indice, 40, 320)}
    >
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full flex-wrap items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.9375rem] font-medium">{mensagemResumida}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(campanha.iniciado_em)} · {campanha.instancia_nome} ·{" "}
                {FONTE_LABEL[campanha.fonte_contatos] ?? campanha.fonte_contatos}
                {campanha.filtro_status ? ` (${campanha.filtro_status})` : ""}
              </p>
            </div>
            <Pill tone={STATUS_TOM[campanha.status] ?? "neutral"} dot>
              {STATUS_LABEL[campanha.status] ?? campanha.status}
            </Pill>
            <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {campanha.total_enviado} enviado{campanha.total_enviado === 1 ? "" : "s"} ·{" "}
              {campanha.total_falhou} falhou{campanha.total_falhou === 1 ? "" : "s"} de{" "}
              {campanha.total_contatos}
            </p>
            <ChevronDown
              aria-hidden
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-[var(--ease-out)]",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="animate-swap border-t border-border bg-background p-3">
            {isLoading ? (
              <Skeleton className="h-24 w-full rounded-xl" />
            ) : (itens ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum contato registrado.</p>
            ) : (
              <div className="max-h-64 overflow-auto rounded-xl border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Erro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(itens ?? []).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.nome || "—"}</TableCell>
                        <TableCell>{item.telefone}</TableCell>
                        <TableCell>
                          <Pill
                            tone={
                              item.status === "enviado"
                                ? "success"
                                : item.status === "falhou"
                                  ? "danger"
                                  : "neutral"
                            }
                          >
                            {item.status === "enviado"
                              ? "Enviado"
                              : item.status === "falhou"
                                ? "Falhou"
                                : "Pendente"}
                          </Pill>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {item.erro || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function DispatchHistoryPanel() {
  const { data: campanhas, isLoading } = useQuery({
    queryKey: ["disparos-campanhas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disparos_campanha")
        .select("*")
        .order("iniciado_em", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as DisparoCampanha[];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if ((campanhas ?? []).length === 0) {
    return (
      <EmptyState
        icon={Send}
        title="Nenhuma campanha disparada ainda"
        description="Quando você disparar a primeira, o resultado aparece aqui."
      />
    );
  }

  return (
    <div className="space-y-2">
      {(campanhas ?? []).map((campanha, i) => (
        <CampanhaRow key={campanha.id} campanha={campanha} indice={i} />
      ))}
    </div>
  );
}
