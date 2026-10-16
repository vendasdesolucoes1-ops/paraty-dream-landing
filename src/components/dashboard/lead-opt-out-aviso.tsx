// Aviso de opt-out no detalhe do lead, com o desbloqueio manual (só gestão,
// com justificativa registrada no histórico — RPC desbloquear_contato).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EstadoContato {
  contato_bloqueado: boolean | null;
  sem_interesse_em: string | null;
}

export function LeadOptOutAviso({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const { profile } = useProfile();
  const ehGestao = profile?.role === "admin" || profile?.role === "gestor";
  const [aberto, setAberto] = useState(false);
  const [justificativa, setJustificativa] = useState("");

  const { data } = useQuery({
    queryKey: ["lead-opt-out", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("contato_bloqueado, sem_interesse_em")
        .eq("id", leadId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as EstadoContato | null;
    },
  });

  const desbloquear = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC fora dos tipos gerados
      const { error } = await (supabase.rpc as any)("desbloquear_contato", {
        p_lead_id: leadId,
        p_justificativa: justificativa.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Opt-out desfeito. A justificativa ficou no histórico do lead.");
      setAberto(false);
      setJustificativa("");
      queryClient.invalidateQueries({ queryKey: ["lead-opt-out", leadId] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível desfazer o opt-out."),
  });

  if (!data?.contato_bloqueado && !data?.sem_interesse_em) return null;

  const motivo = data.contato_bloqueado
    ? "O lead pediu para não receber mais mensagens."
    : "O lead disse que não tem interesse.";

  return (
    <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <Ban className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      <div className="flex-1 space-y-1">
        <p className="font-medium">Envios automáticos bloqueados</p>
        <p className="text-muted-foreground">
          {motivo} Primeiro contato, follow-up e campanhas não falam com este lead. A Sophia ainda
          responde se ele escrever.
        </p>
      </div>
      {ehGestao ? (
        <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
          Desfazer
        </Button>
      ) : null}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desfazer opt-out</DialogTitle>
            <DialogDescription>
              Só desfaça se o próprio lead pediu para voltar a receber mensagens. A justificativa
              fica registrada no histórico.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Ex.: o lead pediu por WhatsApp, em 18/10, para voltar a receber novidades."
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => desbloquear.mutate()}
              disabled={justificativa.trim().length < 10 || desbloquear.isPending}
            >
              {desbloquear.isPending ? "Salvando..." : "Desfazer opt-out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
