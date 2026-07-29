// Aba "Criar post" do Imagery Engine — briefing → plano editorial → artes finais.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Loader2,
  Sparkles,
  Wand2,
  RefreshCw,
  Instagram,
  Download,
  Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CONFIRM_THRESHOLD_USD,
  estimatePlannedCost,
  estimatePostCost,
  formatUsd,
} from "@/lib/imagery-cost";

const PILARES = [
  { value: "lugar", label: "Lugar — paisagem, rio, mata, cachoeiras" },
  { value: "patrimonio", label: "Patrimônio — Paraty histórica, UNESCO" },
  { value: "vida", label: "Vida — o dia a dia de quem mora aqui" },
  { value: "projeto", label: "Projeto — lotes, infraestrutura, topografia" },
  { value: "legado", label: "Legado — terra, tempo, herança" },
];

const OBJETIVOS = [
  { value: "desejo", label: "Gerar desejo pelo lugar" },
  { value: "autoridade", label: "Construir autoridade / educar" },
  { value: "lead", label: "Captar lead qualificado" },
  { value: "visita", label: "Agendar visita" },
];

type SlideRow = {
  id: string;
  slide_n: number;
  template_id: string;
  status: string;
  needs_image: boolean | null;
  image_type: string | null;
  final_png_url: string | null;
  raw_image_url: string | null;
  error_message: string | null;
  copy_data: { headline?: string; sub_text?: string } | null;
  validation_score: { media?: number; resumo?: string } | null;
};

type PostRow = {
  id: string;
  status: string;
  error_message: string | null;
  custo_total_usd: number;
  copy_data: { titulo?: string; caption?: string; hashtags?: string[] } | null;
};

type EdgeErrorPayload = {
  error?: string;
  message?: string;
  details?: string;
};

type MarketingErrorState = {
  title: string;
  message: string;
  requestId?: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Na fila",
  queued: "Na fila",
  generating: "Gerando foto",
  validating: "Validando",
  composing: "Montando arte",
  ready: "Pronto",
  failed: "Falhou",
};

function extractRequestId(details?: string): string | undefined {
  if (!details) return undefined;
  try {
    const parsed = JSON.parse(details) as { request_id?: string };
    return parsed.request_id;
  } catch {
    return undefined;
  }
}

function isCreditsError(status?: number, payload?: EdgeErrorPayload) {
  const text = `${payload?.error ?? ""} ${payload?.message ?? ""} ${payload?.details ?? ""}`;
  return status === 402 || /créditos|creditos|not enough credits|payment_required/i.test(text);
}

async function readFunctionError(
  error: unknown,
): Promise<{ status?: number; payload?: EdgeErrorPayload; message: string }> {
  const ctx = (error as { context?: Response })?.context;
  const payload = ctx?.json
    ? ((await ctx.json().catch(() => null)) as EdgeErrorPayload | null)
    : null;
  return {
    status: ctx?.status,
    payload: payload ?? undefined,
    message:
      payload?.message ??
      payload?.error ??
      (error instanceof Error ? error.message : "Erro na função"),
  };
}

