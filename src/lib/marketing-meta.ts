// Consultas das telas de Marketing aos dados da Meta (Ads + Instagram).
//
// As somas saem prontas das funções SQL marketing_* (migration
// 20261102000000_marketing_leitura.sql), que respeitam o RLS das tabelas Meta:
// só a gestão vê dados. As funções e tabelas novas ainda não estão em
// src/integrations/supabase/types.ts, por isso as chamadas passam por cast
// (mesmo padrão de src/lib/relatorios.ts). Cálculos e rótulos: marketing-calculos.ts.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Periodo } from "@/lib/relatorios";
import type {
  AlcancePeriodo,
  LinhaAnuncio,
  LinhaBreakdown,
  LinhaDemografia,
  MidiaIg,
  NivelAnuncio,
  PontoSerieAds,
  PontoSerieCampanha,
  PontoSerieIg,
  ProgressoCarga,
  ResumoAds,
  ResumoIg,
  SaldoConta,
  StatusJob,
  TipoBreakdown,
  TipoMidia,
} from "@/lib/marketing-calculos";

export const chaveMarketing = ["marketing-meta"] as const;

/** Dados mudam no máximo algumas vezes por dia (stories: de hora em hora). */
const FRESCO_MS = 5 * 60_000;

// O PostgREST devolve numeric/bigint como string; tudo que é número vira número.
function numeros<T>(linha: Record<string, unknown>, campos: readonly string[]): T {
  const saida: Record<string, unknown> = { ...linha };
  for (const c of campos) {
    const v = linha[c];
    saida[c] = v === null || v === undefined ? null : Number(v);
  }
  return saida as T;
}

