// Aba Anúncios: campanhas, conjuntos e anúncios com os números do período.
// Um clique na linha abre a gaveta com criativo, evolução e público.
import { useMemo, useState } from "react";
import { AlertTriangle, Megaphone } from "lucide-react";
import { Bloco } from "@/components/ds/bloco";
import { Chip } from "@/components/ds/chip";
import { Pill } from "@/components/ds/pill";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import { EmptyState } from "@/components/dashboard/empty-state";
import { AnuncioDetalhe } from "@/components/marketing/meta/anuncio-detalhe";
import { Miniatura, SemDadosMeta } from "@/components/marketing/meta/pecas";
import { SaldoAoVivo } from "@/components/marketing/meta/saldo";
import { SincronizacaoAds } from "@/components/marketing/meta/sincronizacao-ads";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  derivadas,
  formatMoeda,
  formatQtd,
  formatTaxa,
  grupoStatus,
  statusAnuncio,
  type GrupoStatus,
  type LinhaAnuncio,
  type AlcanceItem,
  type NivelAnuncio,
  avisosDaLinha,
  formatNumero,
  publicoCansado,
  resultadoDaLinha,
  rotuloDestino,
  totaisSemDuplicar,
} from "@/lib/marketing-calculos";
import { useAlcance, useAnuncios, useResumoAds, useStatusIntegracao } from "@/lib/marketing-meta";
import type { Periodo } from "@/lib/relatorios";
import { cn } from "@/lib/utils";

const NIVEIS: { valor: NivelAnuncio; label: string }[] = [
  { valor: "campanha", label: "Campanhas" },
  { valor: "conjunto", label: "Conjuntos" },
  { valor: "anuncio", label: "Anúncios" },
];

type Filtro = "com_gasto" | GrupoStatus | "todos";

const FILTROS: { valor: Filtro; label: string }[] = [
  { valor: "com_gasto", label: "Com investimento" },
  { valor: "ativos", label: "Ativos" },
  { valor: "pausados", label: "Pausados" },
  { valor: "arquivados", label: "Arquivados" },
  { valor: "todos", label: "Todos" },
];

function passa(l: LinhaAnuncio, filtro: Filtro): boolean {
  if (filtro === "todos") return true;
  if (filtro === "com_gasto") return l.investimento > 0;
  return grupoStatus(l.effective_status) === filtro;
}

