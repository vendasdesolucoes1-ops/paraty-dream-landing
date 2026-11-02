// Gaveta de uma campanha, conjunto ou anúncio: criativo (no anúncio), números do
// período, evolução diária e os recortes de público (idade+gênero, plataforma,
// região).
import { useState } from "react";
import { Chip } from "@/components/ds/chip";
import { Pill } from "@/components/ds/pill";
import { PanelEmpty, QueryState, SkeletonRows } from "@/components/ds/query-state";
import { Barras, GraficoSerie, Miniatura } from "@/components/marketing/meta/pecas";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  derivadas,
  formatMoeda,
  formatQtd,
  formatTaxa,
  rotuloBreakdown,
  rotuloObjetivo,
  statusAnuncio,
  type LinhaAnuncio,
  type NivelAnuncio,
  type TipoBreakdown,
} from "@/lib/marketing-calculos";
import { useBreakdown, useSerieAds } from "@/lib/marketing-meta";
import type { Periodo } from "@/lib/relatorios";

const NIVEL_LABEL: Record<NivelAnuncio, string> = {
  campanha: "Campanha",
  conjunto: "Conjunto de anúncios",
  anuncio: "Anúncio",
};

const RECORTES: { tipo: TipoBreakdown; label: string }[] = [
  { tipo: "idade_genero", label: "Idade e gênero" },
  { tipo: "plataforma_posicao", label: "Onde apareceu" },
  { tipo: "regiao", label: "Região" },
];

export function AnuncioDetalhe({
  item,
  nivel,
  periodo,
  moeda,
  onClose,
}: {
  item: LinhaAnuncio | null;
  nivel: NivelAnuncio;
  periodo: Periodo;
  moeda: string | null | undefined;
  onClose: () => void;
}) {
  return (
    <Sheet open={item !== null} onOpenChange={(aberto) => (aberto ? null : onClose())}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {item ? <Conteudo item={item} nivel={nivel} periodo={periodo} moeda={moeda} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Conteudo({
  item,
  nivel,
  periodo,
  moeda,
}: {
  item: LinhaAnuncio;
  nivel: NivelAnuncio;
  periodo: Periodo;
  moeda: string | null | undefined;
}) {
  const status = statusAnuncio(item.effective_status);
  const d = derivadas(item);
  const filtro = { nivel, id: item.id };
  const serie = useSerieAds(periodo, filtro);
  const [recorte, setRecorte] = useState<TipoBreakdown>("idade_genero");
  const breakdown = useBreakdown(periodo, recorte, filtro);
  const orcamento =
    item.orcamento_diario != null
      ? `${formatMoeda(item.orcamento_diario / 100, moeda)} por dia`
      : item.orcamento_total != null
        ? `${formatMoeda(item.orcamento_total / 100, moeda)} no total`
        : null;

  const numeros: [string, string][] = [
    ["Investimento", formatMoeda(item.investimento, moeda)],
    ["Leads", formatQtd(item.leads)],
    ["Custo por lead", formatMoeda(d.cpl, moeda)],
    ["Conversas iniciadas", formatQtd(item.mensagens)],
    ["Cliques no link", formatQtd(item.cliques_link)],
    ["CTR", formatTaxa(d.ctr)],
    ["Impressões", formatQtd(item.impressoes)],
    ["CPM", formatMoeda(d.cpm, moeda)],
  ];

  return (
    <div className="space-y-8 pb-6">
      <SheetHeader className="space-y-2 pr-8 text-left">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {NIVEL_LABEL[nivel]}
        </p>
        <SheetTitle className="font-display text-[1.6rem] font-medium leading-tight">
          {item.nome ?? item.id}
        </SheetTitle>
        <SheetDescription asChild>
          <div className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
            <Pill tone={status.tone} dot>
              {status.label}
            </Pill>
            {item.objetivo ? <span>{rotuloObjetivo(item.objetivo)}</span> : null}
            {orcamento ? <span>· {orcamento}</span> : null}
          </div>
        </SheetDescription>
        {nivel !== "campanha" && item.campanha_nome ? (
          <p className="text-[0.8125rem] text-muted-foreground">
            {item.campanha_nome}
            {nivel === "anuncio" && item.conjunto_nome ? ` › ${item.conjunto_nome}` : ""}
          </p>
        ) : null}
      </SheetHeader>

      {nivel === "anuncio" ? (
        <section aria-label="Criativo" className="flex gap-4 rounded-xl border border-border p-4">
          <Miniatura src={item.thumbnail_url} className="h-24 w-24" alt="Criativo do anúncio" />
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-foreground">{item.titulo ?? "Sem título"}</p>
            {item.corpo ? (
              <p className="line-clamp-5 whitespace-pre-line text-[0.8125rem] text-muted-foreground">{item.corpo}</p>
            ) : (
              <p className="text-[0.8125rem] text-muted-foreground">Sem texto no criativo.</p>
            )}
          </div>
        </section>
      ) : null}

      <section aria-label="Números do período">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {numeros.map(([rotulo, valor]) => (
            <div key={rotulo} className="min-w-0">
              <dt className="text-[0.75rem] text-muted-foreground">{rotulo}</dt>
              <dd className="num mt-0.5 truncate text-[1.125rem] text-foreground">{valor}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Evolução diária" className="space-y-6">
        <QueryState query={serie} skeleton={<SkeletonRows rows={1} className="h-32" />}>
          {(pontos) => (
            <>
              <GraficoSerie
                titulo="Investimento por dia"
                altura={110}
                pontos={pontos.map((p) => ({ data: p.data, valor: p.investimento }))}
              />
              <GraficoSerie
                titulo="Leads por dia"
                altura={110}
                pontos={pontos.map((p) => ({ data: p.data, valor: p.leads }))}
              />
            </>
          )}
        </QueryState>
      </section>

      <section aria-label="Público" className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Recorte do público">
          {RECORTES.map((r) => (
            <Chip key={r.tipo} ativo={recorte === r.tipo} onClick={() => setRecorte(r.tipo)}>
              {r.label}
            </Chip>
          ))}
        </div>
        <QueryState
          query={breakdown}
          skeleton={<SkeletonRows rows={4} className="h-8" />}
          isEmpty={(linhas) => linhas.length === 0}
          empty={<PanelEmpty>Sem dados deste recorte no período.</PanelEmpty>}
        >
          {(linhas) => (
            <div key={recorte} className="animate-swap">
              <Barras
                rotulo={`Investimento por ${RECORTES.find((r) => r.tipo === recorte)?.label.toLowerCase()}`}
                itens={linhas.slice(0, 10).map((l) => ({
                  chave: `${l.dim1}|${l.dim2}`,
                  rotulo: rotuloBreakdown(recorte, l.dim1, l.dim2),
                  valor: l.investimento,
                  detalhe: `${formatMoeda(l.investimento, moeda)} · ${formatQtd(l.leads)} ${l.leads === 1 ? "lead" : "leads"}`,
                }))}
              />
            </div>
          )}
        </QueryState>
      </section>
    </div>
  );
}
