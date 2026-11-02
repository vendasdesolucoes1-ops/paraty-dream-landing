// Aba Instagram: o perfil @moradasdeparaty no período — números da conta,
// evolução diária, quem segue (demografia) e o desempenho de cada post, reel e
// story.
import { useMemo, useState } from "react";
import { ExternalLink, Instagram as IconeInstagram } from "lucide-react";
import { Bloco } from "@/components/ds/bloco";
import { Chip } from "@/components/ds/chip";
import { Pill } from "@/components/ds/pill";
import { PanelEmpty, QueryState, SkeletonRows } from "@/components/ds/query-state";
import { atraso } from "@/components/ds/reveal";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  Barras,
  FaixaIndicadores,
  GraficoSerie,
  Indicador,
  Miniatura,
  SemDadosMeta,
} from "@/components/marketing/meta/pecas";
import {
  engajamento,
  formatDuracaoMs,
  formatQtd,
  formatTaxa,
  metricaIg,
  pivotarSerieIg,
  rotuloDemografia,
  rotuloTipoDemografia,
  TIPO_MIDIA_LABEL,
  variacao,
  type LinhaDemografia,
  type MidiaIg,
  type ResumoIg,
  type TipoMidia,
} from "@/lib/marketing-calculos";
import {
  useDemografiaIg,
  useMidiasIg,
  useResumoIg,
  useSerieIg,
  useStatusIntegracao,
} from "@/lib/marketing-meta";
import type { Periodo } from "@/lib/relatorios";

export function InstagramMeta({ periodo }: { periodo: Periodo }) {
  const status = useStatusIntegracao();
  if (status.data && status.data.length === 0) return <SemDadosMeta />;
  return (
    <div className="space-y-10">
      <NumerosDaConta periodo={periodo} />
      <Evolucao periodo={periodo} />
      <Publico />
      <Publicacoes periodo={periodo} />
    </div>
  );
}

/** Métricas extras que aparecem só se a conta tiver dado delas. */
const OUTRAS: { metrica: string; label: string }[] = [
  { metrica: "likes", label: "Curtidas" },
  { metrica: "comments", label: "Comentários" },
  { metrica: "shares", label: "Compartilhamentos" },
  { metrica: "saves", label: "Salvamentos" },
  { metrica: "replies", label: "Respostas a stories" },
  { metrica: "profile_views", label: "Visitas ao perfil" },
  { metrica: "profile_links_taps", label: "Toques em contato" },
  { metrica: "website_clicks", label: "Cliques no site" },
  { metrica: "reposts", label: "Repostagens" },
];

