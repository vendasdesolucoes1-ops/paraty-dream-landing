// Do anúncio à venda: por campanha, quanto foi investido, quantos contatos a
// Meta contou e até onde esses leads chegaram no CRM (qualificados, visitas
// agendadas, visitas feitas, propostas, vendas), com o custo de cada etapa.
// O lead fica ligado à campanha quando chega por anúncio de clique para o
// WhatsApp (origem "Anúncio WhatsApp") ou pelo formulário da Meta.
import { Bloco } from "@/components/ds/bloco";
import { Pill } from "@/components/ds/pill";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import { FaixaIndicadores, Indicador } from "@/components/marketing/meta/pecas";
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
  formatMoeda,
  formatQtd,
  formatTaxa,
  razao,
  statusAnuncio,
  totaisFunil,
  type LinhaFunil,
} from "@/lib/marketing-calculos";
import { useFunilCampanhas } from "@/lib/marketing-meta";
import type { Periodo } from "@/lib/relatorios";

const AVISO_RASTREIO =
  "Os leads passam a ser ligados à campanha a partir de agora (primeira mensagem vinda do anúncio). Contatos anteriores não têm essa marca.";

/** Indicadores principais: custo por visita agendada, por visita e por venda. */
export function FunilResumo({ periodo, moeda }: { periodo: Periodo; moeda?: string | null }) {
  const q = useFunilCampanhas(periodo);
  const t = q.data ? totaisFunil(q.data) : null;
  const dinheiro = (n: number) => formatMoeda(n, moeda);
  return (
    <Bloco
      titulo="Do anúncio à venda"
      descricao="Quanto custou cada visita e cada venda vinda dos anúncios, pelas etapas do CRM"
    >
      <FaixaIndicadores colunas={4}>
        <Indicador
          rotulo="Leads ligados a anúncios"
          carregando={q.isPending}
          valor={t?.leads_crm}
          formatar={formatQtd}
          rodape={
            t && t.contatos_meta > 0
              ? `${formatTaxa(t.rastreados, 0)} dos ${formatQtd(t.contatos_meta)} contatos da Meta`
              : undefined
          }
        />
        <Indicador
          rotulo="Custo por visita agendada"
          destaque
          carregando={q.isPending}
          valor={t?.custoPorAgendada}
          formatar={dinheiro}
          rodape={t ? `${formatQtd(t.agendados)} agendadas` : undefined}
        />
        <Indicador
          rotulo="Custo por visita feita"
          carregando={q.isPending}
          valor={t?.custoPorVisita}
          formatar={dinheiro}
          rodape={t ? `${formatQtd(t.visitas)} visitas` : undefined}
        />
        <Indicador
          rotulo="Custo por venda"
          carregando={q.isPending}
          valor={t?.custoPorVenda}
          formatar={dinheiro}
          rodape={t ? `${formatQtd(t.vendas)} vendas` : undefined}
        />
      </FaixaIndicadores>
      <p className="mt-3 text-[0.75rem] text-muted-foreground">{AVISO_RASTREIO}</p>
    </Bloco>
  );
}

/** Tabela por campanha: investimento → contatos → etapas do CRM, com custos. */
export function FunilTabela({ periodo, moeda }: { periodo: Periodo; moeda?: string | null }) {
  const q = useFunilCampanhas(periodo);
  return (
    <Bloco
      divisor
      titulo="Funil por campanha"
      descricao="Contatos contados pela Meta e até onde os leads de cada campanha chegaram no CRM"
    >
      <QueryState
        query={q}
        skeleton={<SkeletonRows rows={4} />}
        isEmpty={(d) => d.length === 0}
        empty={
          <p className="text-[0.8125rem] text-muted-foreground">
            Nenhuma campanha com investimento ou leads no período.
          </p>
        }
      >
        {(linhas) => <Tabela linhas={linhas} moeda={moeda} />}
      </QueryState>
      <p className="mt-3 text-[0.75rem] text-muted-foreground">{AVISO_RASTREIO}</p>
    </Bloco>
  );
}

function Tabela({ linhas, moeda }: { linhas: LinhaFunil[]; moeda?: string | null }) {
  const t = totaisFunil(linhas);
  const sub = "block text-[0.72rem] font-normal text-muted-foreground";
  const custo = (inv: number, n: number) => formatMoeda(razao(inv, n), moeda);
  return (
    <Table className="animate-swap">
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-[14rem]">Campanha</TableHead>
          <TableHead className="text-right">Investimento</TableHead>
          <TableHead className="text-right">Contatos (Meta)</TableHead>
          <TableHead className="text-right">Leads no CRM</TableHead>
          <TableHead className="text-right">Qualificados</TableHead>
          <TableHead className="text-right">Visitas agendadas</TableHead>
          <TableHead className="text-right">Visitas feitas</TableHead>
          <TableHead className="text-right">Propostas</TableHead>
          <TableHead className="text-right">Vendas</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {linhas.map((l) => {
          const st = statusAnuncio(l.effective_status);
          return (
            <TableRow key={l.campanha_id}>
              <TableCell>
                <p className="max-w-[22rem] truncate font-medium text-foreground">
                  {l.campanha_nome ?? l.campanha_id}
                </p>
                <Pill tone={st.tone} dot className="mt-0.5">
                  {st.label}
                </Pill>
              </TableCell>
              <TableCell className="text-right tabular-nums text-foreground">
                {formatMoeda(l.investimento, moeda)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="block">{formatQtd(l.contatos_meta)}</span>
                <span className={sub}>
                  {l.tipo_resultado === "lead"
                    ? "leads"
                    : l.tipo_resultado === "conversa"
                      ? "conversas"
                      : "—"}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatQtd(l.leads_crm)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatQtd(l.qualificados)}</TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="block text-foreground">{formatQtd(l.agendados)}</span>
                <span className={sub}>{custo(l.investimento, l.agendados)} cada</span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="block">{formatQtd(l.visitas)}</span>
                <span className={sub}>{custo(l.investimento, l.visitas)} cada</span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatQtd(l.propostas)}</TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="block text-foreground">{formatQtd(l.vendas)}</span>
                <span className={sub}>{custo(l.investimento, l.vendas)} cada</span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      <TableFooter>
        <TableRow className="font-medium">
          <TableCell>Total</TableCell>
          <TableCell className="text-right tabular-nums">
            {formatMoeda(t.investimento, moeda)}
          </TableCell>
          <TableCell className="text-right tabular-nums">{formatQtd(t.contatos_meta)}</TableCell>
          <TableCell className="text-right tabular-nums">{formatQtd(t.leads_crm)}</TableCell>
          <TableCell className="text-right tabular-nums">{formatQtd(t.qualificados)}</TableCell>
          <TableCell className="text-right tabular-nums">
            <span className="block">{formatQtd(t.agendados)}</span>
            <span className={sub}>{formatMoeda(t.custoPorAgendada, moeda)} cada</span>
          </TableCell>
          <TableCell className="text-right tabular-nums">
            <span className="block">{formatQtd(t.visitas)}</span>
            <span className={sub}>{formatMoeda(t.custoPorVisita, moeda)} cada</span>
          </TableCell>
          <TableCell className="text-right tabular-nums">{formatQtd(t.propostas)}</TableCell>
          <TableCell className="text-right tabular-nums">
            <span className="block">{formatQtd(t.vendas)}</span>
            <span className={sub}>{formatMoeda(t.custoPorVenda, moeda)} cada</span>
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
