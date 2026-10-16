// Consultas e tipos da tela de Relatórios (metas e conversão por etapa).
//
// Os números saem prontos das funções SQL relatorio_conversao,
// relatorio_tempo_por_etapa e metas_x_realizado (migration
// 20261017000300_metas_relatorios.sql), que já recortam pelo papel de quem
// pergunta e deixam de fora leads de teste e leads na lixeira. As tabelas e
// funções novas ainda não estão em src/integrations/supabase/types.ts, por
// isso os tipos ficam aqui e as chamadas passam por cast.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { LeadStatus } from "@/lib/types";

// ── Período ──────────────────────────────────────────────────────────────

export interface Periodo {
  /** Dia inicial, "AAAA-MM-DD" (inclusive). */
  inicio: string;
  /** Dia final, "AAAA-MM-DD" (inclusive). */
  fim: string;
}

export type PresetPeriodo = "mes" | "mes_passado" | "30d" | "90d" | "ano";

export const PRESETS_PERIODO: { value: PresetPeriodo; label: string }[] = [
  { value: "mes", label: "Este mês" },
  { value: "mes_passado", label: "Mês passado" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "ano", label: "Este ano" },
];

/** Data local → "AAAA-MM-DD" (sem passar por UTC, que muda o dia à noite). */
export function paraDiaISO(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** "AAAA-MM-DD" → Date local à meia-noite. */
export function deDiaISO(dia: string): Date {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, m - 1, d);
}

export function periodoDoPreset(preset: PresetPeriodo, hoje = new Date()): Periodo {
  const a = hoje.getFullYear();
  const m = hoje.getMonth();
  const dia = (d: Date) => paraDiaISO(d);
  switch (preset) {
    case "mes":
      return { inicio: dia(new Date(a, m, 1)), fim: dia(new Date(a, m + 1, 0)) };
    case "mes_passado":
      return { inicio: dia(new Date(a, m - 1, 1)), fim: dia(new Date(a, m, 0)) };
    case "30d":
      return { inicio: dia(new Date(a, m, hoje.getDate() - 29)), fim: dia(hoje) };
    case "90d":
      return { inicio: dia(new Date(a, m, hoje.getDate() - 89)), fim: dia(hoje) };
    case "ano":
      return { inicio: dia(new Date(a, 0, 1)), fim: dia(new Date(a, 11, 31)) };
  }
}

const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const diaMesAno = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** Período curto para a tela: "01 out – 31 out 2026". */
export function formatPeriodo(inicio: string, fim: string): string {
  const i = deDiaISO(inicio);
  const f = deDiaISO(fim);
  const limpar = (s: string) => s.replace(/ de /g, " ").replace(/\./g, "");
  const ini = i.getFullYear() === f.getFullYear() ? diaMes.format(i) : diaMesAno.format(i);
  return `${limpar(ini)} – ${limpar(diaMesAno.format(f))}`;
}

// ── Conversão ────────────────────────────────────────────────────────────

export type DimensaoConversao = "total" | "vendedor" | "origem";

export interface LinhaConversao {
  dimensao: DimensaoConversao;
  chave: string;
  rotulo: string;
  entraram: number;
  qualificados: number;
  agendados: number;
  visitaram: number;
  propostas: number;
  fechados: number;
  perdidos: number;
  taxa_qualificacao: number | null;
  taxa_agendamento: number | null;
  taxa_visita: number | null;
  taxa_proposta: number | null;
  taxa_fechamento: number | null;
  taxa_geral: number | null;
}

/** Etapas do funil de conversão, na ordem, com a coluna de contagem de cada uma. */
export const ETAPAS_CONVERSAO: {
  status: Exclude<LeadStatus, "perdido">;
  campo: "entraram" | "qualificados" | "agendados" | "visitaram" | "propostas" | "fechados";
  /** Taxa de quem chegou aqui vindo da etapa anterior (nula na primeira). */
  taxa: keyof LinhaConversao | null;
}[] = [
  { status: "novo", campo: "entraram", taxa: null },
  { status: "qualificado", campo: "qualificados", taxa: "taxa_qualificacao" },
  { status: "agendado", campo: "agendados", taxa: "taxa_agendamento" },
  { status: "visitou", campo: "visitaram", taxa: "taxa_visita" },
  { status: "proposta", campo: "propostas", taxa: "taxa_proposta" },
  { status: "fechado", campo: "fechados", taxa: "taxa_fechamento" },
];

// ── Tempo por etapa ──────────────────────────────────────────────────────

export interface TempoEtapa {
  etapa: LeadStatus;
  ordem: number;
  passagens: number;
  media_horas: number | null;
  mediana_horas: number | null;
  em_andamento: number;
  media_horas_em_andamento: number | null;
}