async function rpc(
  funcao: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(funcao, params);
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

const CAMPOS_RESUMO_ADS = [
  "investimento",
  "impressoes",
  "alcance_soma",
  "cliques",
  "cliques_link",
  "leads",
  "mensagens",
  "compras",
  "valor_compras",
  "reservas",
  "anuncios_com_gasto",
  "investimento_leads",
  "leads_formulario",
  "leads_que_chamaram",
  "investimento_conversas",
  "conversas",
  "contatos",
] as const;

const CAMPOS_ANUNCIO = [
  "orcamento_diario",
  "orcamento_total",
  "investimento",
  "impressoes",
  "alcance_soma",
  "cliques",
  "cliques_link",
  "leads",
  "mensagens",
  "compras",
  "reservas",
] as const;

const CAMPOS_MIDIA = [
  "curtidas",
  "comentarios",
  "alcance",
  "views",
  "salvos",
  "compartilhamentos",
  "interacoes",
  "tempo_medio_ms",
  "respostas",
] as const;

// ── Ads ──────────────────────────────────────────────────────────────────────

export function useResumoAds(periodo: Periodo) {
  return useQuery({
    queryKey: [...chaveMarketing, "ads-resumo", periodo.inicio, periodo.fim],
    queryFn: async () => {
      const linhas = await rpc("marketing_ads_resumo", {
        p_inicio: periodo.inicio,
        p_fim: periodo.fim,
      });
      const lista = linhas.map((l) => numeros<ResumoAds>(l, CAMPOS_RESUMO_ADS));
      return {
        atual: lista.find((l) => l.periodo === "atual") ?? null,
        anterior: lista.find((l) => l.periodo === "anterior") ?? null,
      };
    },
    staleTime: FRESCO_MS,
  });
}

/** Série diária por campanha (gráfico de resultados e custo por resultado). */
export function useSerieCampanhas(periodo: Periodo) {
  return useQuery({
    queryKey: [...chaveMarketing, "ads-serie-campanhas", periodo.inicio, periodo.fim],
    queryFn: async () => {
      const linhas = await rpc("marketing_ads_serie_campanhas", {
        p_inicio: periodo.inicio,
        p_fim: periodo.fim,
      });
      return linhas.map((l) =>
        numeros<PontoSerieCampanha>(l, ["investimento", "leads", "mensagens"]),
      );
    },
    staleTime: FRESCO_MS,
  });
}

/**
 * Alcance e frequência do período, ao vivo na Meta (função meta-alcance): o
 * alcance não se soma entre dias, então não sai do banco. Só a gestão recebe.
 */
export function useAlcance(periodo: Periodo, nivel: NivelAnuncio) {
  return useQuery({
    queryKey: [...chaveMarketing, "alcance", periodo.inicio, periodo.fim, nivel],
    queryFn: async (): Promise<AlcancePeriodo> => {
      const params = new URLSearchParams({ inicio: periodo.inicio, fim: periodo.fim, nivel });
      const { data, error } = await supabase.functions.invoke(`meta-alcance?${params}`, {
        method: "GET",
      });
      if (error) throw error;
      return data as AlcancePeriodo;
    },
    staleTime: FRESCO_MS,
    retry: 1,
  });
}

export function useSerieAds(periodo: Periodo, filtro?: { nivel: NivelAnuncio; id: string }) {
  return useQuery({
    queryKey: [
      ...chaveMarketing,
      "ads-serie",
      periodo.inicio,
      periodo.fim,
      filtro?.nivel ?? "",
      filtro?.id ?? "",
    ],
    queryFn: async () => {
      const linhas = await rpc("marketing_ads_serie", {
        p_inicio: periodo.inicio,
        p_fim: periodo.fim,
        p_nivel: filtro?.nivel ?? null,
        p_id: filtro?.id ?? null,
      });
      return linhas.map((l) =>
        numeros<PontoSerieAds>(l, [
          "investimento",
          "impressoes",
          "cliques_link",
          "leads",
          "mensagens",
        ]),
      );
    },
    staleTime: FRESCO_MS,
  });
}

export function useAnuncios(periodo: Periodo, nivel: NivelAnuncio) {
  return useQuery({
    queryKey: [...chaveMarketing, "anuncios", nivel, periodo.inicio, periodo.fim],
    queryFn: async () => {
      const linhas = await rpc("marketing_anuncios", {
        p_inicio: periodo.inicio,
        p_fim: periodo.fim,
        p_nivel: nivel,
      });
      return linhas.map((l) => numeros<LinhaAnuncio>(l, CAMPOS_ANUNCIO));
    },
    staleTime: FRESCO_MS,
  });
}

export function useBreakdown(
  periodo: Periodo,
  tipo: TipoBreakdown,
  filtro?: { nivel: NivelAnuncio; id: string },
) {
  return useQuery({
    queryKey: [
      ...chaveMarketing,
      "breakdown",
      tipo,
      periodo.inicio,
      periodo.fim,
      filtro?.nivel ?? "",
      filtro?.id ?? "",
    ],
    queryFn: async () => {
      const linhas = await rpc("marketing_breakdown", {
        p_inicio: periodo.inicio,
        p_fim: periodo.fim,
        p_tipo: tipo,
        p_nivel: filtro?.nivel ?? null,
        p_id: filtro?.id ?? null,
      });
      return linhas.map((l) =>
        numeros<LinhaBreakdown>(l, [
          "investimento",
          "impressoes",
          "cliques_link",
          "leads",
          "mensagens",
        ]),
      );
    },
    staleTime: FRESCO_MS,
  });
}

// ── Instagram ────────────────────────────────────────────────────────────────

export function useResumoIg(periodo: Periodo) {
  return useQuery({
    queryKey: [...chaveMarketing, "ig-resumo", periodo.inicio, periodo.fim],
    queryFn: async () => {
      const linhas = await rpc("marketing_ig_resumo", {
        p_inicio: periodo.inicio,
        p_fim: periodo.fim,
      });
      return linhas.map((l) => numeros<ResumoIg>(l, ["valor", "valor_anterior"]));
    },
    staleTime: FRESCO_MS,
  });
}

export function useSerieIg(periodo: Periodo) {
  return useQuery({
    queryKey: [...chaveMarketing, "ig-serie", periodo.inicio, periodo.fim],
    queryFn: async () => {
      const linhas = await rpc("marketing_ig_serie", {
        p_inicio: periodo.inicio,
        p_fim: periodo.fim,
      });
      return linhas.map((l) => numeros<PontoSerieIg>(l, ["valor"]));
    },
    staleTime: FRESCO_MS,
  });
}

export function useMidiasIg(periodo: Periodo, tipo: TipoMidia | null) {
  return useQuery({
    queryKey: [...chaveMarketing, "ig-midias", tipo ?? "todas", periodo.inicio, periodo.fim],
    queryFn: async () => {
      const linhas = await rpc("marketing_ig_midias", {
        p_inicio: periodo.inicio,
        p_fim: periodo.fim,
        p_tipo: tipo,
      });
      return linhas.map((l) => numeros<MidiaIg>(l, CAMPOS_MIDIA));
    },
    staleTime: FRESCO_MS,
  });
}

export function useDemografiaIg() {
  return useQuery({
    queryKey: [...chaveMarketing, "ig-demografia"],
    queryFn: async () => {
      const linhas = await rpc("marketing_ig_demografia", {});
      return linhas.map((l) => numeros<LinhaDemografia>(l, ["valor"]));
    },
    staleTime: FRESCO_MS,
  });
}

/**
 * Métricas da Meta para posts da Galeria (Imagery Engine), pelo ig_media_id
 * gravado na publicação. Devolve { [mediaId]: { reach: 120, views: 300, ... } }.
 */
export function useMetricasDasMidias(mediaIds: string[]) {
  const ids = [...new Set(mediaIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: [...chaveMarketing, "metricas-midias", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)("ig_midia_insights")
        .select("midia_id, metrica, valor")
        .in("midia_id", ids)
        .in("metrica", ["reach", "views", "total_interactions", "saved", "shares"]);
      if (error) throw error;
      const mapa: Record<string, Record<string, number>> = {};
      for (const l of (data ?? []) as {
        midia_id: string;
        metrica: string;
        valor: number | string;
      }[]) {
        (mapa[l.midia_id] ??= {})[l.metrica] = Number(l.valor);
      }
      return mapa;
    },
    staleTime: FRESCO_MS,
  });
}

