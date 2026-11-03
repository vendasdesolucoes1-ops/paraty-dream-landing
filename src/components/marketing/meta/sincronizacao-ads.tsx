// Linha do topo da aba Anúncios: quando os dados foram atualizados e, para o
// admin, o botão "Sincronizar agora" (o mesmo da aba Integração, só de Ads).
import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatQtd, ultimaSincronizacaoAds } from "@/lib/marketing-calculos";
import { useSincronizarAgora, useStatusIntegracao } from "@/lib/marketing-meta";

const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function SincronizacaoAds({ podeSincronizar }: { podeSincronizar: boolean }) {
  const status = useStatusIntegracao();
  const mutacao = useSincronizarAgora();
  const [rodando, setRodando] = useState(false);
  const ultima = status.data ? ultimaSincronizacaoAds(status.data) : null;

  async function sincronizar() {
    setRodando(true);
    try {
      const r = await mutacao.mutateAsync("meta-sync-ads");
      if (r.ok) {
        toast.success(
          r.status === "parcial"
            ? "Anúncios: parte sincronizada; o restante continua na próxima execução."
            : `Anúncios sincronizados${r.registros != null ? ` (${formatQtd(r.registros)} registros)` : ""}.`,
        );
      } else {
        toast.error(`Anúncios: ${r.erro ?? "a sincronização falhou."}`);
      }
    } catch (e) {
      toast.error(`Anúncios: ${(e as Error)?.message ?? "não foi possível sincronizar."}`);
    } finally {
      setRodando(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-[0.8125rem] text-muted-foreground">
      <span>
        {status.isPending
          ? "Conferindo a última sincronização…"
          : ultima
            ? `Dados dos anúncios atualizados em ${quando.format(new Date(ultima))}`
            : "Os anúncios ainda não foram sincronizados"}
        <span className="hidden sm:inline"> · atualização automática toda madrugada</span>
      </span>
      {podeSincronizar ? (
        <Button size="sm" variant="outline" disabled={rodando} onClick={sincronizar}>
          {rodando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          )}
          {rodando ? "Sincronizando…" : "Sincronizar agora"}
        </Button>
      ) : null}
    </div>
  );
}
