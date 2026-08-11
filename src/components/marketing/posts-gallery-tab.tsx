// Aba "Galeria" — KPIs do Imagery Engine e histórico de posts gerados.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Instagram,
  Loader2,
  Maximize2,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  copy_data: { titulo?: string; caption?: string; hashtags?: string[] } | null;
};

type SlideRow = {
  id: string;
  slide_n: number;
  final_png_url: string | null;
  raw_image_url: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  planning: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
  generating: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  ready: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  published: "bg-primary/10 text-primary hover:bg-primary/10",
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
  // Lightbox: só o post aberto tem os slides buscados, para não carregar as
  // artes de toda a galeria de uma vez.
  const [previewPostId, setPreviewPostId] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

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
        .in(
          "post_id",
          (posts ?? []).map((p) => p.id),
        )
        .eq("slide_n", 1);
      if (error) throw error;
      return Object.fromEntries(
        (data ?? []).map((s) => [s.post_id as string, s.final_png_url as string | null]),
      );
    },
  });

  const { data: previewSlides, isLoading: previewLoading } = useQuery({
    queryKey: ["imagery-preview-slides", previewPostId],
    enabled: !!previewPostId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imagery_slides")
        .select("id, slide_n, final_png_url, raw_image_url")
        .eq("post_id", previewPostId!)
        .order("slide_n");
      if (error) throw error;
      // A arte composta é o final_png_url; a foto crua serve de fallback para
      // slides que ainda não passaram pelo compose.
      return (data as unknown as SlideRow[]).filter((s) => s.final_png_url || s.raw_image_url);
    },
  });

  const previewPost = (posts ?? []).find((p) => p.id === previewPostId) ?? null;
  const previewTotal = previewSlides?.length ?? 0;
  const currentSlide = previewSlides?.[previewIndex] ?? null;

  // Nome de arquivo descritivo: título do post (ou tema) + número do slide.
  const slugify = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "post";

  // Baixa via fetch+blob (não via <a href>) porque a URL assinada é
  // cross-origin e um link direto abriria a imagem numa aba em vez de
  // salvá-la no dispositivo.
  const downloadSlide = useCallback(async (url: string, filename: string) => {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }, []);

  const handleDownloadCurrent = async () => {
    if (!currentSlide) return;
    const url = currentSlide.final_png_url ?? currentSlide.raw_image_url;
    if (!url) return;
    const base = slugify(previewPost?.copy_data?.titulo || previewPost?.tema || "post");
    try {
      await downloadSlide(url, `${base}-slide-${currentSlide.slide_n}.png`);
    } catch {
      toast.error("Não foi possível baixar a imagem.");
    }
  };

  const handleDownloadAll = async () => {
    if (!previewSlides?.length) return;
    const base = slugify(previewPost?.copy_data?.titulo || previewPost?.tema || "post");
    try {
      for (const slide of previewSlides) {
        const url = slide.final_png_url ?? slide.raw_image_url;
        if (!url) continue;
        await downloadSlide(url, `${base}-slide-${slide.slide_n}.png`);
      }
      toast.success("Download de todas as artes iniciado.");
    } catch {
      toast.error("Não foi possível baixar todas as imagens.");
    }
  };

  // Mesma montagem de create-post-tab.tsx: texto + hashtags, separados por
  // linha em branco — a legenda já está gravada em copy_data, isto só monta
  // o texto pronto para copiar.
  const previewCaption = useMemo(() => {
    const c = previewPost?.copy_data;
    if (!c) return "";
    const tags = (c.hashtags ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
    return [c.caption, tags].filter(Boolean).join("\n\n");
  }, [previewPost]);

  const goPrev = useCallback(
    () => setPreviewIndex((i) => (previewTotal ? (i - 1 + previewTotal) % previewTotal : 0)),
    [previewTotal],
  );
  const goNext = useCallback(
    () => setPreviewIndex((i) => (previewTotal ? (i + 1) % previewTotal : 0)),
    [previewTotal],
  );

  // Setas do teclado navegam o carrossel. ESC e clique fora já são tratados
  // pelo Dialog.
  useEffect(() => {
    if (!previewPostId || previewTotal < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewPostId, previewTotal, goPrev, goNext]);

  function openPreview(postId: string) {
    setPreviewIndex(0);
    setPreviewPostId(postId);
  }

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
                  {/* Sempre clicável, mesmo sem capa: um post Falhou/Rascunho
                      sem imagem ainda tem legenda paga e gerada, e o modal
                      precisa ficar acessível para consultá-la — antes o card
                      sem capa nem abria o preview. */}
                  <button
                    type="button"
                    onClick={() => openPreview(post.id)}
                    className="group relative block aspect-square w-full overflow-hidden bg-muted"
                    title={covers?.[post.id] ? "Ver a arte em tamanho cheio" : "Ver legenda"}
                  >
                    {covers?.[post.id] ? (
                      <img
                        src={covers[post.id]!}
                        alt={post.copy_data?.titulo ?? post.tema}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    ) : null}
                    <span className="absolute inset-0 flex items-center justify-center bg-forest-deep/0 opacity-0 transition-all duration-200 group-hover:bg-forest-deep/40 group-hover:opacity-100 group-focus-visible:bg-forest-deep/40 group-focus-visible:opacity-100">
                      <Maximize2 className="h-7 w-7 text-ivory" />
                    </span>
                  </button>
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
                          className="inline-flex items-center gap-1 text-xs text-primary hover:text-accent"
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
                          {publishingId === post.id ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Instagram className="h-3.5 w-3.5 mr-1" />
                          )}
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

      {/* Lightbox — usa a MESMA signed URL já gravada em imagery_slides.
          Nenhum acesso novo é gerado e o bucket segue privado. */}
      <Dialog
        open={!!previewPostId}
        onOpenChange={(open) => {
          if (!open) setPreviewPostId(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display pr-6">
              {previewPost?.copy_data?.titulo || previewPost?.tema || "Arte gerada"}
            </DialogTitle>
          </DialogHeader>

          <div
            className="relative flex items-center justify-center"
            onTouchStart={(e) => {
              touchStartX.current = e.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(e) => {
              const start = touchStartX.current;
              touchStartX.current = null;
              if (start == null || previewTotal < 2) return;
              const delta = (e.changedTouches[0]?.clientX ?? start) - start;
              if (Math.abs(delta) < 40) return;
              if (delta > 0) goPrev();
              else goNext();
            }}
          >
            {previewLoading ? (
              <Skeleton className="aspect-square w-full max-w-xl rounded-lg" />
            ) : currentSlide ? (
              <img
                src={(currentSlide.final_png_url ?? currentSlide.raw_image_url)!}
                alt={`Slide ${currentSlide.slide_n}`}
                className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
              />
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Imagem ainda não gerada.
              </p>
            )}

            {previewTotal > 1 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={goPrev}
                  aria-label="Slide anterior"
                  className="absolute left-2 h-9 w-9 rounded-full bg-card/90 shadow-sm"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={goNext}
                  aria-label="Próximo slide"
                  className="absolute right-2 h-9 w-9 rounded-full bg-card/90 shadow-sm"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </>
            ) : null}
          </div>

          {previewTotal > 1 ? (
            <div className="flex items-center justify-center gap-2">
              {previewSlides!.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setPreviewIndex(i)}
                  aria-label={`Ir para o slide ${i + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    i === previewIndex ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30"
                  }`}
                />
              ))}
              <span className="ml-2 text-xs text-muted-foreground">
                {previewIndex + 1} / {previewTotal}
              </span>
            </div>
          ) : null}

          {/* Publicação manual: baixar a arte e copiar a legenda funcionam
              independente do status do post (Pronto, Falhou, Rascunho),
              desde que a imagem/legenda já exista. */}
          {currentSlide || previewCaption ? (
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              {currentSlide ? (
                <Button type="button" variant="outline" size="sm" onClick={handleDownloadCurrent}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Baixar imagem
                </Button>
              ) : null}
              {previewTotal > 1 ? (
                <Button type="button" variant="outline" size="sm" onClick={handleDownloadAll}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Baixar todas ({previewTotal})
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* Legenda: já gravada em imagery_posts.copy_data, independente do
              status do post — Rascunho/Falhou também têm legenda paga e
              gerada, só não tiveram (ou perderam) a imagem. */}
          {previewCaption ? (
            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium text-primary">Legenda</p>
              <Textarea rows={6} readOnly value={previewCaption} className="text-sm" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(previewCaption);
                  toast.success("Legenda copiada.");
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copiar legenda
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
