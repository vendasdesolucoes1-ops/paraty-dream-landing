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
  ImageIcon,
  Instagram,
  Loader2,
  Maximize2,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Pill, type Tone } from "@/components/ds/pill";
import { Bloco } from "@/components/ds/bloco";
import { Chip } from "@/components/ds/chip";
import { atraso } from "@/components/ds/reveal";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useContagem } from "@/hooks/use-contagem";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

const STATUS_TONE: Record<string, Tone> = {
  planning: "neutral",
  draft: "neutral",
  generating: "warning",
  ready: "success",
  published: "info",
  failed: "danger",
};

type Filtro = "todos" | "prontos" | "publicados" | "falhas";

/** Indicador do topo da galeria: o número sobe na primeira carga. */
function Kpi({
  label,
  valor,
  prefixo,
  casas,
}: {
  label: string;
  valor: number;
  prefixo?: string;
  casas?: number;
}) {
  const animado = useContagem(casas ? null : valor);
  const texto = casas
    ? `${prefixo ?? ""}${valor.toFixed(casas)}`
    : `${prefixo ?? ""}${animado ?? valor}`;
  return (
    <div className="px-6 py-5">
      <p className="text-[0.8125rem] text-muted-foreground">{label}</p>
      <p className="num mt-1 font-sans text-[1.875rem] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground">
        {texto}
      </p>
    </div>
  );
}

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
  const [filtro, setFiltro] = useState<Filtro>("todos");

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
  const falhas = (posts ?? []).filter((p) => p.status === "failed").length;
  const custo = (posts ?? []).reduce((acc, p) => acc + Number(p.custo_total_usd ?? 0), 0);

  const visiveis = (posts ?? []).filter((p) =>
    filtro === "prontos"
      ? p.status === "ready"
      : filtro === "publicados"
        ? p.ig_status === "published"
        : filtro === "falhas"
          ? p.status === "failed"
          : true,
  );

  return (
    <div className="space-y-10">
      <div
        role="group"
        aria-label="Resumo da galeria"
        className="grid grid-cols-2 divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] max-md:[&>*:nth-child(n+3)]:border-t max-md:[&>*:nth-child(even)]:border-l md:grid-cols-4 md:divide-x [&>*]:border-border"
      >
        <Kpi label="Posts criados" valor={total} />
        <Kpi label="Prontos para publicar" valor={prontos} />
        <Kpi label="Publicados no Instagram" valor={publicados} />
        <Kpi label="Custo de IA" valor={custo} prefixo="US$ " casas={2} />
      </div>

      <Bloco titulo="Posts gerados">
        {isLoading ? (
          <div aria-hidden className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/5] w-full rounded-2xl" />
            ))}
          </div>
        ) : total === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title="Nenhum post ainda."
            description='Crie o primeiro na aba "Criar post".'
          />
        ) : (
          <>
            <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filtrar posts">
              <Chip ativo={filtro === "todos"} onClick={() => setFiltro("todos")} contagem={total}>
                Todos
              </Chip>
              <Chip
                ativo={filtro === "prontos"}
                onClick={() => setFiltro("prontos")}
                contagem={prontos}
              >
                Prontos
              </Chip>
              <Chip
                ativo={filtro === "publicados"}
                onClick={() => setFiltro("publicados")}
                contagem={publicados}
              >
                Publicados
              </Chip>
              {falhas > 0 ? (
                <Chip
                  ativo={filtro === "falhas"}
                  onClick={() => setFiltro("falhas")}
                  contagem={falhas}
                >
                  Falhas
                </Chip>
              ) : null}
            </div>

            {visiveis.length === 0 ? (
              <p className="animate-swap rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                Nenhum post neste filtro.
              </p>
            ) : (
              <ul key={filtro} className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {visiveis.map((post, i) => (
                  <li key={post.id} className="animate-swap" style={atraso(i, 45, 400)}>
                    <article className="card-hover group/post flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
                      {/* Sempre clicável, mesmo sem capa: um post Falhou/Rascunho
                          sem imagem ainda tem legenda paga e gerada, e o modal
                          precisa ficar acessível para consultá-la — antes o card
                          sem capa nem abria o preview. */}
                      <button
                        type="button"
                        onClick={() => openPreview(post.id)}
                        className="group relative block aspect-square w-full overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        title={covers?.[post.id] ? "Ver a arte em tamanho cheio" : "Ver legenda"}
                        aria-label={`Abrir ${post.copy_data?.titulo || post.tema}`}
                      >
                        {covers?.[post.id] ? (
                          <img
                            src={covers[post.id]!}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-[1.05] motion-reduce:transform-none"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-muted-foreground/50">
                            <ImageIcon className="h-8 w-8" aria-hidden />
                          </span>
                        )}
                        <Pill
                          tone={STATUS_TONE[post.status] ?? "neutral"}
                          dot
                          className="absolute left-3 top-3 shadow-sm"
                        >
                          {STATUS_LABEL[post.status] ?? post.status}
                        </Pill>
                        <span
                          aria-hidden
                          className="absolute inset-0 flex items-end justify-between bg-gradient-to-t from-forest-deep/70 via-forest-deep/0 to-forest-deep/0 p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
                        >
                          <span className="text-[0.8125rem] font-medium text-ivory">
                            {covers?.[post.id] ? "Ampliar" : "Ver legenda"}
                          </span>
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-card/90 text-foreground shadow-sm">
                            <Maximize2 className="h-4 w-4" />
                          </span>
                        </span>
                      </button>
                      <div className="flex flex-1 flex-col gap-2 p-4">
                        <p className="line-clamp-2 text-[0.9375rem] font-semibold leading-snug">
                          {post.copy_data?.titulo || post.tema}
                        </p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {new Date(post.created_at).toLocaleDateString("pt-BR")}
                        </p>
                        {post.ig_error ? (
                          <p className="line-clamp-2 text-xs text-danger">{post.ig_error}</p>
                        ) : null}
                        <div className="mt-auto flex items-center gap-2 pt-2">
                          {post.ig_permalink ? (
                            <a
                              href={post.ig_permalink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded text-xs font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              Ver no Instagram <ExternalLink className="h-3 w-3" aria-hidden />
                            </a>
                          ) : post.status === "ready" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={publishingId === post.id}
                              onClick={() => publish(post.id)}
                            >
                              {publishingId === post.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                              ) : (
                                <Instagram className="h-3.5 w-3.5" aria-hidden />
                              )}
                              Publicar
                            </Button>
                          ) : null}

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="ml-auto h-8 w-8 text-muted-foreground hover:bg-danger-soft hover:text-danger"
                                aria-label="Excluir post"
                                title="Excluir post"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir este post?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  As artes geradas também deixarão de aparecer aqui. Esta ação não
                                  pode ser desfeita.
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
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Bloco>

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
            <DialogTitle className="pr-8 text-[1.5rem]">
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
              <Skeleton className="aspect-square w-full max-w-xl rounded-xl" />
            ) : currentSlide ? (
              <img
                key={currentSlide.id}
                src={(currentSlide.final_png_url ?? currentSlide.raw_image_url)!}
                alt={`Slide ${currentSlide.slide_n}`}
                className="animate-swap max-h-[70vh] w-auto max-w-full rounded-xl object-contain shadow-[var(--shadow-card)]"
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
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={goNext}
                  aria-label="Próximo slide"
                  className="absolute right-2 h-9 w-9 rounded-full bg-card/90 shadow-sm"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden />
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
                  className={cn(
                    "h-2 rounded-full transition-[width,background-color] duration-300 ease-[var(--ease-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                    i === previewIndex ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30",
                  )}
                />
              ))}
              <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                {previewIndex + 1} / {previewTotal}
              </span>
            </div>
          ) : null}

          {/* Publicação manual: baixar a arte e copiar a legenda funcionam
              independente do status do post (Pronto, Falhou, Rascunho),
              desde que a imagem/legenda já exista. */}
          {currentSlide || previewCaption ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              {currentSlide ? (
                <Button type="button" variant="outline" size="sm" onClick={handleDownloadCurrent}>
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Baixar imagem
                </Button>
              ) : null}
              {previewTotal > 1 ? (
                <Button type="button" variant="outline" size="sm" onClick={handleDownloadAll}>
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Baixar todas ({previewTotal})
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* Legenda: já gravada em imagery_posts.copy_data, independente do
              status do post — Rascunho/Falhou também têm legenda paga e
              gerada, só não tiveram (ou perderam) a imagem. */}
          {previewCaption ? (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-[0.8125rem] font-semibold text-foreground">Legenda</p>
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
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Copiar legenda
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
