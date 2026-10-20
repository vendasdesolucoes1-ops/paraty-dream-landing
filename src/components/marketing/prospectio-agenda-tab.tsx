// Aba "Agenda" — posts que a agência agenda no Prospectio para o Instagram do
// Moradas: dias, legendas, artes, status e métricas, atualizando sozinha.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  ImageIcon,
  Link2,
  RotateCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  agruparPorDia,
  chaveConfigProspectio,
  chaveFeedProspectio,
  dataHoraDoPost,
  ErroFeedProspectio,
  horaDoPost,
  rotuloDia,
  STATUS_PROSPECTIO,
  useConfigProspectio,
  useFeedProspectio,
  type PostProspectio,
} from "@/lib/prospectio-feed";
import { Bloco } from "@/components/ds/bloco";
import { Chip } from "@/components/ds/chip";
import { Pill } from "@/components/ds/pill";
import { atraso } from "@/components/ds/reveal";
import { SkeletonRows } from "@/components/ds/query-state";
import { Campo, SeloIcone } from "@/components/ajustes/campos";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useContagem } from "@/hooks/use-contagem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Filtro = "proximos" | "publicados" | "falhas" | "todos";

const numero = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR"));

function Kpi({ label, valor }: { label: string; valor: number }) {
  const animado = useContagem(valor);
  return (
    <div className="px-6 py-5">
      <p className="text-[0.8125rem] text-muted-foreground">{label}</p>
      <p className="num mt-1 font-sans text-[1.875rem] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground">
        {(animado ?? valor).toLocaleString("pt-BR")}
      </p>
    </div>
  );
}

function Metricas({ post, compacto = false }: { post: PostProspectio; compacto?: boolean }) {
  const m = post.metricas;
  if (!m) {
    return (
      <p className="text-xs text-muted-foreground">
        {post.status === "publicado" ? "Métricas chegando…" : null}
      </p>
    );
  }
  const itens = [
    ["Alcance", m.reach],
    ["Visualizações", m.views],
    ["Curtidas", m.likes],
    ["Comentários", m.comments],
    ["Salvamentos", m.saved],
    ["Compartilh.", m.shares],
  ] as const;
  return (
    <dl
      className={cn(
        "grid gap-x-4 gap-y-1 text-xs",
        compacto ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-2 sm:grid-cols-3",
      )}
    >
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo} className="min-w-0">
          <dt className="truncate text-muted-foreground">{rotulo}</dt>
          <dd className="num font-semibold tabular-nums text-foreground">{numero(valor)}</dd>
        </div>
      ))}
    </dl>
  );
}

function LinhaPost({
  post,
  indice,
  onAbrir,
}: {
  post: PostProspectio;
  indice: number;
  onAbrir: () => void;
}) {
  const status = STATUS_PROSPECTIO[post.status] ?? STATUS_PROSPECTIO.rascunho;
  const capa = post.imagens[0];
  return (
    <li className="animate-swap" style={atraso(indice, 35, 350)}>
      <article className="card-hover flex gap-4 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-card)] sm:p-4">
        <button
          type="button"
          onClick={onAbrir}
          aria-label={`Abrir ${post.titulo ?? "post"}`}
          className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-28 sm:w-28"
        >
          {capa ? (
            <img src={capa} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-muted-foreground/50">
              <ImageIcon className="h-6 w-6" aria-hidden />
            </span>
          )}
          {post.imagens.length > 1 ? (
            <span className="absolute right-1.5 top-1.5 rounded-full bg-card/90 px-1.5 text-[0.7rem] font-medium tabular-nums">
              {post.imagens.length}
            </span>
          ) : null}
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {post.agendado_para ? (
              <span className="num text-sm font-semibold tabular-nums">
                {horaDoPost(post.agendado_para)}
              </span>
            ) : null}
            <Pill tone={status.tone} dot>
              {status.label}
            </Pill>
            {post.plataforma !== "Instagram" ? <Pill>{post.plataforma}</Pill> : null}
          </div>
          <button
            type="button"
            onClick={onAbrir}
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="line-clamp-2 whitespace-pre-line text-[0.875rem] leading-snug text-foreground">
              {post.legenda || post.titulo || "Sem legenda"}
            </p>
          </button>
          {post.erro_publicacao ? (
            <p className="line-clamp-2 text-xs text-danger">{post.erro_publicacao}</p>
          ) : null}
          {post.status === "publicado" ? (
            <div className="mt-auto pt-1">
              <Metricas post={post} compacto />
            </div>
          ) : null}
        </div>
      </article>
    </li>
  );
}

