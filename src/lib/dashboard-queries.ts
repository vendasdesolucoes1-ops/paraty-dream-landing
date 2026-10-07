// Consultas da tela inicial do painel.
//
// Regra da casa: a tela nunca baixa a tabela de leads inteira. Números são
// contagens feitas pelo banco (HEAD + count=exact, ~300 bytes cada, mesmo
// custo com 50 ou 50 mil leads) e listas pedem só as colunas e as linhas que
// aparecem na tela. A versão anterior fazia `select("*")` de todos os leads a
// cada 60 s só para contar por status no navegador.
//
// Leads de teste (criados pelo painel "Testar Agente") ficam fora de tudo: são
// conversas simuladas e inflariam os números da operação real.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/hooks/use-profile";
import { inicioDoDia, somarDias } from "@/lib/format";
import { ORIGENS, ORIGENS_IMPORTADAS } from "@/lib/lead-status";
import {
  LEAD_STATUS_COLUMNS,
  type LeadOrigem,
  type LeadStatus,
  type ProfileRole,
} from "@/lib/types";

/** Vendedor vê só a própria carteira; admin e gestor veem tudo. */
export interface Escopo {
  vendedorId: string | null;
}

// Vendedor sem cadastro de vendedor vinculado não tem carteira: filtra por um
// id que não existe em vez de, por engano, mostrar os leads de todo mundo.
const SEM_CARTEIRA = "00000000-0000-0000-0000-000000000000";

export function useEscopo(): {
  pronto: boolean;
  escopo: Escopo;
  papel: ProfileRole | null;
  nome: string | null;
} {
  const { profile, loading } = useProfile();
  const papel = profile?.role ?? null;
  const vendedorId = papel === "vendedor" ? (profile?.vendedor_id ?? SEM_CARTEIRA) : null;
  return {
    pronto: !loading && !!profile,
    escopo: { vendedorId },
    papel,
    nome: profile?.nome ?? null,
  };
}

const ATUALIZAR_A_CADA_MS = 60_000;

// Uma segunda tentativa rápida cobre soluço de rede; mais que isso só deixa o
// esqueleto na tela por ~7 s (padrão do React Query: 3 tentativas com espera
// crescente) antes de a pessoa saber que deu erro e poder tentar de novo.
const TENTATIVAS = { retry: 1, retryDelay: 800 } as const;

// ── Contagens ────────────────────────────────────────────────────────────

function contagemBase(escopo: Escopo) {
  let q = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .is("deletado_em", null)
    .eq("is_teste", false);
  if (escopo.vendedorId) q = q.eq("vendedor_id", escopo.vendedorId);
  return q;
}

type ContagemLeads = ReturnType<typeof contagemBase>;

/**
 * Só leads que chegaram por conta própria (site, WhatsApp, indicação,
 * Instagram). Contatos importados em lote pelos extratores ficam de fora de
 * "novos hoje" e da chegada por dia: uma importação de 500 números esconderia
 * a demanda real do dia. Sem origem (null) conta como entrada.
 */
const SO_ENTRADA = `origem.is.null,origem.not.in.(${ORIGENS_IMPORTADAS.join(",")})`;

async function contar(escopo: Escopo, filtro: (q: ContagemLeads) => ContagemLeads) {
  const { count, error } = await filtro(contagemBase(escopo));
  if (error) throw error;
  return count ?? 0;
}

export interface ResumoLeads {
  total: number;
  emAndamento: number;
  novosHoje: number;
  novosOntem: number;
  porStatus: { status: LeadStatus; total: number }[];
  porOrigem: { origem: LeadOrigem | null; total: number }[];
}

export function useResumoLeads(escopo: Escopo, enabled: boolean) {
  return useQuery({
    queryKey: ["dash", "resumo", escopo.vendedorId],
    enabled,
    ...TENTATIVAS,
    refetchInterval: ATUALIZAR_A_CADA_MS,
    queryFn: async (): Promise<ResumoLeads> => {
      const hoje = inicioDoDia();
      const ontem = somarDias(hoje, -1);

      const [porStatus, porOrigem, novosHoje, novosOntem] = await Promise.all([
        Promise.all(
          LEAD_STATUS_COLUMNS.map(async ({ value }) => ({
            status: value,
            total: await contar(escopo, (q) => q.eq("status_crm", value)),
          })),
        ),
        Promise.all(
          ORIGENS.map(async ({ value }) => ({
            origem: value as LeadOrigem | null,
            total: await contar(escopo, (q) => q.eq("origem", value)),
          })),
        ),
        contar(escopo, (q) => q.or(SO_ENTRADA).gte("created_at", hoje.toISOString())),
        contar(escopo, (q) =>
          q
            .or(SO_ENTRADA)
            .gte("created_at", ontem.toISOString())
            .lt("created_at", hoje.toISOString()),
        ),
      ]);

      const total = porStatus.reduce((s, p) => s + p.total, 0);
      const comOrigem = porOrigem.reduce((s, p) => s + p.total, 0);
      const emAndamento = porStatus
        .filter((p) => p.status !== "fechado" && p.status !== "perdido")
        .reduce((s, p) => s + p.total, 0);

      return {
        total,
        emAndamento,
        novosHoje,
        novosOntem,
        porStatus,
        porOrigem:
          total > comOrigem
            ? [...porOrigem, { origem: null, total: total - comOrigem }]
            : porOrigem,
      };
    },
  });
}

