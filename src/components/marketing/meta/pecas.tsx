// Peças compartilhadas das telas de Marketing com dados da Meta: indicador com
// variação, barras de proporção, gráfico de série, faixa de status e o vazio de
// "ainda não sincronizou". Tudo com tokens do design system (ds/README.md).
import { useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, ImageIcon, XCircle } from "lucide-react";
import { AreaChart } from "@/components/ds/area-chart";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useContagem } from "@/hooks/use-contagem";
import { useMontado } from "@/hooks/use-montado";
import {
  diaCurto,
  formatVariacao,
  tomDaVariacao,
  type Saude,
  type Sentido,
  type Variacao,
} from "@/lib/marketing-calculos";
import { cn } from "@/lib/utils";

const COR_TOM = {
  success: "font-medium text-success",
  danger: "font-medium text-danger",
  neutral: "text-muted-foreground",
} as const;

/**
 * Um número da faixa de indicadores: rótulo, valor (que sobe ao chegar) e o
 * rodapé com a variação contra o período anterior, colorida pelo sentido da
 * métrica (custo subir é ruim, lead subir é bom).
 */
export function Indicador({
  rotulo,
  valor,
  formatar,
  variacao,
  sentido = "neutro",
  rodape,
  carregando,
  destaque,
}: {
  rotulo: string;
  valor: number | null | undefined;
  formatar: (n: number) => string;
  variacao?: Variacao;
  sentido?: Sentido;
  rodape?: ReactNode;
  carregando?: boolean;
  destaque?: boolean;
}) {
  const exibido = useContagem(valor ?? null);
  const tom = variacao ? tomDaVariacao(variacao, sentido) : "neutral";
  return (
    <div className="flex min-w-0 flex-col px-5 py-5 sm:px-6">
      <span className="flex items-center gap-2 text-[0.8125rem] font-medium text-muted-foreground">
        {destaque ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" /> : null}
        {rotulo}
      </span>
      {carregando ? (
        <div className="mt-3 space-y-2.5" aria-hidden>
          <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
          <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <>
          <span
            className="num mt-2 truncate text-[1.875rem] leading-none text-foreground"
            aria-label={valor == null ? "sem dado" : formatar(valor)}
          >
            {valor == null ? "—" : formatar(exibido ?? valor)}
          </span>
          <span className="mt-2 truncate text-[0.75rem]">
            {variacao ? <span className={COR_TOM[tom]}>{formatVariacao(variacao)}</span> : null}
            {variacao && rodape ? <span className="text-muted-foreground"> · </span> : null}
            {rodape ? <span className="text-muted-foreground">{rodape}</span> : null}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * Faixa de indicadores sobre a folha, separada por fios — o mesmo arranjo da
 * Início: 2 colunas no celular, uma linha só no desktop (use até 5 itens).
 */
export function FaixaIndicadores({
  children,
  colunas = 4,
}: {
  children: ReactNode;
  colunas?: 3 | 4 | 5;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 divide-border border-y border-border lg:divide-x [&>*:nth-child(2n)]:border-l [&>*:nth-child(n+3)]:border-t lg:[&>*]:border-t-0",
        colunas === 3 && "lg:grid-cols-3",
        colunas === 4 && "lg:grid-cols-4",
        colunas === 5 && "lg:grid-cols-5",
      )}
    >
      {children}
    </div>
  );
}

export interface ItemBarra {
  chave: string;
  rotulo: string;
  valor: number;
  /** Texto à direita (valor formatado e, se quiser, um complemento). */
  detalhe?: ReactNode;
}

/** Lista de barras de proporção (maior = 100%), que crescem ao montar. */
export function Barras({ itens, rotulo }: { itens: ItemBarra[]; rotulo: string }) {
  const montado = useMontado(120);
  const maximo = Math.max(...itens.map((i) => i.valor), 0);
  return (
    <ul className="space-y-2.5" aria-label={rotulo}>
      {itens.map((i) => {
        const pct = maximo > 0 ? (i.valor / maximo) * 100 : 0;
        return (
          <li key={i.chave} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
              <span className="truncate text-foreground">{i.rotulo}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{i.detalhe}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-chart-track">
              <div
                className="h-full rounded-full bg-chart-1 transition-[width] duration-700 ease-[var(--ease-out)]"
                style={{ width: montado ? `${pct}%` : "0%" }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Gráfico diário de uma métrica: título, total do período e a curva. Valores
 * monetários chegam já arredondados para a dica mostrar centavos, não dízimas.
 */
export function GraficoSerie({
  titulo,
  total,
  pontos,
  altura = 140,
}: {
  titulo: string;
  total?: ReactNode;
  pontos: { data: string; valor: number }[];
  altura?: number;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-[0.8125rem] font-medium text-muted-foreground">{titulo}</span>
        {total ? (
          <span className="text-[0.8125rem] tabular-nums text-foreground">{total}</span>
        ) : null}
      </div>
      {pontos.length > 1 ? (
        <AreaChart
          altura={altura}
          rotuloGrafico={titulo}
          dados={pontos.map((p) => ({
            rotulo: diaCurto(p.data),
            valor: Math.round(p.valor * 100) / 100,
          }))}
        />
      ) : (
        <p
          className="flex items-center justify-center rounded-lg border border-dashed border-border text-[0.8125rem] text-muted-foreground"
          style={{ height: altura }}
        >
          Escolha um período de pelo menos dois dias.
        </p>
      )}
    </div>
  );
}

const ICONE_SAUDE = {
  ok: CheckCircle2,
  atencao: AlertTriangle,
  erro: XCircle,
  sem_dados: CloudOff,
} as const;

const COR_SAUDE = {
  ok: "border-border text-muted-foreground [&_svg]:text-success",
  atencao: "border-warning/40 bg-warning-soft text-foreground [&_svg]:text-warning",
  erro: "border-danger/40 bg-danger-soft text-foreground [&_svg]:text-danger",
  sem_dados: "border-dashed border-border text-muted-foreground",
} as const;

/** Faixa de uma linha com a saúde da sincronização; a ação leva à aba Integração. */
export function FaixaStatus({ saude, acao }: { saude: Saude; acao?: ReactNode }) {
  const Icone = ICONE_SAUDE[saude.nivel];
  return (
    <div
      role={saude.nivel === "erro" || saude.nivel === "atencao" ? "alert" : "status"}
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border px-4 py-3 text-[0.8125rem]",
        COR_SAUDE[saude.nivel],
      )}
    >
      <span className="flex min-w-0 items-start gap-2.5">
        <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0">
          <span className="font-medium text-foreground">{saude.titulo}</span>
          <span className="block text-muted-foreground sm:inline sm:before:content-['_·_']">
            {saude.detalhe}
          </span>
        </span>
      </span>
      {acao}
    </div>
  );
}

/** Vazio das telas enquanto a integração nunca rodou. */
export function SemDadosMeta({ acao }: { acao?: ReactNode }) {
  return (
    <EmptyState
      icon={CloudOff}
      title="Ainda não há dados da Meta"
      description="Os anúncios e o Instagram aparecem aqui depois da primeira sincronização (automática, de madrugada) ou da carga inicial."
      action={acao}
    />
  );
}

/**
 * Imagem de anúncio/post. As URLs da Meta são assinadas e expiram: se a imagem
 * não carregar, fica um marcador neutro no lugar (nunca o ícone de quebrado).
 */
export function Miniatura({
  src,
  className,
  alt = "",
}: {
  src: string | null | undefined;
  className?: string;
  alt?: string;
}) {
  const [falhou, setFalhou] = useState(false);
  return (
    <span className={cn("relative block shrink-0 overflow-hidden rounded-lg bg-muted", className)}>
      {src && !falhou ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFalhou(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-muted-foreground/50">
          <ImageIcon className="h-4 w-4" aria-hidden />
        </span>
      )}
    </span>
  );
}
