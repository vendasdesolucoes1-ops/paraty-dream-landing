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
  Check,
  ImageIcon,
  ArrowUpRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pill, type Tone } from "@/components/ds/pill";
import { Campo } from "@/components/ajustes/campos";
import { EmptyState } from "@/components/dashboard/empty-state";
import { atraso } from "@/components/ds/reveal";
import { cn } from "@/lib/utils";
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
import { CONFIRM_THRESHOLD_USD, estimatePlannedCost, formatUsd } from "@/lib/imagery-cost";

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
  image_source: string | null;
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

const STATUS_TONE: Record<string, Tone> = {
  pending: "neutral",
  queued: "neutral",
  generating: "info",
  validating: "info",
  composing: "info",
  ready: "success",
  failed: "danger",
};

const ETAPAS = ["Briefing", "Plano", "Artes", "Publicar"] as const;

/** Passos do fluxo: o ponto atual pulsa, os concluídos viram check. */
function Etapas({ atual }: { atual: number }) {
  return (
    <ol
      aria-label="Etapas do post"
      className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-card)] sm:gap-3"
    >
      {ETAPAS.map((nome, i) => {
        const feito = i < atual;
        const ativo = i === atual;
        return (
          <li
            key={nome}
            aria-current={ativo ? "step" : undefined}
            className="flex min-w-0 flex-1 items-center gap-2 last:flex-none sm:gap-3"
          >
            <span
              className={cn(
                "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.75rem] font-semibold tabular-nums transition-[background-color,color,box-shadow] duration-300",
                feito && "bg-success text-primary-foreground",
                ativo && "bg-primary text-primary-foreground ring-4 ring-ring/15",
                !feito && !ativo && "bg-muted text-muted-foreground",
              )}
            >
              {feito ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            <span
              className={cn(
                "truncate text-[0.8125rem] font-medium transition-colors",
                ativo ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {nome}
            </span>
            {i < ETAPAS.length - 1 ? (
              <span aria-hidden className="relative h-px min-w-3 flex-1 bg-border">
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 bg-success transition-[width] duration-500 ease-[var(--ease-out)]",
                    feito ? "w-full" : "w-0",
                  )}
                />
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

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
  // Padrão "imagem_unica" porque a opção Carrossel está oculta no seletor
  // abaixo: deixar o padrão em "carrossel" com a opção escondida daria um
  // Select sem rótulo visível e um post de N slides sem ninguém ter pedido.
  const [tipo, setTipo] = useState("imagem_unica");
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
  const etapa = !postId
    ? 0
    : allReady
      ? 3
      : generating || slides.some((s) => s.status !== "pending")
        ? 2
        : 1;
  const caption = useMemo(() => {
    const c = post?.copy_data;
    if (!c) return "";
    const tags = (c.hashtags ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
    return [c.caption, tags].filter(Boolean).join("\n\n");
  }, [post]);

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <div className="lg:col-span-2">
        <Etapas atual={etapa} />
      </div>

      <Card className="h-fit lg:sticky lg:top-6">
        <CardHeader className="flex-row items-center gap-3 space-y-0 p-6 pb-5">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground ring-1 ring-border"
          >
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <div>
            <CardTitle className="text-[1.0625rem] leading-snug">Briefing</CardTitle>
            <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
              Conte a ideia; a IA monta o resto.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 border-t border-border pt-6">
          <Campo id="tema" label="Tema do post">
            <Textarea
              id="tema"
              rows={3}
              placeholder="Ex.: as cachoeiras a poucos minutos do loteamento"
              value={tema}
              onChange={(e) => setTema(e.target.value)}
            />
          </Campo>

          <Campo label="Pilar de conteúdo">
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
          </Campo>

          <Campo label="Objetivo">
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
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Formato">
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Carrossel oculto por ora: cada slide é uma geração de
                      imagem paga e uma chance a mais de sair torto. O suporte
                      continua inteiro no back — para reativar, basta devolver
                      esta linha:
                      <SelectItem value="carrossel">Carrossel</SelectItem> */}
                  <SelectItem value="imagem_unica">Imagem única</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
            <Campo id="n_slides" label="Slides">
              <Input
                id="n_slides"
                type="number"
                min={1}
                max={8}
                value={nSlides}
                disabled={isSingle}
                onChange={(e) => setNSlides(e.target.value)}
              />
            </Campo>
          </div>

          {/* Custo estimado não aparece mais no briefing: é informação de
              controle interno, não decisão de quem está escrevendo o post. O
              modelo de custo (estimatePostCost/estimatePlannedCost) segue
              intacto e continua alimentando o diálogo de confirmação antes de
              gastar — só o painel informativo saiu. */}

          {billingError ? (
            <div
              role="alert"
              className="animate-swap rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger"
            >
              <div className="flex gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div className="space-y-1">
                  <p className="font-semibold">{billingError.title}</p>
                  <p className="text-xs leading-relaxed text-foreground/80">
                    {billingError.message}
                  </p>
                  {billingError.requestId ? (
                    <p className="text-[11px] text-muted-foreground">
                      Request ID: {billingError.requestId}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <Button onClick={handlePlan} disabled={planning || generating} className="w-full">
            {planning ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Wand2 className="h-4 w-4" aria-hidden />
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
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden />
              )}
              {generating ? "Gerando artes..." : "Gerar artes"}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-6">
        {!postId ? (
          <EmptyState
            icon={ImageIcon}
            title="A prévia do post aparece aqui"
            description="Descreva o tema e planeje o post — a IA monta o roteiro dos slides, a legenda e as artes no padrão visual do Moradas de Paraty."
          />
        ) : (
          <>
            <Card className="animate-swap">
              <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 p-6 pb-4">
                <CardTitle className="text-[1.0625rem] leading-snug">
                  {post?.copy_data?.titulo || "Plano editorial"}
                </CardTitle>
                {post ? (
                  <Pill className="tabular-nums">
                    US$ {Number(post.custo_total_usd ?? 0).toFixed(3)}
                  </Pill>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  rows={7}
                  readOnly
                  value={caption}
                  aria-label="Legenda do post"
                  className="text-sm"
                />
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
              {slides.map((slide, i) => (
                <div key={slide.id} className="animate-swap" style={atraso(i, 60, 360)}>
                  <Card className="card-hover h-full overflow-hidden">
                    <div className="relative aspect-square bg-muted">
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
                        <Skeleton className="h-full w-full rounded-none" />
                      )}
                      <Pill
                        tone={STATUS_TONE[slide.status] ?? "neutral"}
                        dot
                        className="absolute left-3 top-3 shadow-sm"
                      >
                        {slide.slide_n} · {STATUS_LABEL[slide.status] ?? slide.status}
                      </Pill>
                    </div>
                    <CardContent className="space-y-1 p-4">
                      <p className="truncate text-sm font-semibold">
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
                          className="mt-1 inline-flex items-center gap-1 rounded text-xs font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Download className="h-3 w-3" aria-hidden /> Abrir arte
                          <ArrowUpRight className="h-3 w-3" aria-hidden />
                        </a>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>

            {allReady ? (
              <Button onClick={handlePublish} disabled={publishing}>
                {publishing ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Instagram className="h-4 w-4" aria-hidden />
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
                  São{" "}
                  {
                    slides.filter((s) => s.needs_image !== false && s.image_source === "gerar")
                      .length
                  }{" "}
                  imagem(ns) geradas por IA — as demais vêm do acervo, sem custo. O valor é cobrado
                  mesmo que você descarte o resultado.
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
