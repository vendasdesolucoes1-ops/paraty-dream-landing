// Visão geral do Marketing: o resultado do período em uma tela — anúncios
// (investimento, leads, custo por lead), evolução diária, Instagram e os
// destaques —, com a saúde da sincronização no topo.
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { Bloco, LINK_BLOCO } from "@/components/ds/bloco";
import { PanelEmpty, QueryState, SkeletonRows } from "@/components/ds/query-state";
import { atraso } from "@/components/ds/reveal";
import {
  FaixaIndicadores,
  FaixaStatus,
  GraficoSerie,
  Indicador,
  Miniatura,
  SemDadosMeta,
} from "@/components/marketing/meta/pecas";
import type { AbaMarketing } from "@/components/marketing/meta/abas";
import { SaldoAoVivo } from "@/components/marketing/meta/saldo";
import { FunilResumo } from "@/components/marketing/meta/funil";
import { LineChart } from "@/components/ds/line-chart";
import {
  custosPorObjetivo,
  diaCurto,
  serieCampanhas,
  type SerieCampanhas,
  type TipoResultado,
  formatMoeda,
  formatQtd,
  formatTaxa,
  melhoresAnuncios,
  melhoresPosts,
  metricaIg,
  saudeIntegracao,
  TIPO_MIDIA_LABEL,
  variacao,
  type TipoMidia,
} from "@/lib/marketing-calculos";
import {
  useAnuncios,
  useMidiasIg,
  useResumoAds,
  useResumoIg,
  useSerieAds,
  useSerieCampanhas,
  useStatusIntegracao,
} from "@/lib/marketing-meta";
import type { Periodo } from "@/lib/relatorios";
import { cn } from "@/lib/utils";

export function VisaoGeral({
  periodo,
  irPara,
}: {
  periodo: Periodo;
  irPara: (aba: AbaMarketing) => void;
}) {
  const status = useStatusIntegracao();
  const moeda = useResumoAds(periodo).data?.atual?.moeda;

  if (status.data && status.data.length === 0) return <SemDadosMeta />;

  const saude = status.data ? saudeIntegracao(status.data) : null;

  return (
    <div className="space-y-10">
      {saude && saude.nivel !== "ok" ? (
        <FaixaStatus
          saude={saude}
          acao={
            <button type="button" className={LINK_BLOCO} onClick={() => irPara("integracao")}>
              Ver integração <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          }
        />
      ) : null}
      <SaldoAoVivo />
      <ResumoAnuncios periodo={periodo} irPara={irPara} />
      <FunilResumo periodo={periodo} moeda={moeda} />
      <EvolucaoDiaria periodo={periodo} />
      <ResumoInstagram periodo={periodo} irPara={irPara} />
      <Destaques periodo={periodo} />
      {saude?.nivel === "ok" ? (
        <p className="text-[0.75rem] text-muted-foreground">{saude.detalhe}</p>
      ) : null}
    </div>
  );
}

function ResumoAnuncios({
  periodo,
  irPara,
}: {
  periodo: Periodo;
  irPara: (aba: AbaMarketing) => void;
}) {
  const q = useResumoAds(periodo);
  const atual = q.data?.atual;
  const anterior = q.data?.anterior;
  const moeda = atual?.moeda;
  const ca = atual ? custosPorObjetivo(atual) : null;
  const cb = anterior ? custosPorObjetivo(anterior) : null;
  const carregando = q.isPending;
  const dinheiro = (n: number) => formatMoeda(n, moeda);

  return (
    <Bloco
      titulo="Anúncios"
      descricao="Custo de cada resultado pelo objetivo da campanha, sem contar a mesma pessoa duas vezes"
      acao={
        <button type="button" className={LINK_BLOCO} onClick={() => irPara("anuncios")}>
          Ver anúncios <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      }
    >
      {q.isError ? (
        <QueryState query={q} skeleton={null}>
          {() => null}
        </QueryState>
      ) : (
        <FaixaIndicadores colunas={5}>
          <Indicador
            rotulo="Investimento"
            carregando={carregando}
            valor={atual?.investimento}
            formatar={dinheiro}
            variacao={atual ? variacao(atual.investimento, anterior?.investimento) : undefined}
            sentido="neutro"
          />
          <Indicador
            rotulo="Contatos únicos"
            destaque={(atual?.contatos ?? 0) > 0}
            carregando={carregando}
            valor={atual?.contatos}
            formatar={formatQtd}
            variacao={atual ? variacao(atual.contatos, anterior?.contatos) : undefined}
            sentido="maior_melhor"
            rodape={
              atual
                ? `${formatQtd(atual.leads_formulario)} leads + ${formatQtd(atual.conversas)} conversas`
                : undefined
            }
          />
          <Indicador
            rotulo="Custo por contato"
            carregando={carregando}
            valor={ca?.custoPorContato}
            formatar={dinheiro}
            variacao={
              ca?.custoPorContato != null
                ? variacao(ca.custoPorContato, cb?.custoPorContato)
                : undefined
            }
            sentido="menor_melhor"
          />
          <Indicador
            rotulo="Custo por lead"
            carregando={carregando}
            valor={ca?.custoPorLead}
            formatar={dinheiro}
            variacao={
              ca?.custoPorLead != null ? variacao(ca.custoPorLead, cb?.custoPorLead) : undefined
            }
            sentido="menor_melhor"
            rodape={
              atual && atual.leads_formulario > 0
                ? `${formatQtd(atual.leads_formulario)} leads · ${formatTaxa(
                    ca?.pctLeadsQueChamaram ?? null,
                    0,
                  )} chamaram no WhatsApp`
                : "Campanhas de formulário"
            }
          />
          <Indicador
            rotulo="Custo por conversa"
            carregando={carregando}
            valor={ca?.custoPorConversa}
            formatar={dinheiro}
            variacao={
              ca?.custoPorConversa != null
                ? variacao(ca.custoPorConversa, cb?.custoPorConversa)
                : undefined
            }
            sentido="menor_melhor"
            rodape={atual ? `${formatQtd(atual.conversas)} conversas no WhatsApp` : undefined}
          />
        </FaixaIndicadores>
      )}
    </Bloco>
  );
}

