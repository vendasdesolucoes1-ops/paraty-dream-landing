// Aba "Galeria" — KPIs do Imagery Engine e histórico de posts gerados.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Instagram, Loader2, Trash2, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

type PostRow = {
  id: string;
  tema: string;
  tipo: string;
  status: string;
  ig_status: string | null;
  ig_permalink: string | null;
  ig_error: string | null;
  custo_total_usd: number;
  created_at: string;
  copy_data: { titulo?: string; caption?: string } | null;
};

const STATUS_STYLE: Record<string, string> = {
  planning: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
  generating: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  ready: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  published: "bg-forest-deep/10 text-forest-deep hover:bg-forest-deep/10",
  failed: "bg-red-100 text-red-800 hover:bg-red-100",
};

const STATUS_LABEL: Record<string, string> = {
  planning: "Planejando",
  draft: "Rascunho",
  generating: "Gerando",
  ready: "Pronto",
  published: "Publicado",
  failed: "Falhou",
};

export function PostsGalleryTab() {
  const queryClient = useQueryClient();
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const { data: posts, isLoading } = useQuery({
    queryKey: ["imagery-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imagery_posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data as unknown as PostRow[];
    },
    refetchInterval: 15000,
  });

  const { data: covers } = useQuery({
    queryKey: ["imagery-covers", posts?.length],
    enabled: !!posts?.length,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imagery_slides")
        .select("post_id, slide_n, final_png_url")
        .in("post_id", (posts ?? []).map((p) => p.id))
        .eq("slide_n", 1);
      if (error) throw error;
      return Object.fromEntries(
        (data ?? []).map((s) => [s.post_id as string, s.final_png_url as string | null]),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("imagery_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Post excluído.");
      queryClient.invalidateQueries({ queryKey: ["imagery-posts"] });
    },
    onError: () => toast.error("Não foi possível excluir o post."),
  });

  const publish = async (id: string) => {
    setPublishingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("imagery-publish-instagram", {
        body: { post_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Publicado no Instagram.");
      queryClient.invalidateQueries({ queryKey: ["imagery-posts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao publicar.");
    } finally {
      setPublishingId(null);
    }
  };

  const total = posts?.length ?? 0;
  const publicados = (posts ?? []).filter((p) => p.ig_status === "published").length;
  const prontos = (posts ?? []).filter((p) => p.status === "ready").length;
  const custo = (posts ?? []).reduce((acc, p) => acc + Number(p.custo_total_usd ?? 0), 0);

  const kpis = [
    { label: "Posts criados", value: String(total) },
    { label: "Prontos para publicar", value: String(prontos) },
    { label: "Publicados no Instagram", value: String(publicados) },
    { label: "Custo de IA", value: `US$ ${custo.toFixed(2)}` },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{kpi.label}</p>
              <p className="text-3xl font-display text-primary">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-display text-primary">Posts gerados</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square w-full" />
              ))}
            </div>
          ) : total === 0 ? (
            <p className="py-12 text-center text-muted-foreground">
              Nenhum post ainda. Crie o primeiro na aba "Criar post".
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {(posts ?? []).map((post) => (
                <Card key={post.id} className="overflow-hidden shadow-sm">
                  <div className="aspect-square bg-muted">
                    {covers?.[post.id] ? (
                      <img
                        src={covers[post.id]!}
                        alt={post.copy_data?.titulo ?? post.tema}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge className={`font-normal ${STATUS_STYLE[post.status] ?? ""}`}>
                        {STATUS_LABEL[post.status] ?? post.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(post.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <p className="text-sm font-medium line-clamp-2">
                      {post.copy_data?.titulo || post.tema}
                    </p>
                    {post.ig_error ? (
                      <p className="text-xs text-destructive line-clamp-2">{post.ig_error}</p>
                    ) : null}
                    <div className="flex items-center gap-2 pt-1">
                      {post.ig_permalink ? (
                        <a
                          href={post.ig_permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-forest-deep hover:text-accent"
                        >
                          Ver no Instagram <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : post.status === "ready" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={publishingId === post.id}
                          onClick={() => publish(post.id)}
                        >
                          {publishingId === post.id
                            ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            : <Instagram className="h-3.5 w-3.5 mr-1" />}
                          Publicar
                        </Button>
                      ) : null}

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="ml-auto h-8 w-8">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir este post?</AlertDialogTitle>
                            <AlertDialogDescription>
                              As artes geradas também deixarão de aparecer aqui. Esta ação não pode
                              ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(post.id)}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