// ── Chegada de leads por dia ────────────────────────────────────────────

export const DIAS_CHEGADAS = 14;

export function useChegadas(escopo: Escopo, enabled: boolean) {
  return useQuery({
    queryKey: ["dash", "chegadas", escopo.vendedorId],
    enabled,
    ...TENTATIVAS,
    refetchInterval: ATUALIZAR_A_CADA_MS,
    queryFn: async () => {
      const inicio = somarDias(inicioDoDia(), -(DIAS_CHEGADAS - 1));
      let q = supabase
        .from("leads")
        .select("created_at")
        .is("deletado_em", null)
        .eq("is_teste", false)
        .or(SO_ENTRADA)
        .gte("created_at", inicio.toISOString());
      if (escopo.vendedorId) q = q.eq("vendedor_id", escopo.vendedorId);
      const { data, error } = await q;
      if (error) throw error;

      const dias = Array.from({ length: DIAS_CHEGADAS }, (_, i) => ({
        dia: somarDias(inicio, i),
        total: 0,
      }));
      for (const row of data ?? []) {
        const indice = Math.floor(
          (inicioDoDia(new Date(row.created_at)).getTime() - inicio.getTime()) / 86_400_000,
        );
        const dia = dias.at(indice);
        if (dia && indice >= 0) dia.total += 1;
      }
      return dias;
    },
  });
}

// ── Agenda: visitas de hoje aos próximos 7 dias ─────────────────────────

export interface VisitaProxima {
  id: string;
  data_hora: string;
  status: string;
  aConfirmar: boolean;
  lead: { id: string; nome: string; telefone: string | null } | null;
}

/** A Sophia marca na observação as visitas cuja data ela não conseguiu confirmar. */
function visitaAConfirmar(observacoes: string | null): boolean {
  return /A CONFIRMAR|CONFLITANTE/.test(observacoes ?? "");
}

export function useAgendaProxima(escopo: Escopo, enabled: boolean) {
  return useQuery({
    queryKey: ["dash", "agenda", escopo.vendedorId],
    enabled,
    ...TENTATIVAS,
    refetchInterval: ATUALIZAR_A_CADA_MS,
    queryFn: async (): Promise<VisitaProxima[]> => {
      const inicio = inicioDoDia();
      let q = supabase
        .from("visitas")
        .select("id, data_hora, status, observacoes, lead:leads(id, nome, telefone, is_teste)")
        .in("status", ["agendada", "confirmada"])
        .gte("data_hora", inicio.toISOString())
        .lt("data_hora", somarDias(inicio, 8).toISOString())
        .order("data_hora", { ascending: true })
        .limit(60);
      if (escopo.vendedorId) q = q.eq("vendedor_id", escopo.vendedorId);
      const { data, error } = await q;
      if (error) throw error;

      type Linha = {
        id: string;
        data_hora: string;
        status: string;
        observacoes: string | null;
        lead: { id: string; nome: string; telefone: string | null; is_teste: boolean } | null;
      };
      return ((data ?? []) as unknown as Linha[])
        .filter((v) => !v.lead?.is_teste)
        .map((v) => ({
          id: v.id,
          data_hora: v.data_hora,
          status: v.status,
          aConfirmar: visitaAConfirmar(v.observacoes),
          lead: v.lead ? { id: v.lead.id, nome: v.lead.nome, telefone: v.lead.telefone } : null,
        }));
    },
  });
}

// ── Fila de ação: o que precisa de alguém agora ─────────────────────────

export type MotivoAcao = "qualificado" | "proposta_parada" | "visita_a_confirmar" | "humano";

export interface ItemAcao {
  chave: string;
  motivo: MotivoAcao;
  desde: string;
  lead: { id: string; nome: string; telefone: string | null } | null;
  /** Só para "humano": quantas conversas estão com atendimento humano aberto. */
  quantidade?: number;
}

/** Proposta sem movimento há mais que isto vira pendência. */
const PROPOSTA_PARADA_DIAS = 3;

