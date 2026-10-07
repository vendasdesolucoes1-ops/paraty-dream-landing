import { Link } from "@tanstack/react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { AreaChart } from "@/components/ds/area-chart";
import type { ResumoLeads } from "@/lib/dashboard-queries";
import { useContagem } from "@/hooks/use-contagem";
import { formatDiaCurto, formatNumero } from "@/lib/format";
import { cn } from "@/lib/utils";

type Rota = "/dashboard/crm" | "/dashboard/agenda" | "/dashboard/lotes";

function Indicador({
  rotulo,
  valor,
  rodape,
  to,
  carregando,
  destaque,
}: {
  rotulo: string;
  valor: number | null | undefined;
  rodape?: ReactNode;
  to: Rota;
  carregando: boolean;
  destaque?: boolean;
}) {
  const exibido = useContagem(valor);
  return (
    <Link
      to={to}
      className="group/ind relative flex min-w-0 flex-col px-5 py-6 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6 lg:first:pl-0"
    >
      <span className="flex items-center justify-between gap-2 text-[0.8125rem] font-medium text-muted-foreground">
        <span className="flex items-center gap-2">
          {destaque ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" /> : null}
          {rotulo}
        </span>
        <ArrowUpRight
          aria-hidden
          className="h-3.5 w-3.5 -translate-x-1 translate-y-1 opacity-0 transition-all duration-200 ease-[var(--ease-out)] group-hover/ind:translate-x-0 group-hover/ind:translate-y-0 group-hover/ind:opacity-100"
        />
      </span>
      {carregando ? (
        <div className="mt-3 space-y-2.5" aria-hidden>
          <div className="h-9 w-16 animate-pulse rounded-md bg-muted" />
          <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <>
          <span
            className="num mt-2.5 text-[2.5rem] leading-none text-foreground transition-transform duration-200 ease-[var(--ease-out)] group-hover/ind:-translate-y-0.5"
            aria-label={valor == null ? undefined : formatNumero(valor)}
          >
            {exibido === null ? (valor == null ? "—" : "0") : formatNumero(exibido)}
          </span>
          <span className="mt-2.5 truncate text-[0.8125rem] text-muted-foreground">{rodape}</span>
        </>
      )}
    </Link>
  );
}

/**
 * Faixa de números do dia. Direto sobre a folha, separada por fios: não são
 * quatro cartões, é uma linha de leitura (como o placar de um painel de
 * controle). A quinta célula mostra a tendência dos últimos 14 dias.
 */
export function Indicadores({
  resumo,
  chegadas,
  visitasHoje,
  carregandoAgenda,
  lotes,
  carregandoLotes,
}: {
  resumo: UseQueryResult<ResumoLeads>;
  chegadas: UseQueryResult<{ dia: Date; total: number }[]>;
  visitasHoje: number | undefined;
  carregandoAgenda: boolean;
  lotes: number | undefined;
  carregandoLotes: boolean;
}) {
  const r = resumo.data;
  const dif = r ? r.novosHoje - r.novosOntem : 0;
  return (
    <div className="grid grid-cols-2 divide-border border-y border-border lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.5fr)] lg:divide-x [&>*:nth-child(2n)]:border-l [&>*:nth-child(n+3)]:border-t lg:[&>*]:border-t-0">
      <Indicador
        rotulo="Novos hoje"
        to="/dashboard/crm"
        carregando={resumo.isPending}
        valor={r?.novosHoje}
        destaque={(r?.novosHoje ?? 0) > 0}
        rodape={
          r ? (
            <span className={cn(dif > 0 && "font-medium text-success")}>
              {dif === 0 ? "igual a ontem" : `${dif > 0 ? "+" : "−"}${Math.abs(dif)} vs. ontem`}
            </span>
          ) : null
        }
      />
      <Indicador
        rotulo="Em andamento"
        to="/dashboard/crm"
        carregando={resumo.isPending}
        valor={r?.emAndamento}
        rodape={r ? `de ${formatNumero(r.total)} no total` : null}
      />
      <Indicador
        rotulo="Visitas hoje"
        to="/dashboard/agenda"
        carregando={carregandoAgenda}
        valor={visitasHoje}
        destaque={(visitasHoje ?? 0) > 0}
        rodape="na agenda de hoje"
      />
      <Indicador
        rotulo="Lotes disponíveis"
        to="/dashboard/lotes"
        carregando={carregandoLotes}
        valor={lotes}
        rodape="prontos para vender"
      />
      <div className="col-span-2 flex min-w-0 flex-col justify-between border-t px-5 py-6 sm:px-6 lg:col-span-1 lg:border-t-0">
        <span className="flex items-center justify-between text-[0.8125rem] font-medium text-muted-foreground">
          Entrada · 14 dias
          {chegadas.data ? (
            <span className="tabular-nums text-foreground">
              {formatNumero(chegadas.data.reduce((s, d) => s + d.total, 0))}
            </span>
          ) : null}
        </span>
        {chegadas.data ? (
          <AreaChart
            className="mt-3"
            altura={56}
            interativo={false}
            rotuloGrafico="Leads por dia nos últimos 14 dias"
            dados={chegadas.data.map((d) => ({
              rotulo: formatDiaCurto(d.dia),
              valor: d.total,
            }))}
          />
        ) : (
          <div className="mt-3 h-14 animate-pulse rounded-md bg-muted" aria-hidden />
        )}
      </div>
    </div>
  );
}