function EvolucaoDiaria({ periodo }: { periodo: Periodo }) {
  const q = useSerieAds(periodo);
  const porCampanha = useSerieCampanhas(periodo);
  const moeda = useResumoAds(periodo).data?.atual?.moeda;
  return (
    <Bloco
      divisor
      titulo="Evolução diária"
      descricao="Investimento por dia e, por campanha ativa, os resultados (leads ou conversas) e quanto custou cada um"
    >
      <div className="grid gap-8 lg:grid-cols-2">
        <QueryState query={q} skeleton={<SkeletonRows rows={1} className="h-40" />}>
          {(serie) => (
            <GraficoSerie
              titulo="Investimento por dia"
              total={formatMoeda(
                serie.reduce((s, p) => s + p.investimento, 0),
                moeda,
              )}
              pontos={serie.map((p) => ({ data: p.data, valor: p.investimento }))}
            />
          )}
        </QueryState>
        <QueryState query={porCampanha} skeleton={<SkeletonRows rows={1} className="h-40" />}>
          {(pontos) => (
            <GraficoCampanhas
              titulo="Leads e conversas por dia"
              serie={serieCampanhas(pontos, "resultado")}
              formatar={formatQtd}
            />
          )}
        </QueryState>
        <QueryState query={porCampanha} skeleton={<SkeletonRows rows={1} className="h-40" />}>
          {(pontos) => (
            <GraficoCampanhas
              titulo="Custo por resultado por dia"
              serie={serieCampanhas(pontos, "custo")}
              formatar={(n) => formatMoeda(n, moeda)}
              className="lg:col-span-2"
            />
          )}
        </QueryState>
      </div>
    </Bloco>
  );
}

function GraficoCampanhas({
  titulo,
  serie,
  formatar,
  className,
}: {
  titulo: string;
  serie: SerieCampanhas;
  formatar: (n: number) => string;
  className?: string;
}) {
  const sufixo = (tipo: TipoResultado) =>
    tipo === "lead" ? " (leads)" : tipo === "conversa" ? " (conversas)" : "";
  return (
    <div className={cn("min-w-0", className)}>
      <p className="mb-3 text-[0.8125rem] font-medium text-muted-foreground">{titulo}</p>
      {serie.campanhas.length === 0 || serie.dias.length < 2 ? (
        <p className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-[0.8125rem] text-muted-foreground">
          {serie.campanhas.length === 0
            ? "Nenhuma campanha ativa ou com investimento no período."
            : "Escolha um período de pelo menos dois dias."}
        </p>
      ) : (
        <LineChart
          rotuloGrafico={titulo}
          series={serie.campanhas.map((c) => ({ id: c.id, nome: `${c.nome}${sufixo(c.tipo)}` }))}
          pontos={serie.dias.map((d) => ({ rotulo: diaCurto(d.data), valores: d.valores }))}
          formatar={formatar}
        />
      )}
    </div>
  );
}