/** 5 → "5 h"; 30 → "1,3 dia"; nulo → "—". */
export function formatDuracao(horas: number | null | undefined): string {
  if (horas === null || horas === undefined) return "—";
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 48) return `${Math.round(horas)} h`;
  const dias = horas / 24;
  return `${dias.toLocaleString("pt-BR", { maximumFractionDigits: dias < 10 ? 1 : 0 })} dias`;
}

// ── Metas ────────────────────────────────────────────────────────────────

export type IndicadorMeta = "leads_atendidos" | "visitas" | "propostas" | "vendas";

export const INDICADORES_META: { value: IndicadorMeta; label: string; descricao: string }[] = [
  {
    value: "leads_atendidos",
    label: "Leads atendidos",
    descricao: "Leads que entraram na carteira no período.",
  },
  { value: "visitas", label: "Visitas", descricao: "Visitas realizadas no período." },
  {
    value: "propostas",
    label: "Propostas",
    descricao: "Leads que chegaram a Proposta no período.",
  },
  { value: "vendas", label: "Vendas", descricao: "Leads que chegaram a Fechado no período." },
];

export const INDICADOR_LABEL = Object.fromEntries(
  INDICADORES_META.map((i) => [i.value, i.label]),
) as Record<IndicadorMeta, string>;

export interface MetaRealizado {
  meta_id: string;
  /** Nulo = meta da equipe. */
  vendedor_id: string | null;
  vendedor_nome: string | null;
  indicador: IndicadorMeta;
  periodo_inicio: string;
  periodo_fim: string;
  alvo: number;
  realizado: number;
  /** realizado / alvo (pode passar de 1). */
  percentual: number | null;
  /** Quanto do período da meta já passou, de 0 a 1. */
  periodo_decorrido: number | null;
}

export interface NovaMeta {
  vendedor_id: string | null;
  periodo_inicio: string;
  periodo_fim: string;
  indicador: IndicadorMeta;
  alvo: number;
}

// ── Consultas ────────────────────────────────────────────────────────────

const TENTATIVAS = { retry: 1, retryDelay: 800 } as const;

// O PostgREST devolve numeric como string; tudo que é número vira número aqui.
function numeros<T>(linha: Record<string, unknown>, campos: string[]): T {
  const saida: Record<string, unknown> = { ...linha };
  for (const c of campos) {
    const v = linha[c];
    saida[c] = v === null || v === undefined ? null : Number(v);
  }
  return saida as T;
}

async function chamar(funcao: string, periodo: Periodo): Promise<Record<string, unknown>[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(funcao, {
    p_inicio: periodo.inicio,
    p_fim: periodo.fim,
  });
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

export const chaveRelatorios = ["relatorios"] as const;

export function useConversao(periodo: Periodo) {
  return useQuery({
    queryKey: [...chaveRelatorios, "conversao", periodo.inicio, periodo.fim],
    queryFn: async () =>
      (await chamar("relatorio_conversao", periodo)).map((l) =>
        numeros<LinhaConversao>(l, [
          "entraram",
          "qualificados",
          "agendados",
          "visitaram",
          "propostas",
          "fechados",
          "perdidos",
          "taxa_qualificacao",
          "taxa_agendamento",
          "taxa_visita",
          "taxa_proposta",
          "taxa_fechamento",
          "taxa_geral",
        ]),
      ),
    ...TENTATIVAS,
  });
}

export function useTempoPorEtapa(periodo: Periodo) {
  return useQuery({
    queryKey: [...chaveRelatorios, "tempo", periodo.inicio, periodo.fim],
    queryFn: async () =>
      (await chamar("relatorio_tempo_por_etapa", periodo)).map((l) =>
        numeros<TempoEtapa>(l, [
          "ordem",
          "passagens",
          "media_horas",
          "mediana_horas",
          "em_andamento",
          "media_horas_em_andamento",
        ]),
      ),
    ...TENTATIVAS,
  });
}

export function useMetasRealizado(periodo: Periodo) {
  return useQuery({
    queryKey: [...chaveRelatorios, "metas", periodo.inicio, periodo.fim],
    queryFn: async () =>
      (await chamar("metas_x_realizado", periodo)).map((l) =>
        numeros<MetaRealizado>(l, ["alvo", "realizado", "percentual", "periodo_decorrido"]),
      ),
    ...TENTATIVAS,
  });
}

export async function criarMeta(meta: NovaMeta): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from as any)("metas").insert(meta);
  if (error) {
    if (error.code === "23505") {
      throw new Error("Já existe uma meta desse indicador para o mesmo vendedor e período.");
    }
    throw error;
  }
}

export async function excluirMeta(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from as any)("metas").delete().eq("id", id);
  if (error) throw error;
}