export function Anuncios({
  periodo,
  podeSincronizar = false,
}: {
  periodo: Periodo;
  podeSincronizar?: boolean;
}) {
  const status = useStatusIntegracao();
  const [nivel, setNivel] = useState<NivelAnuncio>("campanha");
  const [filtro, setFiltro] = useState<Filtro>("com_gasto");
  const [aberto, setAberto] = useState<LinhaAnuncio | null>(null);
  const q = useAnuncios(periodo, nivel);
  const alcance = useAlcance(periodo, nivel);
  const moeda = useResumoAds(periodo).data?.atual?.moeda;

  const contagem = useMemo(() => {
    const c: Record<Filtro, number> = {
      com_gasto: 0,
      ativos: 0,
      pausados: 0,
      arquivados: 0,
      outros: 0,
      todos: 0,
    };
    for (const l of q.data ?? []) for (const f of FILTROS) if (passa(l, f.valor)) c[f.valor]++;
    return c;
  }, [q.data]);

  if (status.data && status.data.length === 0) return <SemDadosMeta />;

  return (
    <div className="space-y-8">
      <SincronizacaoAds podeSincronizar={podeSincronizar} />
      <SaldoAoVivo />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Nível">
          {NIVEIS.map((n) => (
            <Chip key={n.valor} ativo={nivel === n.valor} onClick={() => setNivel(n.valor)}>
              {n.label}
            </Chip>
          ))}
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Filtrar por situação"
          title="Contagem neste nível: uma campanha arquivada sem anúncios não aparece em Anúncios."
        >
          {FILTROS.map((f) => (
            <Chip
              key={f.valor}
              ativo={filtro === f.valor}
              onClick={() => setFiltro(f.valor)}
              contagem={q.data ? contagem[f.valor] : undefined}
            >
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      <Bloco
        titulo={NIVEIS.find((n) => n.valor === nivel)!.label}
        descricao={
          alcance.isError
            ? "Números do período. O alcance não pôde ser lido na Meta agora; tente de novo em instantes."
            : "Números do período. Alcance e frequência vêm direto da Meta para o período inteiro."
        }
      >
        <QueryState
          query={q}
          skeleton={<SkeletonRows rows={6} />}
          isEmpty={(d) => d.filter((l) => passa(l, filtro)).length === 0}
          empty={
            <EmptyState
              icon={Megaphone}
              title="Nada por aqui"
              description={
                filtro === "com_gasto"
                  ? "Nenhum item teve investimento neste período. Troque o período ou veja todos."
                  : "Nenhum item nesta situação."
              }
            />
          }
        >
          {(d) => (
            <TabelaAnuncios
              key={`${nivel}-${filtro}`}
              linhas={d.filter((l) => passa(l, filtro))}
              nivel={nivel}
              moeda={moeda}
              alcance={alcance.data?.itens}
              carregandoAlcance={alcance.isPending}
              onAbrir={setAberto}
            />
          )}
        </QueryState>
      </Bloco>

      <AnuncioDetalhe
        item={aberto}
        nivel={nivel}
        periodo={periodo}
        moeda={moeda}
        alcance={aberto ? alcance.data?.itens[aberto.id] : undefined}
        onClose={() => setAberto(null)}
      />
    </div>
  );
}

function TabelaAnuncios({
  linhas,
  nivel,
  moeda,
  alcance,
  carregandoAlcance,
  onAbrir,
}: {
  linhas: LinhaAnuncio[];
  nivel: NivelAnuncio;
  moeda: string | null | undefined;
  alcance: Record<string, AlcanceItem> | undefined;
  carregandoAlcance: boolean;
  onAbrir: (l: LinhaAnuncio) => void;
}) {
  const ordenadas = [...linhas].sort(
    (a, b) =>
      b.investimento - a.investimento || (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"),
  );
  const total = ordenadas.reduce(
    (t, l) => ({
      impressoes: t.impressoes + l.impressoes,
      cliques_link: t.cliques_link + l.cliques_link,
    }),
    { impressoes: 0, cliques_link: 0 },
  );
  const tc = totaisSemDuplicar(ordenadas);
  const dt = derivadas({
    investimento: tc.investimento,
    impressoes: total.impressoes,
    cliques: 0,
    cliques_link: total.cliques_link,
    leads: 0,
    mensagens: 0,
  });
  const sub = "block text-[0.72rem] font-normal text-muted-foreground";

  return (
    <Table className="animate-swap">
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-[16rem]">Nome</TableHead>
          <TableHead className="text-right">Investimento</TableHead>
          <TableHead className="text-right">Orçamento/dia</TableHead>
          <TableHead className="text-right">Alcance</TableHead>
          <TableHead className="text-right">Impressões</TableHead>
          <TableHead className="text-right">Cliques no link</TableHead>
          <TableHead className="text-right">Resultado</TableHead>
          <TableHead className="text-right">Custo por resultado</TableHead>
          <TableHead className="text-right">Leads</TableHead>
          <TableHead className="text-right">Conversas</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ordenadas.map((l) => {
          const d = derivadas(l);
          const res = resultadoDaLinha(l);
          const st = statusAnuncio(l.effective_status);
          const av = avisosDaLinha(l.avisos);
          const al = alcance?.[l.id];
          const cansado = publicoCansado(al?.frequencia);
          const destino = rotuloDestino(l.destino);
          const subtitulo =
            nivel === "anuncio"
              ? [l.campanha_nome, l.conjunto_nome].filter(Boolean).join(" › ")
              : nivel === "conjunto"
                ? l.campanha_nome
                : null;
          return (
            <TableRow key={l.id} className="cursor-pointer" onClick={() => onAbrir(l)}>
              <TableCell>
                <div className="flex items-center gap-3">
                  {nivel === "anuncio" ? (
                    <Miniatura src={l.thumbnail_url} className="h-9 w-9" />
                  ) : null}
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAbrir(l);
                      }}
                      className="max-w-[22rem] truncate text-left font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {l.nome ?? l.id}
                    </button>
                    <div className="mt-0.5 flex min-w-0 items-center gap-2">
                      <Pill tone={st.tone} dot className="shrink-0">
                        {st.label}
                      </Pill>
                      {destino ? (
                        <span className="shrink-0 text-[0.72rem] text-muted-foreground">
                          {destino}
                        </span>
                      ) : null}
                      {subtitulo ? (
                        <span className="truncate text-[0.75rem] text-muted-foreground">
                          {subtitulo}
                        </span>
                      ) : null}
                    </div>
                    {av.length ? (
                      <p
                        className={cn(
                          "mt-1 flex max-w-[24rem] items-start gap-1 text-[0.72rem] leading-snug",
                          av[0].tom === "danger" ? "text-danger" : "text-warning",
                        )}
                        title={av.map((a) => a.texto).join("\n")}
                      >
                        <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
                        <span className="line-clamp-2">
                          {av[0].texto}
                          {av.length > 1 ? ` (+${av.length - 1})` : ""}
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums text-foreground">
                {formatMoeda(l.investimento, moeda)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {l.orcamento_diario != null ? formatMoeda(l.orcamento_diario / 100, moeda) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {carregandoAlcance ? (
                  <span className="ml-auto block h-4 w-12 animate-pulse rounded bg-muted" />
                ) : (
                  <>
                    <span className="block text-foreground">{formatQtd(al?.alcance ?? null)}</span>
                    {al?.frequencia != null ? (
                      <span
                        className={cn(sub, cansado && "font-medium text-warning")}
                        title={
                          cansado
                            ? "Frequência acima de 2,5: o público está cansado do criativo"
                            : undefined
                        }
                      >
                        freq. {formatNumero(al.frequencia, 2)}
                        {cansado ? " · público cansado" : ""}
                      </span>
                    ) : null}
                  </>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="block text-foreground">{formatQtd(l.impressoes)}</span>
                <span className={sub}>CPM {formatMoeda(d.cpm, moeda)}</span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="block text-foreground">{formatQtd(l.cliques_link)}</span>
                <span className={sub}>
                  CTR {formatTaxa(d.ctr)} · CPC {formatMoeda(d.cpc, moeda)}
                </span>
              </TableCell>
              <TableCell
                className={cn(
                  "whitespace-nowrap text-right tabular-nums",
                  res.quantidade > 0 && "font-medium text-foreground",
                )}
              >
                {formatQtd(res.quantidade)}{" "}
                <span className="font-normal text-muted-foreground">{res.rotulo}</span>
              </TableCell>
              <TableCell className="text-right tabular-nums text-foreground">
                {formatMoeda(res.custo, moeda)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatQtd(l.leads)}</TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="block">{formatQtd(l.mensagens)}</span>
                {res.tipo === "lead" && l.mensagens > 0 ? (
                  <span className={sub}>dos mesmos leads</span>
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      <TableFooter>
        <TableRow className="font-medium">
          <TableCell>
            Total · {formatQtd(ordenadas.length)} {ordenadas.length === 1 ? "item" : "itens"}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {formatMoeda(tc.investimento, moeda)}
          </TableCell>
          <TableCell className="text-right tabular-nums">—</TableCell>
          <TableCell className="text-right tabular-nums text-muted-foreground">—</TableCell>
          <TableCell className="text-right tabular-nums">
            <span className="block">{formatQtd(total.impressoes)}</span>
            <span className={sub}>CPM {formatMoeda(dt.cpm, moeda)}</span>
          </TableCell>
          <TableCell className="text-right tabular-nums">
            <span className="block">{formatQtd(total.cliques_link)}</span>
            <span className={sub}>CPC {formatMoeda(dt.cpc, moeda)}</span>
          </TableCell>
          <TableCell className="whitespace-nowrap text-right tabular-nums">
            {formatQtd(tc.contatos)}{" "}
            <span className="font-normal text-muted-foreground">
              {tc.contatos === 1 ? "contato" : "contatos"}
            </span>
          </TableCell>
          <TableCell className="text-right tabular-nums">
            <span className="block">{formatMoeda(tc.custoPorContato, moeda)}</span>
            <span className={sub}>por contato</span>
          </TableCell>
          <TableCell className="text-right tabular-nums">{formatQtd(tc.leads)}</TableCell>
          <TableCell className="text-right tabular-nums">
            <span className="block">{formatQtd(tc.conversas)}</span>
            {tc.leadsQueChamaram > 0 ? (
              <span className={sub}>
                + {formatQtd(tc.leadsQueChamaram)} de {formatQtd(tc.leads)} leads
              </span>
            ) : null}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
