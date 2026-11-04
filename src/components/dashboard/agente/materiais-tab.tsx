import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, FileText, Film, Image as ImageIcon, MapPin, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { linkMapsDe } from "@/lib/agente-mapa";
import { BUCKET_MATERIAIS, mensagemDeErro, rotuloTipoMaterial } from "@/lib/agente-ia";
import type { MaterialAgente, MaterialAgenteTipo } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Pill } from "@/components/ds/pill";
import { SkeletonRows } from "@/components/ds/query-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MaterialFormDialog } from "@/components/dashboard/agente/material-form-dialog";

// materiais_agente não está nos tipos gerados do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const ICONE: Record<MaterialAgenteTipo, typeof MapPin> = {
  localizacao: MapPin,
  foto: ImageIcon,
  video_drone: Film,
  video_lote: Film,
  pdf: FileText,
};

/** Caminho no bucket a partir da URL pública; null se o arquivo é externo. */
function caminhoNoBucket(url: string | null): string | null {
  if (!url) return null;
  const marca = `/storage/v1/object/public/${BUCKET_MATERIAIS}/`;
  const i = url.indexOf(marca);
  return i >= 0 ? decodeURIComponent(url.slice(i + marca.length).split("?")[0]) : null;
}

function linkDe(m: MaterialAgente): string | null {
  if (m.tipo === "localizacao") {
    return m.latitude != null && m.longitude != null
      ? linkMapsDe(Number(m.latitude), Number(m.longitude))
      : null;
  }
  return m.url;
}

/** Fotos, vídeos, PDFs e o pin de localização que a Sophia pode enviar. */
export function MateriaisTab() {
  const queryClient = useQueryClient();

  const {
    data: materiais,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["materiais-agente"],
    queryFn: async () => {
      const { data, error } = await db
        .from("materiais_agente")
        .select(
          "id, tipo, titulo, descricao, url, mime_type, latitude, longitude, endereco, ativo, ordem",
        )
        .order("ordem", { ascending: true })
        .order("titulo", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MaterialAgente[];
    },
  });

  const alternar = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await db.from("materiais_agente").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(
        v.ativo ? "Material ativado." : "Material desativado: a Sophia não envia mais.",
      );
      void queryClient.invalidateQueries({ queryKey: ["materiais-agente"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e, "Não foi possível alterar o material.")),
  });

  const excluir = useMutation({
    mutationFn: async (m: MaterialAgente) => {
      const { error } = await db.from("materiais_agente").delete().eq("id", m.id);
      if (error) throw error;
      // O registro já saiu; o arquivo órfão no bucket não pode travar a exclusão.
      const caminho = caminhoNoBucket(m.url);
      if (caminho) await supabase.storage.from(BUCKET_MATERIAIS).remove([caminho]);
    },
    onSuccess: () => {
      toast.success("Material excluído.");
      void queryClient.invalidateQueries({ queryKey: ["materiais-agente"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e, "Não foi possível excluir o material.")),
  });

  const proximaOrdem = (materiais ?? []).reduce((max, m) => Math.max(max, m.ordem ?? 0), 0) + 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-[0.875rem] leading-relaxed text-muted-foreground">
          A Sophia envia estes materiais quando o lead pede, ou quando ele mora longe e está em
          dúvida. Só os ativos são enviados.
        </p>
        <MaterialFormDialog proximaOrdem={proximaOrdem} />
      </div>

      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : isError ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Não foi possível carregar os materiais. Eles aparecem depois que o banco estiver
          atualizado.
        </p>
      ) : (materiais ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhum material ainda. Comece pelo pin de localização e um vídeo de drone.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-background">
          {materiais!.map((m) => {
            const Icone = ICONE[m.tipo] ?? FileText;
            const link = linkDe(m);
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 p-4">
                <Icone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1 basis-56">
                  <p
                    className={`truncate text-sm font-medium ${m.ativo ? "" : "text-muted-foreground line-through"}`}
                  >
                    {m.titulo}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.tipo === "localizacao"
                      ? [m.endereco, `${m.latitude}, ${m.longitude}`].filter(Boolean).join(" · ")
                      : (m.descricao ?? m.mime_type ?? m.url)}
                  </p>
                </div>
                <Pill>{rotuloTipoMaterial(m.tipo)}</Pill>
                {link ? (
                  <Button asChild variant="ghost" size="sm">
                    <a href={link} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" aria-hidden />
                      Ver
                    </a>
                  </Button>
                ) : null}
                <Switch
                  checked={m.ativo}
                  disabled={alternar.isPending}
                  onCheckedChange={(v) => alternar.mutate({ id: m.id, ativo: v })}
                  aria-label={`Ativo: ${m.titulo}`}
                />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-danger"
                      aria-label={`Excluir ${m.titulo}`}
                      disabled={excluir.isPending}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="font-display">
                        Excluir “{m.titulo}”?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        A Sophia deixa de enviar este material. Se o arquivo foi enviado por aqui,
                        ele também é apagado. Para só parar de enviar, desative em vez de excluir.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => excluir.mutate(m)}>
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
