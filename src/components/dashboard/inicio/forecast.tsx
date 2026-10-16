import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { supabase } from "@/lib/supabase";
import { Bloco } from "@/components/ds/bloco";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  formatMoeda,
  formatMoedaCompacta,
  normalizarForecast,
  rotuloMes,
  type ForecastMes,
} from "@/lib/propostas";
import { formatNumero } from "@/lib/format";

/** Dois meses para trás (o realizado recente) e três à frente (o previsto). */
const MESES_ANTES = 2;
const MESES_TOTAL = 6;

const config = {
  realizado: { label: "Realizado", color: "var(--chart-1)" },
  ponderado: { label: "Previsto (ponderado)", color: "var(--chart-2)" },
} satisfies ChartConfig;

function inicioDaJanela(): string {
  const d = new Date();
  const inicio = new Date(d.getFullYear(), d.getMonth() - MESES_ANTES, 1);
  return `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, "0")}-01`;
}

function mesAtualIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function useForecast(enabled: boolean) {
  return useQuery({
    queryKey: ["dash", "forecast", MESES_TOTAL],
    queryFn: async () => {
      // Tipos gerados ainda não conhecem a função (a migration é aplicada à mão).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("forecast_mensal", {
        p_inicio: inicioDaJanela(),
        p_meses: MESES_TOTAL,
      });
      if (error) throw error;
      return normalizarForecast(data ?? []);
    },
    enabled,
  });
}

/** Dica do gráfico: mês, os dois valores e quantas propostas/compras os compõem. */
function Dica({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ForecastMes & { rotulo: string } }[];
}) {
  const linha = payload?.[0]?.payload;
  if (!active || !linha) return null;
  return (
    <div className="grid min-w-[12rem] gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-foreground">{linha.rotulo}</p>
      <p className="flex items-center justify-between gap-4 text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-[2px] bg-chart-1" />
          Realizado
        </span>
        <span className="font-mono tabular-nums text-foreground">
          {formatMoeda(linha.realizado)}
        </span>
      </p>
      <p className="flex items-center justify-between gap-4 text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-[2px] bg-chart-2" />
          Previsto
        </span>
        <span className="font-mono tabular-nums text-foreground">
          {formatMoeda(linha.ponderado)}
        </span>
      </p>
      <p className="border-t border-border/60 pt-1.5 text-muted-foreground">
        {formatNumero(linha.compras)} {linha.compras === 1 ? "compra" : "compras"} ·{" "}
        {formatNumero(linha.propostas_abertas)}{" "}
        {linha.propostas_abertas === 1 ? "proposta aberta" : "propostas abertas"} (
        {formatMoeda(linha.em_aberto)} sem peso)
      </p>
    </div>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: number; nota: string }) {
  return (
    <div>
      <p className="text-[0.8125rem] font-medium text-muted-foreground">{rotulo}</p>
      <p className="num mt-1.5 text-[1.75rem] leading-none text-foreground">{formatMoeda(valor)}</p>
      <p className="mt-1 text-[0.75rem] text-muted-foreground">{nota}</p>
    </div>
  );
}

/**
 * Forecast de vendas (admin/gestor). Previsto = soma de valor × probabilidade
 * da etapa do lead, para a versão mais recente de cada proposta em aberto, no
 * mês em que ela vence. Realizado = compras registradas no mês. Os pesos por
 * etapa ficam na tabela funil_probabilidades.
 */
export function Forecast({ enabled }: { enabled: boolean }) {
  const query = useForecast(enabled);
  const mesAtual = mesAtualIso();

  return (
    <Bloco
      divisor
      titulo="Forecast de vendas"
      descricao="Propostas em aberto ponderadas pela etapa do funil, contra o que já virou compra"
    >
      <QueryState
        query={query}
        skeleton={<SkeletonRows rows={2} className="h-24" />}
        isEmpty={(d) => d.every((m) => m.ponderado === 0 && m.realizado === 0)}
        empty={
          <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Nenhuma proposta em aberto nem compra no período. Crie propostas na ficha do lead.
          </p>
        }
      >
        {(d) => {
          const dados = d.map((m) => ({ ...m, rotulo: rotuloMes(m.mes) }));
          const atual = d.find((m) => m.mes.slice(0, 10) === mesAtual);
          const futuros = d.filter((m) => m.mes.slice(0, 10) >= mesAtual);
          const previsto = futuros.reduce((s, m) => s + m.ponderado, 0);
          const emAberto = futuros.reduce((s, m) => s + m.em_aberto, 0);
          return (
            <>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <Numero
                  rotulo="Realizado no mês"
                  valor={atual?.realizado ?? 0}
                  nota={`${formatNumero(atual?.compras ?? 0)} ${atual?.compras === 1 ? "compra" : "compras"}`}
                />
                <Numero rotulo="Previsto (ponderado)" valor={previsto} nota="Deste mês em diante" />
                <Numero
                  rotulo="Em aberto (sem peso)"
                  valor={emAberto}
                  nota="Valor cheio das propostas abertas"
                />
              </div>

              <ChartContainer config={config} className="mt-6 aspect-auto h-64 w-full">
                <BarChart data={dados} barGap={2} margin={{ left: 4, right: 4 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 5" />
                  <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tickFormatter={(v: number) => formatMoedaCompacta(v)}
                  />
                  <ChartTooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                    content={<Dica />}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar
                    dataKey="realizado"
                    fill="var(--color-realizado)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="ponderado"
                    fill="var(--color-ponderado)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ChartContainer>

              {/* Mesmos números em tabela, para leitor de tela. */}
              <table className="sr-only">
                <caption>Forecast de vendas por mês</caption>
                <thead>
                  <tr>
                    <th scope="col">Mês</th>
                    <th scope="col">Realizado</th>
                    <th scope="col">Previsto ponderado</th>
                    <th scope="col">Em aberto</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.map((m) => (
                    <tr key={m.mes}>
                      <th scope="row">{m.rotulo}</th>
                      <td>{formatMoeda(m.realizado)}</td>
                      <td>{formatMoeda(m.ponderado)}</td>
                      <td>{formatMoeda(m.em_aberto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          );
        }}
      </QueryState>
    </Bloco>
  );
}
