// Tarefas por lead e SLA de atendimento (issue #57).
//
// A tabela `tarefas` e as RPCs `sla_leads` / `sla_por_vendedor` vêm da
// migration 20261017000100_tarefas.sql e ainda não estão nos tipos gerados
// (src/integrations/supabase/types.ts): as linhas são tipadas aqui. O recorte
// por papel (vendedor só vê a carteira) é feito no banco, pela RLS e dentro
// das funções.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/hooks/use-profile";
import { inicioDoDia, somarDias } from "@/lib/format";

// ── Tipos ───────────────────────────────────────────────────────────────

export type TarefaTipo = "retorno" | "ligacao" | "whatsapp" | "visita" | "documento" | "outro";
export type TarefaOrigem = "manual" | "handoff";

export const TAREFA_TIPOS: { value: TarefaTipo; label: string }[] = [
  { value: "retorno", label: "Retorno" },
  { value: "ligacao", label: "Ligação" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "visita", label: "Visita" },
  { value: "documento", label: "Documento" },
  { value: "outro", label: "Outro" },
];

export const TAREFA_TIPO_LABEL = Object.fromEntries(
  TAREFA_TIPOS.map((t) => [t.value, t.label]),
) as Record<TarefaTipo, string>;

export interface Tarefa {
  id: string;
  lead_id: string;
  responsavel_id: string | null;
  tipo: TarefaTipo;
  titulo: string;
  vence_em: string;
  concluida_em: string | null;
  origem: TarefaOrigem;
  criado_por: string | null;
  criado_em: string;
  responsavel: { id: string; nome: string | null } | null;
}

export interface TarefaComLead extends Tarefa {
  lead: { id: string; nome: string; telefone: string | null } | null;
}

export interface NovaTarefa {
  lead_id: string;
  tipo: TarefaTipo;
  titulo: string;
  vence_em: string;
  responsavel_id: string | null;
}

/** Uma linha de `sla_leads()`. Minutos são de horário comercial. */
export interface SlaLead {
  lead_id: string;
  lead_nome: string;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  primeira_entrada_em: string;
  primeira_resposta_em: string | null;
  primeira_resposta_min: number | null;
  primeira_resposta_estourada: boolean;
  ultima_entrada_em: string;
  aguardando_desde: string | null;
  aguardando_min: number | null;
  aguardando_estourado: boolean;
}

/** Uma linha de `sla_por_vendedor()`. */
export interface SlaVendedor {
  vendedor_id: string | null;
  vendedor_nome: string;
  leads_medidos: number;
  primeira_resposta_estourada: number;
  aguardando: number;
  aguardando_estourado: number;
  mediana_primeira_resposta_min: number | null;
}

// ── Metas de SLA ────────────────────────────────────────────────────────
// Espelho de public.sla_metas() — a fonte da verdade é o banco, que calcula
// os estouros. Aqui só servem para o texto da tela. Horário comercial é a
// janela de envio da fila: 9h às 20h (Brasília), segunda a sábado, sem
// feriados.

/** Primeira mensagem do lead respondida (Sophia ou pessoa) em até 15 min úteis. */
export const SLA_PRIMEIRA_RESPOSTA_MIN = 15;
/** Mensagem do lead sem resposta por mais de 30 min úteis estoura o SLA. */
export const SLA_SEM_RESPOSTA_MIN = 30;
/** Janela, em dias, das conversas consideradas no consolidado. */
export const SLA_JANELA_DIAS = 30;

