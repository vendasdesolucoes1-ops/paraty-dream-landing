import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Wifi, WifiOff, Pencil, Trash2, RefreshCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { WhatsappInstance } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const QR_TTL_SECONDS = 60;

function isConnected(status: string | undefined) {
  return status === "open" || status === "connected";
}

function StatusBadge({ status }: { status: string | undefined }) {
  const connected = isConnected(status);
  const connecting = status === "connecting";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
        connected && "bg-emerald-100 text-emerald-800",
        connecting && "bg-amber-100 text-amber-800 animate-pulse",
        !connected && !connecting && "bg-red-100 text-red-800",
      )}
    >
      {connected ? <Wifi className="h-3.5 w-3.5" /> : null}
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          connected && "bg-emerald-500 animate-pulse",
          connecting && "bg-amber-500",
          !connected && !connecting && "bg-red-500",
        )}
      />
      {connected ? "Conectado" : connecting ? "Conectando" : "Desconectado"}
    </span>
  );
}

export function WhatsappInstanceCard({ instance }: { instance: WhatsappInstance }) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ api_url: instance.api_url, api_key: "" });

  // Poll Evolution API connection state every 10s (via edge function, which syncs the DB).
  const { data: liveInstance } = useQuery({
    queryKey: ["whatsapp-live-status", instance.instance_name],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-instance/status", {
        body: { instance_name: instance.instance_name },
      });
      if (error) throw error;
      return data as WhatsappInstance;
    },
    refetchInterval: 10_000,
    retry: false,
  });

  const status = liveInstance?.status ?? instance.status;
  const connected = isConnected(status);

  const {
    data: qr,
    isFetching: qrFetching,
    refetch: refetchQr,
    dataUpdatedAt: qrUpdatedAt,
  } = useQuery({
    queryKey: ["whatsapp-qr", instance.instance_name],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-instance/connect", {
        body: { instance_name: instance.instance_name },
      });
      if (error) throw error;
      return (data as WhatsappInstance).qr_code;
    },
    enabled: !connected,
    refetchInterval: QR_TTL_SECONDS * 1000,
    retry: false,
  });

  const [secondsLeft, setSecondsLeft] = useState(QR_TTL_SECONDS);
  useEffect(() => {
    if (connected || !qr) return;
    setSecondsLeft(QR_TTL_SECONDS);
    const timer = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [qr, qrUpdatedAt, connected]);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
    queryClient.invalidateQueries({ queryKey: ["whatsapp-live-status", instance.instance_name] });
    queryClient.invalidateQueries({ queryKey: ["whatsapp-qr", instance.instance_name] });
  }

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("whatsapp-instance/disconnect", {
        body: { instance_name: instance.instance_name },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Instância desconectada.");
      invalidateAll();
    },
    onError: () => toast.error("Erro ao desconectar a instância."),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("whatsapp-instance/delete", {
        method: "DELETE",
        body: { instance_name: instance.instance_name },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Instância excluída.");
      invalidateAll();
    },
    onError: () => toast.error("Erro ao excluir a instância."),
  });

  const editMutation = useMutation({
    mutationFn: async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const update: { api_url: string; api_key?: string } = { api_url: editForm.api_url };
      if (editForm.api_key.trim()) update.api_key = editForm.api_key.trim();
      const { error } = await supabase
        .from("whatsapp_instances")
        .update(update)
        .eq("id", instance.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Instância atualizada.");
      setEditOpen(false);
      invalidateAll();
    },
    onError: () => toast.error("Erro ao atualizar a instância."),
  });

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <p className="font-medium text-lg">{instance.instance_name}</p>
          <p className="text-xs text-muted-foreground break-all">{instance.api_url}</p>
        </div>
        <StatusBadge status={status} />
      </CardHeader>

      <CardContent className="flex flex-col items-center justify-center py-6 min-h-[280px]">
        {connected ? (
          <div className="flex flex-col items-center gap-3 text-emerald-600">
            <div className="h-24 w-24 rounded-full bg-emerald-50 flex items-center justify-center">
              <Wifi className="h-12 w-12" />
            </div>
            <p className="font-medium text-lg">Conectado</p>
            <p className="text-sm text-muted-foreground">Pronto para enviar e receber mensagens.</p>
          </div>
        ) : qr ? (
          <div className="flex flex-col items-center gap-3">
            <img
              src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
              alt="QR Code do WhatsApp"
              className="w-56 h-56 min-w-[220px] min-h-[220px] border-2 border-gold rounded-xl p-2 bg-white"
            />
            <div className="w-56 space-y-1">
              <Progress value={(secondsLeft / QR_TTL_SECONDS) * 100} />
              <p className="text-xs text-muted-foreground text-center">Expira em {secondsLeft}s</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchQr()} disabled={qrFetching}>
              <RefreshCcw className={cn("h-4 w-4 mr-2", qrFetching && "animate-spin")} />
              Atualizar QR
            </Button>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Abra o WhatsApp &gt; Dispositivos conectados &gt; Conectar dispositivo &gt; Aponte
              para o QR code
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className={cn("h-6 w-6", qrFetching && "animate-spin")} />
            <p className="text-sm">{qrFetching ? "Gerando QR code..." : "QR code indisponível."}</p>
            {!qrFetching ? (
              <Button variant="outline" size="sm" onClick={() => refetchQr()}>
                Tentar novamente
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-end gap-2 border-t pt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => disconnectMutation.mutate()}
          disabled={disconnectMutation.isPending || !connected}
        >
          <WifiOff className="h-4 w-4 mr-2" />
          Desconectar
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          title="Editar instância"
          onClick={() => {
            setEditForm({ api_url: instance.api_url, api_key: "" });
            setEditOpen(true);
          }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 text-destructive hover:text-destructive"
          title="Excluir instância"
          onClick={() => {
            if (window.confirm("Excluir a instância? Esta ação não pode ser desfeita.")) {
              deleteMutation.mutate();
            }
          }}
          disabled={deleteMutation.isPending}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardFooter>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar instância — {instance.instance_name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => editMutation.mutate(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_api_url">URL da Evolution API</Label>
              <Input
                id="edit_api_url"
                required
                value={editForm.api_url}
                onChange={(e) => setEditForm((f) => ({ ...f, api_url: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_api_key">API Key (deixe em branco para manter)</Label>
              <Input
                id="edit_api_key"
                type="password"
                value={editForm.api_key}
                onChange={(e) => setEditForm((f) => ({ ...f, api_key: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={editMutation.isPending}>
                {editMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
