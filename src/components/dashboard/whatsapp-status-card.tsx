import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RefreshCcw, Power, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { WhatsappInstance } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const QR_TTL_SECONDS = 60;

interface InstanceProfile {
  profile_name: string | null;
  profile_pic_url: string | null;
  number: string | null;
  status: string;
}

function isConnected(status: string | undefined) {
  return status === "open" || status === "connected";
}

function statusLabel(status: string | undefined) {
  if (isConnected(status)) return "Conectado";
  if (status === "connecting") return "Conectando";
  return "Desconectado";
}

function StatusBadge({ status }: { status: string | undefined }) {
  const connected = isConnected(status);
  const connecting = status === "connecting";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
        connected && "bg-emerald-100 text-emerald-800",
        connecting && "bg-amber-100 text-amber-800",
        !connected && !connecting && "bg-red-100 text-red-800",
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          connected && "bg-emerald-500 animate-pulse",
          connecting && "bg-amber-500 animate-pulse",
          !connected && !connecting && "bg-red-500",
        )}
      />
      {statusLabel(status)}
    </span>
  );
}

export function WhatsappStatusCard({ instance }: { instance: WhatsappInstance }) {
  const queryClient = useQueryClient();

  // Poll the Evolution API (via edge function) every 10s; it also syncs the DB row.
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

  // QR code: fetched while not connected, auto-refreshed when the TTL expires.
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
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [qr, qrUpdatedAt, connected]);

  // Profile info shown when connected.
  const { data: profile } = useQuery({
    queryKey: ["whatsapp-profile", instance.instance_name],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-instance/profile", {
        body: { instance_name: instance.instance_name },
      });
      if (error) throw error;
      return data as InstanceProfile;
    },
    enabled: connected,
    retry: false,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["whatsapp-instance"] });
    queryClient.invalidateQueries({ queryKey: ["whatsapp-live-status", instance.instance_name] });
    queryClient.invalidateQueries({ queryKey: ["whatsapp-qr", instance.instance_name] });
  }

  const reconnectMutation = useMutation({
    mutationFn: async () => {
      await supabase.functions
        .invoke("whatsapp-instance/logout", {
          body: { instance_name: instance.instance_name },
        })
        .catch(() => null);
      const { error } = await supabase.functions.invoke("whatsapp-instance/connect", {
        body: { instance_name: instance.instance_name },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Reconexão iniciada. Escaneie o novo QR code.");
      invalidateAll();
    },
    onError: () => toast.error("Erro ao reconectar a instância."),
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("whatsapp-instance/logout", {
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

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-xl font-display text-primary">Status da Instância</CardTitle>
        <StatusBadge status={status} />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-1 text-sm">
          <p>
            <span className="text-muted-foreground">Instância:</span>{" "}
            <span className="font-medium">{instance.instance_name}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Evolution API:</span>{" "}
            <span className="font-medium break-all">{instance.api_url}</span>
          </p>
        </div>

        {connected ? (
          <div className="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
            {profile?.profile_pic_url ? (
              <img
                src={profile.profile_pic_url}
                alt="Foto de perfil do WhatsApp"
                className="h-14 w-14 rounded-full object-cover border"
              />
            ) : (
              <div className="h-14 w-14 rounded-full bg-forest-deep text-ivory flex items-center justify-center text-lg font-display">
                {(profile?.profile_name ?? instance.instance_name).charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-medium">{profile?.profile_name ?? "Carregando perfil..."}</p>
              <p className="text-sm text-muted-foreground">
                {profile?.number ? `+${profile.number}` : ""}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-2">
            {qr ? (
              <>
                <img
                  src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                  alt="QR Code do WhatsApp"
                  className="w-64 h-64 min-w-[250px] min-h-[250px] border-2 border-gold rounded-xl p-2 bg-white"
                />
                <div className="w-64 space-y-1">
                  <Progress value={(secondsLeft / QR_TTL_SECONDS) * 100} />
                  <p className="text-xs text-muted-foreground text-center">
                    Novo QR code em {secondsLeft}s
                  </p>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                <Loader2 className={cn("h-6 w-6", qrFetching && "animate-spin")} />
                <p className="text-sm">
                  {qrFetching ? "Gerando QR code..." : "QR code indisponível."}
                </p>
                {!qrFetching ? (
                  <Button variant="outline" size="sm" onClick={() => refetchQr()}>
                    Tentar novamente
                  </Button>
                ) : null}
              </div>
            )}
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Abra o WhatsApp &gt; Dispositivos conectados &gt; Conectar dispositivo &gt; Aponte
              para o QR code
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => reconnectMutation.mutate()}
            disabled={reconnectMutation.isPending}
          >
            <RefreshCcw
              className={cn("h-4 w-4 mr-2", reconnectMutation.isPending && "animate-spin")}
            />
            Reconectar
          </Button>
          <Button
            variant="outline"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending || !connected}
          >
            <Power className="h-4 w-4 mr-2" />
            Desconectar
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (window.confirm("Excluir a instância? Esta ação não pode ser desfeita.")) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Excluir instância
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