export function useFilaDeAcao(escopo: Escopo, papel: ProfileRole | null, enabled: boolean) {
  return useQuery({
    queryKey: ["dash", "fila", escopo.vendedorId, papel],
    enabled,
    ...TENTATIVAS,
    refetchInterval: ATUALIZAR_A_CADA_MS,
    queryFn: async (): Promise<ItemAcao[]> => {
      const colunas = "id, nome, telefone, updated_at";

      const leadsEm = (status: LeadStatus) => {
        let q = supabase
          .from("leads")
          .select(colunas)
          .is("deletado_em", null)
          .eq("is_teste", false)
          .eq("status_crm", status);
        if (escopo.vendedorId) q = q.eq("vendedor_id", escopo.vendedorId);
        return q;
      };

      let visitasQ = supabase
        .from("visitas")
        .select("id, data_hora, observacoes, created_at, lead:leads(id, nome, telefone, is_teste)")
        .eq("status", "agendada")
        .gte("data_hora", inicioDoDia().toISOString())
        .or("observacoes.ilike.%A CONFIRMAR%,observacoes.ilike.%CONFLITANTE%")
        .order("data_hora", { ascending: true })
        .limit(6);
      if (escopo.vendedorId) visitasQ = visitasQ.eq("vendedor_id", escopo.vendedorId);

      const [qualificados, propostas, visitas, humanos] = await Promise.all([
        leadsEm("qualificado").order("updated_at", { ascending: true }).limit(6),
        leadsEm("proposta")
          .lt("updated_at", somarDias(new Date(), -PROPOSTA_PARADA_DIAS).toISOString())
          .order("updated_at", { ascending: true })
          .limit(6),
        visitasQ,
        // Atendimento humano em aberto é visão de gestão; a tabela é do agente
        // de IA e pode não estar liberada para todos os perfis — na falta,
        // simplesmente não entra na fila.
        papel === "vendedor"
          ? Promise.resolve({ count: 0, error: null })
          : supabase
              .from("ai_agent_human_takeover")
              .select("id", { count: "exact", head: true })
              .is("resolved_at", null),
      ]);

      if (qualificados.error) throw qualificados.error;
      if (propostas.error) throw propostas.error;
      if (visitas.error) throw visitas.error;

      const itens: ItemAcao[] = [];

      if (!humanos.error && (humanos.count ?? 0) > 0) {
        itens.push({
          chave: "humano",
          motivo: "humano",
          desde: new Date().toISOString(),
          lead: null,
          quantidade: humanos.count ?? 0,
        });
      }

      type Visita = {
        id: string;
        data_hora: string;
        created_at: string;
        lead: { id: string; nome: string; telefone: string | null; is_teste: boolean } | null;
      };
      for (const v of (visitas.data ?? []) as unknown as Visita[]) {
        if (v.lead?.is_teste) continue;
        itens.push({
          chave: `visita-${v.id}`,
          motivo: "visita_a_confirmar",
          desde: v.data_hora,
          lead: v.lead ? { id: v.lead.id, nome: v.lead.nome, telefone: v.lead.telefone } : null,
        });
      }
      for (const l of propostas.data ?? []) {
        itens.push({
          chave: `proposta-${l.id}`,
          motivo: "proposta_parada",
          desde: l.updated_at,
          lead: l,
        });
      }
      for (const l of qualificados.data ?? []) {
        itens.push({
          chave: `qualificado-${l.id}`,
          motivo: "qualificado",
          desde: l.updated_at,
          lead: l,
        });
      }
      return itens;
    },
  });
}

// ── Últimos leads ───────────────────────────────────────────────────────

export interface LeadRecente {
  id: string;
  nome: string;
  telefone: string | null;
  origem: LeadOrigem | null;
  status_crm: LeadStatus;
  created_at: string;
}

export function useUltimosLeads(escopo: Escopo, enabled: boolean) {
  return useQuery({
    queryKey: ["dash", "ultimos", escopo.vendedorId],
    enabled,
    ...TENTATIVAS,
    refetchInterval: ATUALIZAR_A_CADA_MS,
    queryFn: async (): Promise<LeadRecente[]> => {
      let q = supabase
        .from("leads")
        .select("id, nome, telefone, origem, status_crm, created_at")
        .is("deletado_em", null)
        .eq("is_teste", false)
        .order("created_at", { ascending: false })
        .limit(6);
      if (escopo.vendedorId) q = q.eq("vendedor_id", escopo.vendedorId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LeadRecente[];
    },
  });
}

// ── Lotes ───────────────────────────────────────────────────────────────

export function useLotesDisponiveis(enabled: boolean) {
  return useQuery({
    queryKey: ["dash", "lotes-disponiveis"],
    enabled,
    ...TENTATIVAS,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("lotes")
        .select("id", { count: "exact", head: true })
        .eq("status", "disponivel");
      if (error) throw error;
      return count ?? 0;
    },
  });
}