/** 7 → "7 min"; 135 → "2 h 15 min"; 1500 → "25 h". Minutos úteis. */
export function formatMinutos(min: number | null | undefined): string {
  if (min == null) return "—";
  const m = Math.round(Number(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h >= 10 || !r) return `${h} h`;
  return `${h} h ${r} min`;
}

// ── Consultas ───────────────────────────────────────────────────────────

const TENTATIVAS = { retry: 1, retryDelay: 800 } as const;
const ATUALIZAR_A_CADA_MS = 60_000;

const COLUNAS =
  "id, lead_id, responsavel_id, tipo, titulo, vence_em, concluida_em, origem, criado_por, criado_em, responsavel:profiles!tarefas_responsavel_id_fkey(id, nome)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabelaTarefas = () => (supabase.from as any)("tarefas");

/** Tarefas do lead: abertas primeiro (por vencimento), concluídas depois. */
export function useTarefasDoLead(leadId: string) {
  return useQuery({
    queryKey: ["tarefas", "lead", leadId],
    ...TENTATIVAS,
    queryFn: async (): Promise<Tarefa[]> => {
      const { data, error } = await tabelaTarefas()
        .select(COLUNAS)
        .eq("lead_id", leadId)
        .order("vence_em", { ascending: true })
        .limit(200);
      if (error) throw error;
      const lista = (data ?? []) as Tarefa[];
      return [
        ...lista.filter((t) => !t.concluida_em),
        ...lista
          .filter((t) => t.concluida_em)
          .sort((a, b) => (b.concluida_em ?? "").localeCompare(a.concluida_em ?? "")),
      ];
    },
  });
}

/**
 * Tarefas abertas que vencem até o fim de hoje (inclui as atrasadas) e são
 * minhas ou não têm responsável. A RLS já limita aos leads da carteira.
 */
export function useMinhasTarefasHoje(enabled: boolean) {
  const { profile } = useProfile();
  const perfilId = profile?.id ?? null;
  return useQuery({
    queryKey: ["tarefas", "hoje", perfilId],
    enabled: enabled && !!perfilId,
    ...TENTATIVAS,
    refetchInterval: ATUALIZAR_A_CADA_MS,
    queryFn: async (): Promise<TarefaComLead[]> => {
      const fimDeHoje = somarDias(inicioDoDia(), 1);
      const { data, error } = await tabelaTarefas()
        .select(`${COLUNAS}, lead:leads(id, nome, telefone, is_teste, deletado_em)`)
        .is("concluida_em", null)
        .lt("vence_em", fimDeHoje.toISOString())
        .or(`responsavel_id.eq.${perfilId},responsavel_id.is.null`)
        .order("vence_em", { ascending: true })
        .limit(50);
      if (error) throw error;
      type Linha = Omit<TarefaComLead, "lead"> & {
        lead: {
          id: string;
          nome: string;
          telefone: string | null;
          is_teste: boolean;
          deletado_em: string | null;
        } | null;
      };
      return ((data ?? []) as Linha[])
        .filter((t) => t.lead && !t.lead.is_teste && !t.lead.deletado_em)
        .map((t) => ({
          ...t,
          lead: t.lead ? { id: t.lead.id, nome: t.lead.nome, telefone: t.lead.telefone } : null,
        }));
    },
  });
}

/** SLA consolidado por vendedor (gestão vê todos; vendedor, a própria linha). */
export function useSlaPorVendedor(enabled: boolean) {
  return useQuery({
    queryKey: ["dash", "sla-vendedores"],
    enabled,
    ...TENTATIVAS,
    refetchInterval: ATUALIZAR_A_CADA_MS,
    queryFn: async (): Promise<SlaVendedor[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("sla_por_vendedor", {
        p_dias: SLA_JANELA_DIAS,
      });
      if (error) throw error;
      return ((data ?? []) as SlaVendedor[]).map((l) => ({
        ...l,
        mediana_primeira_resposta_min:
          l.mediana_primeira_resposta_min == null ? null : Number(l.mediana_primeira_resposta_min),
      }));
    },
  });
}

/** SLA de um lead só (ficha). Null quando o lead nunca escreveu. */
export function useSlaDoLead(leadId: string) {
  return useQuery({
    queryKey: ["sla", "lead", leadId],
    ...TENTATIVAS,
    refetchInterval: ATUALIZAR_A_CADA_MS,
    queryFn: async (): Promise<SlaLead | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("sla_leads", {
        p_dias: 3650,
        p_lead_id: leadId,
      });
      if (error) throw error;
      return ((data ?? []) as SlaLead[])[0] ?? null;
    },
  });
}

// ── Mutações ────────────────────────────────────────────────────────────

export function useCriarTarefa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (nova: NovaTarefa) => {
      const { error } = await tabelaTarefas().insert({ ...nova, origem: "manual" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tarefas"] }),
  });
}

/** Conclui (ou reabre, com `concluida: false`) uma tarefa. */
export function useConcluirTarefa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, concluida }: { id: string; concluida: boolean }) => {
      const { error } = await tabelaTarefas()
        .update({ concluida_em: concluida ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tarefas"] }),
  });
}

/** Tarefa aberta com vencimento já passado. */
export function tarefaAtrasada(t: Pick<Tarefa, "vence_em" | "concluida_em">, agora = new Date()) {
  return !t.concluida_em && new Date(t.vence_em).getTime() < agora.getTime();
}
