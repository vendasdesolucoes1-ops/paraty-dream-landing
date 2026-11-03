// Aba Anúncios: campanhas, conjuntos e anúncios com os números do período.
// Um clique na linha abre a gaveta com criativo, evolução e público.
import { useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { Bloco } from "@/components/ds/bloco";
import { Chip } from "@/components/ds/chip";
import { Pill } from "@/components/ds/pill";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import { EmptyState } from "@/components/dashboard/empty-state";
import { AnuncioDetalhe } from "@/components/marketing/meta/anuncio-detalhe";
import { Miniatura, SemDadosMeta } from "@/components/marketing/meta/pecas";
import { SaldoAoVivo } from "@/components/marketing/meta/saldo";
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
  type NivelAnuncio,
} from "@/lib/marketing-calculos";
import { useAnuncios, useResumoAds, useStatusIntegracao } from "@/lib/marketing-meta";
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

export function Anuncios({ periodo }: { periodo: Periodo }) {
  const status = useStatusIntegracao();
  const [nivel, setNivel] = useState<NivelAnuncio>("campanha");
  const [filtro, setFiltro] = useState<Filtro>("com_gasto");
  const [aberto, setAberto] = useState<LinhaAnuncio | null>(null);
  const q = useAnuncios(periodo, nivel);
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
      <SaldoAoVivo />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Nível">
          {NIVEIS.map((n) => (
            <Chip key={n.valor} ativo={nivel === n.valor} onClick={() => setNivel(n.valor)}>
              {n.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por situação">
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
        descricao="Números do período. O alcance não é somado entre dias; por isso a tabela traz impressões."
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
        onClose={() => setAberto(null)}
      />
    </div>
  );
}

function TabelaAnuncios({
  linhas,
  nivel,
  moeda,
  onAbrir,
}: {
  linhas: LinhaAnuncio[];
  nivel: NivelAnuncio;
  moeda: string | null | undefined;
  onAbrir: (l: LinhaAnuncio) => void;
}) {
  const ordenadas = [...linhas].sort(
    (a, b) =>
      b.investimento - a.investimento || (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"),
  );
  const total = ordenadas.reduce(
    (t, l) => ({
      investimento: t.investimento + l.investimento,
      impressoes: t.impressoes + l.impressoes,
      cliques: t.cliques + l.cliques,
      cliques_link: t.cliques_link + l.cliques_link,
      leads: t.leads + l.leads,
      mensagens: t.mensagens + l.mensagens,
    }),
    { investimento: 0, impressoes: 0, cliques: 0, cliques_link: 0, leads: 0, mensagens: 0 },
  );
  const dt = derivadas(total);

  return (
    <Table className="animate-swap">
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-[16rem]">Nome</TableHead>
          <TableHead className="text-right">Investimento</TableHead>
          <TableHead className="text-right">Impressões</TableHead>
          <TableHead className="text-right">Cliques no link</TableHead>
          <TableHead className="text-right">Leads</TableHead>
          <TableHead className="text-right">Custo por lead</TableHead>
          <TableHead className="text-right">Conversas</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ordenadas.map((l) => {
          const d = derivadas(l);
          const st = statusAnuncio(l.effective_status);
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
                      {subtitulo ? (
                        <span className="truncate text-[0.75rem] text-muted-foreground">
                          {subtitulo}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums text-foreground">
                {formatMoeda(l.investimento, moeda)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatQtd(l.impressoes)}</TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="block text-foreground">{formatQtd(l.cliques_link)}</span>
                <span className="block text-[0.72rem] text-muted-foreground">
                  CTR {formatTaxa(d.ctr)}
                </span>
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  l.leads > 0 && "font-medium text-foreground",
                )}
              >
                {formatQtd(l.leads)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatMoeda(d.cpl, moeda)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatQtd(l.mensagens)}</TableCell>
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
            {formatMoeda(total.investimento, moeda)}
          </TableCell>
          <TableCell className="text-right tabular-nums">{formatQtd(total.impressoes)}</TableCell>
          <TableCell className="text-right tabular-nums">{formatQtd(total.cliques_link)}</TableCell>
          <TableCell className="text-right tabular-nums">{formatQtd(total.leads)}</TableCell>
          <TableCell className="text-right tabular-nums">{formatMoeda(dt.cpl, moeda)}</TableCell>
          <TableCell className="text-right tabular-nums">{formatQtd(total.mensagens)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
