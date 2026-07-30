// Histórico de campanhas de disparo em massa: cada linha é uma campanha já
// registrada — mudar o filtro/fonte no card acima não altera o que já rodou.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { DisparoCampanha, DisparoItem } from "@/lib/types";
import { ToolCard } from "@/components/ferramentas/tool-card";
import { Badge } from "@/components/ui/badge";
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

const STATUS_CLASS: Record<string, string> = {
  em_andamento: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  concluido: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  interrompido: "bg-muted text-muted-foreground hover:bg-muted",
};

const FONTE_LABEL: Record<string, string> = {
  crm: "Leads do CRM",
  csv: "Upload CSV",
  manual: "Lista manual",
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function CampanhaRow({ campanha }: { campanha: DisparoCampanha }) {
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
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full flex-wrap items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{mensagemResumida}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(campanha.iniciado_em)} · {campanha.instancia_nome} ·{" "}
                {FONTE_LABEL[campanha.fonte_contatos] ?? campanha.fonte_contatos}
                {campanha.filtro_status ? ` (${campanha.filtro_status})` : ""}
              </p>
            </div>
            <Badge className={cn("font-normal shrink-0", STATUS_CLASS[campanha.status])}>
              {STATUS_LABEL[campanha.status] ?? campanha.status}
            </Badge>
            <p className="text-xs text-muted-foreground shrink-0">
              {campanha.total_enviado} enviado{campanha.total_enviado === 1 ? "" : "s"} ·{" "}
              {campanha.total_falhou} falhou{campanha.total_falhou === 1 ? "" : "s"} de{" "}
              {campanha.total_contatos}
            </p>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t p-3">
            {isLoading ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : (itens ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum contato registrado.</p>
            ) : (
              <div className="rounded-lg border overflow-x-auto max-h-64 overflow-y-auto">
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
                          <Badge
                            className={cn(
                              "font-normal",
                              item.status === "enviado"
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                                : item.status === "falhou"
                                  ? "bg-red-100 text-red-800 hover:bg-red-100"
                                  : "bg-muted text-muted-foreground hover:bg-muted",
                            )}
                          >
                            {item.status === "enviado"
                              ? "Enviado"
                              : item.status === "falhou"
                                ? "Falhou"
                                : "Pendente"}
                          </Badge>
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

export function DispatchHistoryCard() {
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

  return (
    <ToolCard
      icon={History}
      title="Histórico de disparos"
      subtitle="Campanhas já disparadas, com o status de envio de cada contato"
    >
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : (campanhas ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma campanha disparada ainda.</p>
      ) : (
        <div className="space-y-2">
          {(campanhas ?? []).map((campanha) => (
            <CampanhaRow key={campanha.id} campanha={campanha} />
          ))}
        </div>
      )}
    </ToolCard>
  );
}
