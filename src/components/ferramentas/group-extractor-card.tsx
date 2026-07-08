import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, UsersRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { downloadCsv } from "@/lib/csv";
import type { WhatsappInstance } from "@/lib/types";
import { ToolCard } from "@/components/ferramentas/tool-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

interface Group {
  id: string;
  subject: string;
  picture_url: string | null;
  participants_count: number | null;
}

interface Participant {
  number: string;
  name: string;
  is_admin: boolean;
}

export function GroupExtractorCard() {
  const queryClient = useQueryClient();
  const [instanceId, setInstanceId] = useState<string>("");
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [participants, setParticipants] = useState<Participant[] | null>(null);

  const { data: instances } = useQuery({
    queryKey: ["whatsapp-instances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as WhatsappInstance[];
    },
  });

  const selectedInstance = instances?.find((i) => i.id === instanceId);

  const groupsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInstance) throw new Error("Selecione uma instância.");
      const { data, error } = await supabase.functions.invoke("whatsapp-groups", {
        body: { instance_name: selectedInstance.instance_name, action: "list" },
      });
      if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? "erro");
      return data.data as Group[];
    },
    onSuccess: (data) => {
      setGroups(data);
      setSelectedGroup(null);
      setParticipants(null);
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao buscar grupos."),
  });

  const participantsMutation = useMutation({
    mutationFn: async (group: Group) => {
      if (!selectedInstance) throw new Error("Selecione uma instância.");
      const { data, error } = await supabase.functions.invoke("whatsapp-groups", {
        body: {
          instance_name: selectedInstance.instance_name,
          action: "participants",
          group_jid: group.id,
        },
      });
      if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? "erro");
      return data.data as Participant[];
    },
    onSuccess: (data, group) => {
      setParticipants(data);
      setSelectedGroup(group);
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao buscar participantes."),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!participants || participants.length === 0) return;
      const rows = participants.map((p) => ({
        nome: p.name || p.number,
        telefone: p.number,
        origem: "whatsapp" as const,
        status_crm: "novo" as const,
      }));
      const { error, count } = await supabase
        .from("leads")
        .upsert(rows, { onConflict: "telefone", ignoreDuplicates: true, count: "exact" });
      if (error) throw error;
      return count ?? 0;
    },
    onSuccess: (count) => {
      toast.success(`${count ?? 0} novos leads importados para o CRM.`);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: () => toast.error("Erro ao importar participantes para o CRM."),
  });

  function copyAllNumbers() {
    if (!participants) return;
    navigator.clipboard.writeText(participants.map((p) => p.number).join("\n"));
    toast.success("Números copiados para a área de transferência.");
  }

  function exportCsv() {
    if (!participants) return;
    downloadCsv(
      `${selectedGroup?.subject ?? "grupo"}-membros.csv`,
      ["Nome", "Número", "Admin"],
      participants.map((p) => [p.name, p.number, p.is_admin ? "Sim" : "Não"]),
    );
  }

  return (
    <ToolCard
      icon={Users}
      title="Extrator de membros de grupos"
      subtitle="Liste os participantes de um grupo do WhatsApp e importe para o CRM"
    >
      <div className="space-y-2 max-w-xs">
        <label className="text-sm font-medium">Instância</label>
        <Select value={instanceId} onValueChange={setInstanceId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione a instância" />
          </SelectTrigger>
          <SelectContent>
            {(instances ?? []).map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.instance_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        onClick={() => groupsMutation.mutate()}
        disabled={!instanceId || groupsMutation.isPending}
      >
        {groupsMutation.isPending ? "Buscando..." : "Buscar meus grupos"}
      </Button>

      {groupsMutation.isPending ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : groups && groups.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => participantsMutation.mutate(group)}
              className="flex items-center gap-2 rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors"
            >
              {group.picture_url ? (
                <img
                  src={group.picture_url}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="h-9 w-9 rounded-full bg-forest-deep/10 text-forest-deep flex items-center justify-center shrink-0">
                  <UsersRound className="h-4 w-4" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{group.subject}</p>
                {group.participants_count != null ? (
                  <p className="text-xs text-muted-foreground">
                    {group.participants_count} membros
                  </p>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      ) : groups && groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum grupo encontrado.</p>
      ) : null}

      {participantsMutation.isPending ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : participants ? (
        <div className="space-y-3">
          <p className="text-sm">
            <span className="font-medium">{participants.length}</span> membros encontrados
            {selectedGroup ? ` em "${selectedGroup.subject}"` : ""}
          </p>

          <div className="rounded-lg border overflow-x-auto max-h-72 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Admin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {participants.map((p) => (
                  <TableRow key={p.number}>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>{p.number}</TableCell>
                    <TableCell>
                      {p.is_admin ? (
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 font-normal">
                          Sim
                        </Badge>
                      ) : (
                        "Não"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copyAllNumbers}>
              Copiar todos os números
            </Button>
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