// ── Integração ───────────────────────────────────────────────────────────────

export function useStatusIntegracao() {
  return useQuery({
    queryKey: [...chaveMarketing, "status"],
    queryFn: async () => {
      const linhas = await rpc("marketing_status_integracao", {});
      return linhas.map((l) => numeros<StatusJob>(l, ["registros", "codigo_erro"]));
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export interface Execucao {
  id: string;
  job: string;
  iniciado_em: string;
  finalizado_em: string | null;
  status: StatusJob["ultimo_status"];
  registros: number;
  erro: string | null;
  codigo_erro: number | null;
  detalhes: Record<string, unknown> | null;
}

export function useExecucoes(limite = 30) {
  return useQuery({
    queryKey: [...chaveMarketing, "execucoes", limite],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)("meta_sync_execucoes")
        .select(
          "id, job, iniciado_em, finalizado_em, status, registros, erro, codigo_erro, detalhes",
        )
        .order("iniciado_em", { ascending: false })
        .limit(limite);
      if (error) throw error;
      return (data ?? []) as Execucao[];
    },
    staleTime: 30_000,
  });
}

export type FuncaoSync = "meta-sync-ads" | "meta-sync-instagram" | "meta-sync-stories";

export interface RespostaSync {
  ok: boolean;
  pulado?: boolean;
  status?: string;
  registros?: number;
  erro?: string;
}

/**
 * "Sincronizar agora" (só admin; a função confere o papel). Ignora a guarda
 * diária (?forcar=1) e pode levar até ~2 min. Ao terminar, recarrega os dados.
 */
export function useSincronizarAgora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (funcao: FuncaoSync): Promise<RespostaSync> => {
      const caminho = funcao === "meta-sync-stories" ? funcao : `${funcao}?forcar=1`;
      const { data, error } = await supabase.functions.invoke(caminho, {
        method: "POST",
        body: {},
      });
      // Falha da Meta volta como 502 com o motivo no corpo.
      if (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contexto = (error as any)?.context;
        if (contexto && typeof contexto.json === "function") {
          try {
            return (await contexto.json()) as RespostaSync;
          } catch {
            /* corpo não é JSON: cai no erro genérico abaixo */
          }
        }
        throw error;
      }
      return data as RespostaSync;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chaveMarketing }),
  });
}

/** Atualização do saldo na tela: a cada minuto, e ao voltar para a aba. */
export const SALDO_INTERVALO_MS = 60_000;

export class ErroSaldo extends Error {
  constructor(
    mensagem: string,
    readonly tokenInvalido = false,
  ) {
    super(mensagem);
  }
}

/**
 * Saldo da conta de anúncios lido ao vivo na Meta pela função meta-saldo
 * (não passa pelo banco). Só a gestão recebe; para os demais a função nega.
 */
export function useSaldoMeta() {
  return useQuery({
    queryKey: [...chaveMarketing, "saldo"],
    queryFn: async (): Promise<SaldoConta> => {
      const { data, error } = await supabase.functions.invoke("meta-saldo", {
        method: "POST",
        body: {},
      });
      if (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contexto = (error as any)?.context;
        if (contexto && typeof contexto.json === "function") {
          try {
            const corpo = await contexto.json();
            throw new ErroSaldo(
              corpo?.erro ?? "Falha ao consultar a Meta",
              corpo?.tokenInvalido === true,
            );
          } catch (e) {
            if (e instanceof ErroSaldo) throw e;
          }
        }
        throw error;
      }
      return (data as { saldo: SaldoConta }).saldo;
    },
    refetchInterval: SALDO_INTERVALO_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
    retry: 1,
  });
}

/** Progresso das cargas históricas (Ads em meses, Instagram em semanas). */
export function useProgressoCarga() {
  return useQuery({
    queryKey: [...chaveMarketing, "progresso-carga"],
    queryFn: async () => {
      const linhas = await rpc("marketing_progresso_carga", {});
      return linhas.map((l) => numeros<ProgressoCarga>(l, ["feitas", "total"]));
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