function PreviewPost({ post, onFechar }: { post: PostProspectio | null; onFechar: () => void }) {
  const [slide, setSlide] = useState(0);
  useEffect(() => setSlide(0), [post?.id]);
  if (!post) return null;
  const status = STATUS_PROSPECTIO[post.status] ?? STATUS_PROSPECTIO.rascunho;
  const total = post.imagens.length;

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
            {post.agendado_para ? dataHoraDoPost(post.agendado_para) : "Sem data"}
            <Pill tone={status.tone} dot>
              {status.label}
            </Pill>
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="relative overflow-hidden rounded-xl bg-muted">
            {total ? (
              <img src={post.imagens[slide]} alt="" className="w-full object-contain" />
            ) : (
              <span className="flex aspect-square items-center justify-center text-muted-foreground/50">
                <ImageIcon className="h-8 w-8" aria-hidden />
              </span>
            )}
            {total > 1 ? (
              <>
                <Button
                  size="icon"
                  variant="secondary"
                  aria-label="Imagem anterior"
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full"
                  onClick={() => setSlide((s) => (s - 1 + total) % total)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  aria-label="Próxima imagem"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full"
                  onClick={() => setSlide((s) => (s + 1) % total)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-card/90 px-2 text-xs tabular-nums">
                  {slide + 1}/{total}
                </span>
              </>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[0.8125rem] font-medium text-muted-foreground">Legenda</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(post.legenda_completa);
                    toast.success("Legenda copiada.");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar
                </Button>
              </div>
              <p className="whitespace-pre-line text-sm leading-relaxed">
                {post.legenda_completa || "Sem legenda"}
              </p>
            </div>
            {post.erro_publicacao ? (
              <p className="text-sm text-danger">{post.erro_publicacao}</p>
            ) : null}
            {post.status === "publicado" ? (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-[0.8125rem] font-medium text-muted-foreground">Métricas</p>
                <Metricas post={post} />
                {post.metricas ? (
                  <p className="text-xs text-muted-foreground">
                    Atualizado em {dataHoraDoPost(post.metricas.atualizado_em)}
                    {post.metricas.erro ? " · última consulta ao Instagram falhou" : ""}
                  </p>
                ) : null}
              </div>
            ) : null}
            {post.instagram_permalink ? (
              <a
                href={post.instagram_permalink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium underline decoration-border underline-offset-4 hover:decoration-foreground"
              >
                Ver no Instagram <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConexaoProspectioCard({ defaultOpen }: { defaultOpen: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const [token, setToken] = useState("");
  const [url, setUrl] = useState("");
  const { data: config } = useConfigProspectio();
  const configurado = Boolean(config?.token);

  useEffect(() => setOpen(defaultOpen), [defaultOpen]);
  useEffect(() => {
    if (config) {
      setToken(config.token);
      setUrl(config.url);
    }
  }, [config]);

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("configuracoes").upsert(
        [
          { chave: "prospectio_feed_token", valor: token.trim() },
          { chave: "prospectio_feed_url", valor: url.trim() },
        ],
        { onConflict: "chave" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conexão com o Prospectio salva.");
      queryClient.invalidateQueries({ queryKey: chaveConfigProspectio });
      queryClient.invalidateQueries({ queryKey: chaveFeedProspectio });
    },
    onError: () => toast.error("Erro ao salvar a conexão com o Prospectio."),
  });

  return (
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 p-6 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="flex min-w-0 items-center gap-3">
              <SeloIcone icone={Link2} />
              <span className="min-w-0">
                <span className="block font-sans text-[1.0625rem] font-semibold leading-snug tracking-[-0.011em]">
                  Conexão com o Prospectio
                </span>
                <span className="mt-1 flex">
                  <Pill tone={configurado ? "success" : "neutral"} dot>
                    {configurado ? "Token salvo" : "Não configurado"}
                  </Pill>
                </span>
              </span>
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-[var(--ease-out)]",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="max-w-xl space-y-5 border-t border-border pt-6">
            <Campo id="prospectio_feed_token" label="Token da integração">
              <Input
                id="prospectio_feed_token"
                type="password"
                placeholder="pio_mkt_…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </Campo>
            <Campo id="prospectio_feed_url" label="Endereço (opcional)">
              <Input
                id="prospectio_feed_url"
                placeholder="https://prospectio.com.br/api/integracoes/marketing/posts"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Campo>
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando..." : "Salvar conexão"}
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              No Prospectio, entre com a conta do Moradas de Paraty e vá em Marketing → Meu
              Instagram → Integração externa → Gerar token. Cole o token aqui; ele fica guardado no
              banco do Moradas e só a gestão vê.
            </p>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function ProspectioAgendaTab() {
  const feed = useFeedProspectio();
  const [filtro, setFiltro] = useState<Filtro>("proximos");
  const [abertoId, setAbertoId] = useState<string | null>(null);

  const posts = useMemo(() => feed.data?.posts ?? [], [feed.data]);
  const agora = Date.now();
  const proximos = posts.filter(
    (p) =>
      (p.status === "agendado" || p.status === "publicando") &&
      (!p.agendado_para || new Date(p.agendado_para).getTime() >= agora - 60 * 60_000),
  );
  const publicados = posts.filter((p) => p.status === "publicado");
  const falhas = posts.filter((p) => p.status === "falhou");
  const alcance = publicados.reduce((acc, p) => acc + (p.metricas?.reach ?? 0), 0);
  const engajamento = publicados.reduce((acc, p) => acc + (p.metricas?.engajamento ?? 0), 0);

  const visiveis =
    filtro === "proximos"
      ? proximos
      : filtro === "publicados"
        ? // Publicados: o mais recente primeiro.
          [...publicados].reverse()
        : filtro === "falhas"
          ? falhas
          : posts;
  const grupos = agruparPorDia(visiveis);
  const aberto = posts.find((p) => p.id === abertoId) ?? null;

  const erro = feed.error instanceof ErroFeedProspectio ? feed.error : null;
  const naoConfigurado = erro?.naoConfigurado ?? false;

  return (
    <div className="space-y-10">
      {feed.isPending ? (
        <SkeletonRows rows={5} className="h-28" />
      ) : feed.isError ? (
        <EmptyState
          icon={CalendarClock}
          title={naoConfigurado ? "Conecte o Prospectio" : "Não foi possível carregar a agenda"}
          description={
            feed.error?.message ||
            "Tente de novo em instantes. Se persistir, confira a conexão abaixo."
          }
          action={
            naoConfigurado ? undefined : (
              <Button variant="outline" onClick={() => feed.refetch()} disabled={feed.isFetching}>
                <RotateCw className={cn("h-4 w-4", feed.isFetching && "animate-spin")} /> Tentar de
                novo
              </Button>
            )
          }
        />
      ) : (
        <>
          <div
            role="group"
            aria-label="Resumo da agenda"
            className="grid grid-cols-2 divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] max-md:[&>*:nth-child(n+3)]:border-t max-md:[&>*:nth-child(even)]:border-l md:grid-cols-4 md:divide-x [&>*]:border-border"
          >
            <Kpi label="Próximos agendados" valor={proximos.length} />
            <Kpi label="Publicados" valor={publicados.length} />
            <Kpi label="Alcance somado" valor={alcance} />
            <Kpi label="Engajamento somado" valor={engajamento} />
          </div>

          <Bloco
            titulo="Agenda de publicações"
            descricao={
              <>
                {feed.data?.conta.instagram_username
                  ? `@${feed.data.conta.instagram_username} · `
                  : ""}
                Atualizado às {horaDoPost(feed.data!.gerado_em)} · atualiza sozinho a cada minuto
              </>
            }
            acao={
              <Button
                size="sm"
                variant="outline"
                onClick={() => feed.refetch()}
                disabled={feed.isFetching}
              >
                <RotateCw className={cn("h-3.5 w-3.5", feed.isFetching && "animate-spin")} />
                Atualizar
              </Button>
            }
          >
            <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filtrar posts">
              <Chip
                ativo={filtro === "proximos"}
                onClick={() => setFiltro("proximos")}
                contagem={proximos.length}
              >
                Próximos
              </Chip>
              <Chip
                ativo={filtro === "publicados"}
                onClick={() => setFiltro("publicados")}
                contagem={publicados.length}
              >
                Publicados
              </Chip>
              {falhas.length > 0 ? (
                <Chip
                  ativo={filtro === "falhas"}
                  onClick={() => setFiltro("falhas")}
                  contagem={falhas.length}
                >
                  Falhas
                </Chip>
              ) : null}
              <Chip
                ativo={filtro === "todos"}
                onClick={() => setFiltro("todos")}
                contagem={posts.length}
              >
                Todos
              </Chip>
            </div>

            {visiveis.length === 0 ? (
              <p className="animate-swap rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                Nenhum post neste filtro.
              </p>
            ) : (
              <div key={filtro} className="space-y-8">
                {grupos.map((grupo) => (
                  <section key={grupo.dia ?? "sem-data"}>
                    <h3 className="mb-3 text-[0.8125rem] font-semibold capitalize text-muted-foreground">
                      {grupo.dia ? rotuloDia(grupo.posts[0].agendado_para!) : "Sem data"}
                    </h3>
                    <ul className="grid gap-3 lg:grid-cols-2">
                      {grupo.posts.map((post, i) => (
                        <LinhaPost
                          key={post.id}
                          post={post}
                          indice={i}
                          onAbrir={() => setAbertoId(post.id)}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </Bloco>
        </>
      )}

      <ConexaoProspectioCard defaultOpen={naoConfigurado} />
      <PreviewPost post={aberto} onFechar={() => setAbertoId(null)} />
    </div>
  );
}