function ResumoInstagram({
  periodo,
  irPara,
}: {
  periodo: Periodo;
  irPara: (aba: AbaMarketing) => void;
}) {
  const q = useResumoIg(periodo);
  const r = q.data ?? [];
  const seguidores = metricaIg(r, "seguidores");
  const alcance = metricaIg(r, "reach");
  const views = metricaIg(r, "views");
  const interacoes = metricaIg(r, "total_interactions");
  const ganho =
    seguidores?.valor != null && seguidores.valor_anterior != null
      ? seguidores.valor - seguidores.valor_anterior
      : null;
  const carregando = q.isPending;

  return (
    <Bloco
      divisor
      titulo="Instagram"
      descricao="Resultado orgânico do perfil no período"
      acao={
        <button type="button" className={LINK_BLOCO} onClick={() => irPara("instagram")}>
          Ver Instagram <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      }
    >
      {q.isError ? (
        <QueryState query={q} skeleton={null}>
          {() => null}
        </QueryState>
      ) : (
        <FaixaIndicadores colunas={4}>
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
            valor={alcance?.valor}
            formatar={formatQtd}
            variacao={alcance ? variacao(alcance.valor, alcance.valor_anterior) : undefined}
            sentido="maior_melhor"
            rodape="soma diária, aproximado"
          />
          <Indicador
            rotulo="Visualizações"
            carregando={carregando}
            valor={views?.valor}
            formatar={formatQtd}
            variacao={views ? variacao(views.valor, views.valor_anterior) : undefined}
            sentido="maior_melhor"
          />
          <Indicador
            rotulo="Interações"
            carregando={carregando}
            valor={interacoes?.valor}
            formatar={formatQtd}
            variacao={
              interacoes ? variacao(interacoes.valor, interacoes.valor_anterior) : undefined
            }
            sentido="maior_melhor"
          />
        </FaixaIndicadores>
      )}
    </Bloco>
  );
}

function Destaques({ periodo }: { periodo: Periodo }) {
  const anuncios = useAnuncios(periodo, "anuncio");
  const midias = useMidiasIg(periodo, null);
  const moeda = useResumoAds(periodo).data?.atual?.moeda;

  return (
    <Bloco divisor titulo="Destaques do período">
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="min-w-0">
          <h3 className="mb-3 text-[0.8125rem] font-medium text-muted-foreground">
            Anúncios com menor custo por resultado
          </h3>
          <QueryState
            query={anuncios}
            skeleton={<SkeletonRows rows={4} className="h-12" />}
            isEmpty={(d) => melhoresAnuncios(d).length === 0}
            empty={<PanelEmpty>Nenhum anúncio gerou lead ou conversa neste período.</PanelEmpty>}
          >
            {(d) => (
              <ol className="divide-y divide-border">
                {melhoresAnuncios(d).map((a, i) => (
                  <li
                    key={a.id}
                    className="flex animate-swap items-center gap-3 py-2.5"
                    style={atraso(i)}
                  >
                    <Miniatura src={a.thumbnail_url} className="h-10 w-10" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.875rem] font-medium text-foreground">
                        {a.nome ?? a.id}
                      </p>
                      <p className="truncate text-[0.75rem] text-muted-foreground">
                        {a.campanha_nome ?? "—"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[0.875rem] font-medium tabular-nums text-foreground">
                        {formatMoeda(a.resultado.custo, moeda)}
                      </p>
                      <p className="text-[0.75rem] tabular-nums text-muted-foreground">
                        {formatQtd(a.resultado.quantidade)} {a.resultado.rotulo}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </QueryState>
        </div>

        <div className="min-w-0">
          <h3 className="mb-3 text-[0.8125rem] font-medium text-muted-foreground">
            Posts com mais interações
          </h3>
          <QueryState
            query={midias}
            skeleton={<SkeletonRows rows={4} className="h-12" />}
            isEmpty={(d) => melhoresPosts(d).length === 0}
            empty={<PanelEmpty>Nenhum post com interações registradas neste período.</PanelEmpty>}
          >
            {(d) => (
              <ol className="divide-y divide-border">
                {melhoresPosts(d).map((m, i) => (
                  <li
                    key={m.id}
                    className="flex animate-swap items-center gap-3 py-2.5"
                    style={atraso(i)}
                  >
                    <Miniatura src={m.imagem_url} className="h-10 w-10" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.875rem] text-foreground">
                        {m.caption?.split("\n")[0] || "Sem legenda"}
                      </p>
                      <p className="text-[0.75rem] text-muted-foreground">
                        {TIPO_MIDIA_LABEL[m.media_product_type as TipoMidia] ?? "Post"}
                        {m.publicado_em
                          ? ` · ${new Date(m.publicado_em).toLocaleDateString("pt-BR")}`
                          : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[0.875rem] font-medium tabular-nums text-foreground">
                        {formatQtd(m.interacoes)}
                      </p>
                      <p className="text-[0.75rem] tabular-nums text-muted-foreground">
                        alcance {formatQtd(m.alcance)}
                      </p>
                    </div>
                    {m.permalink ? (
                      <a
                        href={m.permalink}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Abrir no Instagram"
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </QueryState>
        </div>
      </div>
    </Bloco>
  );
}