function NumerosDaConta({ periodo }: { periodo: Periodo }) {
  const q = useResumoIg(periodo);
  const r: ResumoIg[] = q.data ?? [];
  const seguidores = metricaIg(r, "seguidores");
  const ganho =
    seguidores?.valor != null && seguidores.valor_anterior != null
      ? seguidores.valor - seguidores.valor_anterior
      : null;
  const ind = (metrica: string) => {
    const m = metricaIg(r, metrica);
    return { valor: m?.valor, variacao: m ? variacao(m.valor, m.valor_anterior) : undefined };
  };
  const alcance = ind("reach");
  const views = ind("views");
  const engajadas = ind("accounts_engaged");
  const interacoes = ind("total_interactions");
  const outras = OUTRAS.map((o) => ({ ...o, dado: metricaIg(r, o.metrica) })).filter(
    (o) => o.dado?.valor != null,
  );
  const carregando = q.isPending;

  return (
    <Bloco
      titulo="A conta no período"
      descricao="Resultado orgânico, comparado ao período anterior de mesmo tamanho"
    >
      {q.isError ? (
        <QueryState query={q} skeleton={null}>
          {() => null}
        </QueryState>
      ) : (
        <div className="space-y-6">
          <FaixaIndicadores colunas={5}>
            <Indicador
              rotulo="Seguidores"
              carregando={carregando}
              valor={seguidores?.valor}
              formatar={formatQtd}
              rodape={
                ganho === null
                  ? "no fim do período"
                  : `${ganho >= 0 ? "+" : "−"}${formatQtd(Math.abs(ganho))} no período`
              }
            />
            <Indicador
              rotulo="Alcance"
              carregando={carregando}
              valor={alcance.valor}
              formatar={formatQtd}
              variacao={alcance.variacao}
              sentido="maior_melhor"
              rodape="soma diária, aprox."
            />
            <Indicador
              rotulo="Visualizações"
              carregando={carregando}
              valor={views.valor}
              formatar={formatQtd}
              variacao={views.variacao}
              sentido="maior_melhor"
            />
            <Indicador
              rotulo="Contas engajadas"
              carregando={carregando}
              valor={engajadas.valor}
              formatar={formatQtd}
              variacao={engajadas.variacao}
              sentido="maior_melhor"
            />
            <Indicador
              rotulo="Interações"
              carregando={carregando}
              valor={interacoes.valor}
              formatar={formatQtd}
              variacao={interacoes.variacao}
              sentido="maior_melhor"
            />
          </FaixaIndicadores>
          {outras.length ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
              {outras.map((o) => (
                <div key={o.metrica} className="min-w-0">
                  <dt className="text-[0.75rem] text-muted-foreground">{o.label}</dt>
                  <dd className="text-[0.9375rem] tabular-nums text-foreground">
                    {formatQtd(o.dado!.valor)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      )}
    </Bloco>
  );
}

function Evolucao({ periodo }: { periodo: Periodo }) {
  const q = useSerieIg(periodo);
  return (
    <Bloco divisor titulo="Evolução diária">
      <QueryState query={q} skeleton={<SkeletonRows rows={1} className="h-40" />}>
        {(linhas) => {
          const dias = pivotarSerieIg(linhas, periodo.inicio, periodo.fim);
          const serie = (metrica: string) =>
            dias
              .filter((d) => d.valores[metrica] !== undefined)
              .map((d) => ({ data: d.data, valor: d.valores[metrica] }));
          const seguidores = serie("seguidores");
          const alcance = serie("reach");
          const views = serie("views");
          return (
            <div className="grid gap-8 lg:grid-cols-3">
              <GraficoSerie
                titulo="Seguidores"
                total={
                  seguidores.length ? formatQtd(seguidores[seguidores.length - 1].valor) : undefined
                }
                pontos={seguidores}
              />
              <GraficoSerie titulo="Alcance por dia" pontos={alcance} />
              <GraficoSerie titulo="Visualizações por dia" pontos={views} />
            </div>
          );
        }}
      </QueryState>
    </Bloco>
  );
}

const ORDEM_DEMOGRAFIA: LinhaDemografia["tipo"][] = ["age", "gender", "city", "country"];

function Publico() {
  const q = useDemografiaIg();
  return (
    <Bloco
      divisor
      titulo="Quem segue o perfil"
      descricao="Foto mais recente enviada pela Meta (só para contas com 100 seguidores ou mais)"
    >
      <QueryState
        query={q}
        skeleton={<SkeletonRows rows={4} className="h-8" />}
        isEmpty={(d) => d.length === 0}
        empty={<PanelEmpty>A Meta ainda não enviou dados de público para esta conta.</PanelEmpty>}
      >
        {(linhas) => (
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {ORDEM_DEMOGRAFIA.map((tipo) => {
              const doTipo = linhas.filter((l) => l.tipo === tipo);
              if (!doTipo.length) return null;
              const soma = doTipo.reduce((s, l) => s + l.valor, 0);
              const itens = [...doTipo]
                .sort((a, b) =>
                  tipo === "age" ? a.chave.localeCompare(b.chave) : b.valor - a.valor,
                )
                .slice(0, 8);
              return (
                <div key={tipo} className="min-w-0">
                  <h3 className="mb-3 text-[0.8125rem] font-medium text-muted-foreground">
                    {rotuloTipoDemografia(tipo)}
                  </h3>
                  <Barras
                    rotulo={`Seguidores por ${rotuloTipoDemografia(tipo).toLowerCase()}`}
                    itens={itens.map((l) => ({
                      chave: l.chave,
                      rotulo: rotuloDemografia(tipo, l.chave),
                      valor: l.valor,
                      detalhe: soma ? formatTaxa(l.valor / soma, 0) : formatQtd(l.valor),
                    }))}
                  />
                </div>
              );
            })}
          </div>
        )}
      </QueryState>
    </Bloco>
  );
}

type FiltroTipo = "todos" | TipoMidia;
type Ordem = "recentes" | "interacoes" | "alcance";

const FILTROS_TIPO: { valor: FiltroTipo; label: string }[] = [
  { valor: "todos", label: "Tudo" },
  { valor: "FEED", label: "Posts" },
  { valor: "REELS", label: "Reels" },
  { valor: "STORY", label: "Stories" },
];

const ORDENS: { valor: Ordem; label: string }[] = [
  { valor: "recentes", label: "Mais recentes" },
  { valor: "interacoes", label: "Mais interações" },
  { valor: "alcance", label: "Maior alcance" },
];

function Publicacoes({ periodo }: { periodo: Periodo }) {
  const [tipo, setTipo] = useState<FiltroTipo>("todos");
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  const q = useMidiasIg(periodo, tipo === "todos" ? null : tipo);

  return (
    <Bloco
      divisor
      titulo="Publicações do período"
      descricao="Métricas atualizadas todo dia para posts dos últimos 30 dias; stories, de hora em hora enquanto estão no ar"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de publicação">
          {FILTROS_TIPO.map((f) => (
            <Chip key={f.valor} ativo={tipo === f.valor} onClick={() => setTipo(f.valor)}>
              {f.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Ordenar">
          {ORDENS.map((o) => (
            <Chip key={o.valor} ativo={ordem === o.valor} onClick={() => setOrdem(o.valor)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </div>
      <QueryState
        query={q}
        skeleton={
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-hidden>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="skeleton-shimmer aspect-[4/5] rounded-xl bg-muted" />
            ))}
          </div>
        }
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState
            icon={IconeInstagram}
            title="Nenhuma publicação no período"
            description="Troque o período ou o tipo para ver outras publicações."
          />
        }
      >
        {(midias) => <GradeMidias key={`${tipo}-${ordem}`} midias={midias} ordem={ordem} />}
      </QueryState>
    </Bloco>
  );
}

function GradeMidias({ midias, ordem }: { midias: MidiaIg[]; ordem: Ordem }) {
  const ordenadas = useMemo(() => {
    const lista = [...midias];
    if (ordem === "interacoes") lista.sort((a, b) => (b.interacoes ?? -1) - (a.interacoes ?? -1));
    if (ordem === "alcance") lista.sort((a, b) => (b.alcance ?? -1) - (a.alcance ?? -1));
    return lista;
  }, [midias, ordem]);

  return (
    <ul className="grid animate-swap grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {ordenadas.map((m, i) => (
        <li key={m.id} className="animate-rise" style={atraso(i)}>
          <CartaoMidia m={m} />
        </li>
      ))}
    </ul>
  );
}

function CartaoMidia({ m }: { m: MidiaIg }) {
  const tipo = (m.media_product_type ?? "FEED") as TipoMidia;
  const eng = engajamento(m);
  const numeros: [string, string][] = [
    ["Alcance", formatQtd(m.alcance)],
    ["Visualizações", formatQtd(m.views)],
    ["Interações", formatQtd(m.interacoes)],
    tipo === "REELS"
      ? ["Tempo médio", formatDuracaoMs(m.tempo_medio_ms)]
      : tipo === "STORY"
        ? ["Respostas", formatQtd(m.respostas)]
        : ["Engajamento", formatTaxa(eng, 1)],
  ];
  return (
    <article className="card-hover flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative">
        <Miniatura src={m.imagem_url} className="aspect-[4/5] w-full rounded-none" />
        <Pill
          tone={tipo === "STORY" ? "accent" : "neutral"}
          className="absolute left-2.5 top-2.5 shadow-sm"
        >
          {TIPO_MIDIA_LABEL[tipo] ?? "Post"}
        </Pill>
        {m.permalink ? (
          <a
            href={m.permalink}
            target="_blank"
            rel="noreferrer"
            aria-label="Abrir no Instagram"
            className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-card/90 text-foreground shadow-sm transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-[0.8125rem] leading-snug text-foreground">
            {m.caption?.trim() || "Sem legenda"}
          </p>
          <p className="mt-1 text-[0.72rem] tabular-nums text-muted-foreground">
            {m.publicado_em ? new Date(m.publicado_em).toLocaleDateString("pt-BR") : "—"}
          </p>
        </div>
        <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border pt-2.5">
          {numeros.map(([rotulo, valor]) => (
            <div key={rotulo} className="min-w-0">
              <dt className="text-[0.68rem] text-muted-foreground">{rotulo}</dt>
              <dd className="text-[0.8125rem] font-medium tabular-nums text-foreground">{valor}</dd>
            </div>
          ))}
        </dl>
      </div>
    </article>
  );
}