export function CreatePostTab() {
  const queryClient = useQueryClient();
  const [tema, setTema] = useState("");
  const [nicho, setNicho] = useState("lugar");
  const [objetivo, setObjetivo] = useState("desejo");
  const [tipo, setTipo] = useState("carrossel");
  const [nSlides, setNSlides] = useState("5");

  const [planning, setPlanning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [billingError, setBillingError] = useState<MarketingErrorState | null>(null);

  const [postId, setPostId] = useState<string | null>(null);
  const [post, setPost] = useState<PostRow | null>(null);
  const [slides, setSlides] = useState<SlideRow[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isSingle = tipo === "imagem_unica";

  useEffect(() => {
    if (isSingle) setNSlides("1");
    else if (nSlides === "1") setNSlides("5");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  const refresh = async (id: string) => {
    const [{ data: p }, { data: s }] = await Promise.all([
      supabase.from("imagery_posts").select("*").eq("id", id).single(),
      supabase.from("imagery_slides").select("*").eq("post_id", id).order("slide_n"),
    ]);
    if (p) setPost(p as unknown as PostRow);
    if (s) setSlides(s as unknown as SlideRow[]);
    return { p, s };
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => stopPolling, []);

  const startPolling = (id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const { s } = await refresh(id);
      const rows = (s ?? []) as unknown as SlideRow[];
      if (rows.length > 0 && rows.every((r) => r.status === "ready" || r.status === "failed")) {
        stopPolling();
        setGenerating(false);
        queryClient.invalidateQueries({ queryKey: ["imagery-posts"] });
        const failed = rows.filter((r) => r.status === "failed").length;
        if (failed === 0) toast.success("Artes prontas.");
        else toast.warning(`${failed} arte(s) falharam. Você pode refazer só elas.`);
      }
    }, 3000);
  };

  const handlePlan = async () => {
    if (!tema.trim()) {
      toast.error("Descreva o tema do post.");
      return;
    }
    setPlanning(true);
    setPost(null);
    setSlides([]);
    setPostId(null);
    setBillingError(null);
    try {
      const { data, error } = await supabase.functions.invoke("imagery-plan-post", {
        body: {
          tema,
          nicho,
          objetivo: OBJETIVOS.find((o) => o.value === objetivo)?.label ?? objetivo,
          tipo,
          n_slides: Number(nSlides),
        },
      });
      // A recusa por cota vem como 429 com um texto pronto para o usuário; sem
      // isto o invoke só reportaria "non-2xx status code".
      if (error) {
        const fnError = await readFunctionError(error);
        if (isCreditsError(fnError.status, fnError.payload)) {
          const requestId = extractRequestId(fnError.payload?.details);
          setBillingError({
            title: "Créditos Lovable esgotados",
            message:
              "O planejamento e a geração de imagens rodam direto no Google e não dependem do Lovable. Só a validação automática das imagens ainda usa créditos Lovable — adicione créditos em Settings → Plans & credits → Buy credits, ou siga assim: a validação falha sem interromper o post.",
            requestId,
          });
          toast.error("Créditos Lovable esgotados (usados só na validação de imagens).");
          return;
        }
        throw new Error(fnError.message);
      }
      if (data?.error) {
        if (isCreditsError(undefined, data)) {
          setBillingError({
            title: "Créditos Lovable esgotados",
            message:
              data.message ??
              "Só a validação automática das imagens ainda usa créditos Lovable. Adicione créditos em Settings → Plans & credits → Buy credits, ou siga assim: a validação falha sem interromper o post.",
            requestId: extractRequestId(data.details),
          });
          toast.error("Créditos Lovable esgotados (usados só na validação de imagens).");
          return;
        }
        throw new Error(data.message ?? data.error);
      }
      setPostId(data.post_id);
      await refresh(data.post_id);
      toast.success("Plano editorial pronto. Revise e gere as artes.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível planejar o post.");
    } finally {
      setPlanning(false);
    }
  };

  // Estimativa grosseira mostrada no briefing, antes de existir um plano.
  const briefingEstimate = useMemo(() => estimatePostCost(Number(nSlides)), [nSlides]);
  // Estimativa precisa, já sabendo quais slides pedem imagem e de que tipo.
  const plannedEstimate = useMemo(() => estimatePlannedCost(slides), [slides]);

  const runGenerate = async () => {
    if (!postId) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("imagery-orchestrate", {
        body: { post_id: postId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.info("Gerando as artes. Isso leva de 1 a 3 minutos.");
      await refresh(postId);
      startPolling(postId);
    } catch (e) {
      setGenerating(false);
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar a geração.");
    }
  };

  // O limiar vale sobre o pior caso, não sobre o provável: o que precisa de
  // consentimento é o teto que a geração pode alcançar com os retries.
  const handleGenerate = () => {
    if (!postId) return;
    if (plannedEstimate.maximo > CONFIRM_THRESHOLD_USD) {
      setConfirmOpen(true);
      return;
    }
    void runGenerate();
  };

  const handlePublish = async () => {
    if (!postId) return;
    setPublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke("imagery-publish-instagram", {
        body: { post_id: postId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Publicado no Instagram.");
      queryClient.invalidateQueries({ queryKey: ["imagery-posts"] });
      await refresh(postId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao publicar no Instagram.");
    } finally {
      setPublishing(false);
    }
  };

  const allReady = slides.length > 0 && slides.every((s) => s.status === "ready");
  const caption = useMemo(() => {
    const c = post?.copy_data;
    if (!c) return "";
    const tags = (c.hashtags ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
    return [c.caption, tags].filter(Boolean).join("\n\n");
  }, [post]);

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card className="shadow-sm h-fit">
        <CardHeader>
          <CardTitle className="text-lg font-display text-primary flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gold" />
            Briefing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tema">Tema do post</Label>
            <Textarea
              id="tema"
              rows={3}
              placeholder="Ex.: as cachoeiras a poucos minutos do loteamento"
              value={tema}
              onChange={(e) => setTema(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Pilar de conteúdo</Label>
            <Select value={nicho} onValueChange={setNicho}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PILARES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Objetivo</Label>
            <Select value={objetivo} onValueChange={setObjetivo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OBJETIVOS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Formato</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="carrossel">Carrossel</SelectItem>
                  <SelectItem value="imagem_unica">Imagem única</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="n_slides">Slides</Label>
              <Input
                id="n_slides"
                type="number"
                min={1}
                max={8}
                value={nSlides}
                disabled={isSingle}
                onChange={(e) => setNSlides(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 shrink-0" />
              Custo estimado:{" "}
              <strong className="text-foreground font-medium">
                {formatUsd(postId ? plannedEstimate.estimado : briefingEstimate.estimado)}
              </strong>
            </span>
            <span className="mt-1 block">
              Até {formatUsd(postId ? plannedEstimate.maximo : briefingEstimate.maximo)} se algum
              slide precisar de uma segunda tentativa.
            </span>
          </div>

          {billingError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">{billingError.title}</p>
                  <p className="text-xs leading-relaxed text-destructive/90">
                    {billingError.message}
                  </p>
                  {billingError.requestId ? (
                    <p className="text-[11px] text-destructive/80">
                      Request ID: {billingError.requestId}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <Button onClick={handlePlan} disabled={planning || generating} className="w-full">
            {planning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4 mr-2" />
            )}
            {planning ? "Planejando..." : "Planejar post"}
          </Button>

          {postId ? (
            <Button
              onClick={handleGenerate}
              disabled={generating}
              variant="secondary"
              className="w-full"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {generating ? "Gerando artes..." : "Gerar artes"}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-6">
        {!postId ? (
          <Card className="shadow-sm">
            <CardContent className="py-16 text-center text-muted-foreground">
              Descreva o tema e planeje o post — a IA monta o roteiro dos slides, a legenda e as
              artes no padrão visual do Moradas de Paraty.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-lg font-display text-primary">
                  {post?.copy_data?.titulo || "Plano editorial"}
                </CardTitle>
                {post ? (
                  <Badge variant="outline" className="font-normal">
                    US$ {Number(post.custo_total_usd ?? 0).toFixed(3)}
                  </Badge>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea rows={7} readOnly value={caption} className="text-sm" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(caption);
                    toast.success("Legenda copiada.");
                  }}
                >
                  Copiar legenda
                </Button>
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {slides.map((slide) => (
                <Card key={slide.id} className="shadow-sm overflow-hidden">
                  <div className="aspect-square bg-muted relative">
                    {slide.final_png_url ? (
                      <img
                        src={slide.final_png_url}
                        alt={`Slide ${slide.slide_n}`}
                        className="h-full w-full object-cover"
                      />
                    ) : slide.raw_image_url ? (
                      <img
                        src={slide.raw_image_url}
                        alt=""
                        className="h-full w-full object-cover opacity-50 blur-sm"
                      />
                    ) : (
                      <Skeleton className="h-full w-full" />
                    )}
                    <Badge
                      className="absolute top-2 left-2 font-normal"
                      variant={slide.status === "failed" ? "destructive" : "secondary"}
                    >
                      {slide.slide_n} · {STATUS_LABEL[slide.status] ?? slide.status}
                    </Badge>
                  </div>
                  <CardContent className="p-3 space-y-1">
                    <p className="text-sm font-medium truncate">
                      {slide.copy_data?.headline ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {slide.error_message ?? slide.copy_data?.sub_text ?? slide.template_id}
                    </p>
                    {slide.final_png_url ? (
                      <a
                        href={slide.final_png_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-forest-deep hover:text-accent"
                      >
                        <Download className="h-3 w-3" /> Abrir arte
                      </a>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>

            {allReady ? (
              <Button onClick={handlePublish} disabled={publishing}>
                {publishing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Instagram className="h-4 w-4 mr-2" />
                )}
                {publishing ? "Publicando..." : "Publicar no Instagram"}
              </Button>
            ) : null}
          </>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar custo da geração</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Gerar as artes deste post custa aproximadamente{" "}
                  <strong>{formatUsd(plannedEstimate.estimado)}</strong>, podendo chegar a{" "}
                  <strong>{formatUsd(plannedEstimate.maximo)}</strong> se algum slide precisar de
                  uma segunda tentativa.
                </p>
                <p>
                  São {slides.filter((s) => s.needs_image !== false).length} imagem(ns) geradas por
                  IA. O valor é cobrado mesmo que você descarte o resultado.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                void runGenerate();
              }}
            >
              Gerar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
