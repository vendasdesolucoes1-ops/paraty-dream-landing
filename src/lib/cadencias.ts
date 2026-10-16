// Consultas e tipos do follow-up: cadências, aprovação dos rascunhos da IA,
// métricas, saúde da fila, regras de envio e campanhas.
//
// O contrato é o das migrations 20261018000000_cadencias.sql e
// 20261018000200_followup_metricas_campanhas.sql. Tabelas e RPCs ainda não
// estão em src/integrations/supabase/types.ts: as linhas são tipadas aqui e as
// chamadas passam por cast. Quem decide quem pode o quê é o banco (RLS e
// `sou_gestao()` dentro das funções); a tela só esconde o que não se aplica.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { readFunctionError } from "@/lib/utils";
import type { LeadStatus } from "@/lib/types";
import { diaEmSaoPaulo, type ReferenciaEtapa } from "@/lib/cadencias-formato";

// ── Tipos ───────────────────────────────────────────────────────────────

export type GatilhoCadencia = "manual" | "primeiro_contato" | "visita_agendada" | "campanha";
export type ModoEtapa = "template" | "ia_aprovacao";
export type StatusInscricao =
  | "ativa"
  | "pausada"
  | "cancelada"
  | "convertida"
  | "sem_resposta"
  | "concluida"
  | "falhou";

export type TipoMidia = "image" | "video" | "document" | "audio";

export interface MidiaEtapa {
  url: string;
  tipo: TipoMidia;
  nome?: string | null;
}

export interface Etapa {
  id: string;
  cadencia_id: string;
  ordem: number;
  referencia: ReferenciaEtapa;
  /** interval do Postgres como texto ("1 day", "-1 days +02:00:00"). */
  deslocamento: string;
  /** "HH:MM:SS" ou nulo. */
  hora_fixa: string | null;
  modo: ModoEtapa;
  template: string;
  midia: MidiaEtapa | null;
  ativa: boolean;
}

export interface Cadencia {
  id: string;
  nome: string;
  descricao: string | null;
  gatilho: GatilhoCadencia;
  ativa: boolean;
  pausa_ao_responder: boolean;
  status_crm_validos: LeadStatus[] | null;
  pausada_em: string | null;
  motivo_pausa: string | null;
  instance_id: string | null;
  criado_em: string;
  etapas: Etapa[];
}

export interface Inscricao {
  id: string;
  cadencia_id: string;
  lead_id: string;
  status: StatusInscricao;
  etapa_atual: number;
  proxima_em: string | null;
  ultimo_envio_em: string | null;
  motivo_saida: string | null;
  criado_em: string;
  cadencia: { id: string; nome: string; gatilho: GatilhoCadencia } | null;
}

export interface EventoEnvio {
  id: number;
  evento: string;
  motivo: string | null;
  etapa_ordem: number | null;
  criado_em: string;
  cadencia: { nome: string } | null;
}

export interface EnvioParaAprovar {
  id: string;
  lead_id: string;
  lead_nome: string;
  cadencia: string | null;
  etapa_ordem: number | null;
  partes: string[];
  ia_motivo: string | null;
  criado_em: string;
}

export interface MetricaFollowup {
  cadencia_id: string;
  cadencia: string;
  gatilho: GatilhoCadencia;
  etapa_ordem: number;
  enviados: number;
  entregues: number;
  lidos: number;
  respondidos_72h: number;
  opt_outs: number;
}

export interface SaudeFila {
  pendentes_vencidas: number;
  mais_antiga_min: number | null;
  erros_24h: number;
  enviadas_24h: number;
  aguardando_aprovacao: number;
  inscricoes_atrasadas: number;
  ultima_execucao_fila: string | null;
  ultima_execucao_fila_ok: boolean | null;
  ultima_execucao_cadencias: string | null;
  ultima_execucao_cadencias_ok: boolean | null;
}

export interface RegrasEnvio {
  limite_diario: number;
  aquecimento_dias: number;
  aquecimento_inicial: number;
  max_tentativas_sem_resposta: number;
  limite_opt_out_pct: number;
  minimo_envios_para_pausa: number;
  campanha_exige_base_legal: boolean;
  atualizado_em: string;
}

export interface InstanciaLimite {
  id: string;
  instance_name: string;
  limite_diario: number | null;
  aquecimento_inicio: string | null;
  enviados_hoje: number;
}

export interface ProgressoCadencia {
  total: number;
  aguardando: number;
  na_fila: number;
  enviados: number;
  pulados: number;
  erros: number;
  concluidos: number;
}

export interface MotivoCadencia {
  motivo: string;
  quantidade: number;
}

export interface Campanha {
  id: string;
  nome: string;
  ativa: boolean;
  criado_em: string;
}

// ── Rótulos ─────────────────────────────────────────────────────────────

export const GATILHOS: {
  value: Exclude<GatilhoCadencia, "campanha">;
  label: string;
  dica: string;
}[] = [
  {
    value: "manual",
    label: "Manual",
    dica: "O lead entra pela ficha, quando alguém da equipe inscreve.",
  },
  {
    value: "primeiro_contato",
    label: "Primeiro contato",
    dica: "Entra sozinho depois da abordagem do formulário.",
  },
  {
    value: "visita_agendada",
    label: "Visita agendada",
    dica: "Lembretes contados a partir da data da visita.",
  },
];

export const GATILHO_LABEL: Record<GatilhoCadencia, string> = {
  manual: "Manual",
  primeiro_contato: "Primeiro contato",
  visita_agendada: "Visita agendada",
  campanha: "Campanha",
};

export const REFERENCIAS: { value: ReferenciaEtapa; label: string }[] = [
  { value: "anterior", label: "Envio anterior" },
  { value: "inscricao", label: "Inscrição" },
  { value: "visita", label: "Data da visita" },
];

export const MODOS: { value: ModoEtapa; label: string; dica: string }[] = [
  { value: "template", label: "Texto pronto", dica: "Sai exatamente o texto do template." },
  {
    value: "ia_aprovacao",
    label: "IA com aprovação",
    dica: "Fica em Aprovação para alguém revisar antes de sair.",
  },
];

export const STATUS_INSCRICAO: {
  value: StatusInscricao;
  label: string;
  tom: "success" | "warning" | "neutral" | "info" | "danger";
}[] = [
  { value: "ativa", label: "Ativa", tom: "success" },
  { value: "pausada", label: "Pausada", tom: "warning" },
  { value: "convertida", label: "Convertida", tom: "info" },
  { value: "concluida", label: "Concluída", tom: "info" },
  { value: "sem_resposta", label: "Sem resposta", tom: "neutral" },
  { value: "cancelada", label: "Cancelada", tom: "neutral" },
  { value: "falhou", label: "Falhou", tom: "danger" },
];

export const STATUS_INSCRICAO_INFO = Object.fromEntries(
  STATUS_INSCRICAO.map((s) => [s.value, s]),
) as Record<StatusInscricao, (typeof STATUS_INSCRICAO)[number]>;

export const EVENTO_LABEL: Record<string, string> = {
  inscrito: "Inscrito",
  enfileirado: "Na fila de envio",
  aguardando_aprovacao: "Aguardando aprovação",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  enviado: "Enviado",
  adiado: "Adiado",
  bloqueado: "Bloqueado",
  respondeu: "Lead respondeu",
  opt_out: "Pediu para sair",
  pausado: "Pausado",
  retomado: "Retomado",
  cancelado: "Cancelado",
  convertido: "Convertido",
  sem_resposta: "Sem resposta",
  concluido: "Concluído",
  falhou: "Falhou",
  cadencia_pausada: "Cadência pausada",
};

// ── Infra ───────────────────────────────────────────────────────────────

const TENTATIVAS = { retry: 1, retryDelay: 800 } as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabela = (nome: string) => (supabase.from as any)(nome);

async function rpc<T>(funcao: string, args?: Record<string, unknown>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(funcao, args);
  if (error) throw error;
  return data as T;
}

/** Mensagem de erro do banco ("Sem permissão.") ou um texto genérico. */
export function mensagemDeErro(erro: unknown, padrao = "Não foi possível concluir."): string {
  if (erro && typeof erro === "object" && "message" in erro) {
    const m = String((erro as { message: unknown }).message ?? "");
    if (m) return m;
  }
  return padrao;
}

// bigint e numeric chegam como string em algumas versões do PostgREST.
function num(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}

export const chaveFollowup = ["followup"] as const;

const COLUNAS_ETAPA =
  "id, cadencia_id, ordem, referencia, deslocamento, hora_fixa, modo, template, midia, ativa";
const COLUNAS_CADENCIA = `id, nome, descricao, gatilho, ativa, pausa_ao_responder, status_crm_validos, pausada_em, motivo_pausa, instance_id, criado_em, etapas:cadencia_etapas(${COLUNAS_ETAPA})`;

// ── Cadências ───────────────────────────────────────────────────────────

/** Cadências de follow-up (sem as campanhas), com as etapas em ordem. */
export function useCadencias() {
  return useQuery({
    queryKey: [...chaveFollowup, "cadencias"],
    ...TENTATIVAS,
    queryFn: async (): Promise<Cadencia[]> => {
      const { data, error } = await tabela("cadencias")
        .select(COLUNAS_CADENCIA)
        .neq("gatilho", "campanha")
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Cadencia[]).map((c) => ({
        ...c,
        etapas: [...(c.etapas ?? [])].sort((a, b) => a.ordem - b.ordem),
      }));
    },
  });
}

/** Quantas inscrições a cadência tem em cada status (contagem feita no banco). */
export function useContagemInscricoes(cadenciaId: string) {
  return useQuery({
    queryKey: [...chaveFollowup, "contagem", cadenciaId],
    ...TENTATIVAS,
    queryFn: async (): Promise<Record<StatusInscricao, number>> => {
      const pares = await Promise.all(
        STATUS_INSCRICAO.map(async (s) => {
          const { count, error } = await tabela("inscricoes")
            .select("id", { count: "exact", head: true })
            .eq("cadencia_id", cadenciaId)
            .eq("status", s.value);
          if (error) throw error;
          return [s.value, count ?? 0] as const;
        }),
      );
      return Object.fromEntries(pares) as Record<StatusInscricao, number>;
    },
  });
}

export interface EtapaForm {
  /** Id existente, ou um novo gerado no navegador. */
  id: string;
  referencia: ReferenciaEtapa;
  deslocamento: string;
  hora_fixa: string | null;
  modo: ModoEtapa;
  template: string;
  ativa: boolean;
  midia: MidiaEtapa | null;
}

export interface CadenciaForm {
  id: string | null;
  nome: string;
  descricao: string | null;
  gatilho: Exclude<GatilhoCadencia, "campanha">;
  ativa: boolean;
  pausa_ao_responder: boolean;
  status_crm_validos: LeadStatus[] | null;
  instance_id: string | null;
  etapas: EtapaForm[];
}

// Acima de qualquer ordem real: renumerar passa por aqui para não esbarrar no
// unique (cadencia_id, ordem) enquanto as etapas trocam de lugar.
const ORDEM_TEMPORARIA = 10_000;

/**
 * Grava a cadência e as etapas. Sem RPC própria: a RLS deixa a gestão
 * escrever nas duas tabelas. As etapas mantêm o id (as métricas e as
 * inscrições se apoiam na ordem, não no id); só quando a ordem muda as
 * etapas passam por uma ordem temporária antes da final.
 */
export async function salvarCadencia(form: CadenciaForm, anteriores: Etapa[]): Promise<string> {
  const dados = {
    nome: form.nome.trim(),
    descricao: form.descricao?.trim() || null,
    gatilho: form.gatilho,
    ativa: form.ativa,
    pausa_ao_responder: form.pausa_ao_responder,
    status_crm_validos:
      form.status_crm_validos && form.status_crm_validos.length > 0
        ? form.status_crm_validos
        : null,
    instance_id: form.instance_id,
    atualizado_em: new Date().toISOString(),
  };

  let cadenciaId = form.id;
  if (cadenciaId) {
    const { error } = await tabela("cadencias").update(dados).eq("id", cadenciaId);
    if (error) throw error;
  } else {
    const { data, error } = await tabela("cadencias").insert(dados).select("id").single();
    if (error) throw error;
    cadenciaId = (data as { id: string }).id;
  }

  const ficam = new Set(form.etapas.map((e) => e.id));
  const removidas = anteriores.filter((e) => !ficam.has(e.id)).map((e) => e.id);
  if (removidas.length > 0) {
    const { error } = await tabela("cadencia_etapas").delete().in("id", removidas);
    if (error) throw error;
  }

  const ordemAnterior = new Map(anteriores.map((e) => [e.id, e.ordem]));
  const reordenou = form.etapas.some((e, i) => {
    const antes = ordemAnterior.get(e.id);
    return antes !== undefined && antes !== i + 1;
  });

  const linhas = form.etapas.map((e, i) => ({
    id: e.id,
    cadencia_id: cadenciaId,
    ordem: (reordenou ? ORDEM_TEMPORARIA : 0) + i + 1,
    referencia: e.referencia,
    deslocamento: e.deslocamento,
    hora_fixa: e.hora_fixa || null,
    modo: e.modo,
    template: e.template,
    midia: e.midia,
    ativa: e.ativa,
  }));
  if (linhas.length > 0) {
    const { error } = await tabela("cadencia_etapas").upsert(linhas, { onConflict: "id" });
    if (error) throw error;
  }
  if (reordenou) {
    for (let i = 0; i < form.etapas.length; i++) {
      const { error } = await tabela("cadencia_etapas")
        .update({ ordem: i + 1 })
        .eq("id", form.etapas[i].id);
      if (error) throw error;
    }
  }
  return cadenciaId as string;
}

export function useSalvarCadencia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ form, anteriores }: { form: CadenciaForm; anteriores: Etapa[] }) =>
      salvarCadencia(form, anteriores),
    onSettled: () => queryClient.invalidateQueries({ queryKey: chaveFollowup }),
  });
}

export function useAlternarCadencia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativa }: { id: string; ativa: boolean }) => {
      const { error } = await tabela("cadencias")
        .update({ ativa, atualizado_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: chaveFollowup }),
  });
}

export function useRetomarCadencia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rpc<void>("retomar_cadencia", { p_cadencia_id: id }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: chaveFollowup }),
  });
}

// ── Aprovação ───────────────────────────────────────────────────────────

export function useEnviosParaAprovar() {
  return useQuery({
    queryKey: [...chaveFollowup, "aprovacao"],
    ...TENTATIVAS,
    refetchInterval: 60_000,
    queryFn: async (): Promise<EnvioParaAprovar[]> => {
      const linhas = await rpc<EnvioParaAprovar[] | null>("envios_para_aprovar");
      return (linhas ?? []).map((l) => ({
        ...l,
        partes: Array.isArray(l.partes) ? l.partes.map(String) : [],
      }));
    },
  });
}

export function useAprovarEnvio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, partes }: { id: string; partes: string[] | null }) =>
      rpc<void>("aprovar_envio", { p_id: id, p_partes: partes }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: chaveFollowup }),
  });
}

export function useRejeitarEnvio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rpc<void>("rejeitar_envio", { p_id: id }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: chaveFollowup }),
  });
}

/** Pede um rascunho novo à IA (edge function `followup-redigir`). */
export async function sugerirComIa(
  mensagemId: string,
): Promise<{ partes: string[]; motivo: string }> {
  const { data, error } = await supabase.functions.invoke("followup-redigir", {
    body: { mensagem_id: mensagemId },
  });
  if (error) throw new Error(await readFunctionError(error));
  const resposta = data as { partes?: unknown; motivo?: unknown } | null;
  const partes = Array.isArray(resposta?.partes)
    ? resposta.partes.map(String).filter((p) => p.trim().length > 0)
    : [];
  if (partes.length === 0) throw new Error("A IA não devolveu texto.");
  return { partes, motivo: String(resposta?.motivo ?? "") };
}

// ── Métricas e saúde da fila ────────────────────────────────────────────

export function useFollowupMetricas() {
  return useQuery({
    queryKey: [...chaveFollowup, "metricas"],
    ...TENTATIVAS,
    refetchInterval: 60_000,
    queryFn: async (): Promise<MetricaFollowup[]> =>
      ((await rpc<Record<string, unknown>[] | null>("followup_metricas")) ?? []).map((l) => ({
        cadencia_id: String(l.cadencia_id),
        cadencia: String(l.cadencia ?? ""),
        gatilho: l.gatilho as GatilhoCadencia,
        etapa_ordem: num(l.etapa_ordem),
        enviados: num(l.enviados),
        entregues: num(l.entregues),
        lidos: num(l.lidos),
        respondidos_72h: num(l.respondidos_72h),
        opt_outs: num(l.opt_outs),
      })),
  });
}

export function useSaudeFila() {
  return useQuery({
    queryKey: [...chaveFollowup, "saude"],
    ...TENTATIVAS,
    refetchInterval: 60_000,
    queryFn: async (): Promise<SaudeFila | null> => {
      const linhas = await rpc<Record<string, unknown>[] | null>("saude_fila_completa");
      const l = linhas?.[0];
      if (!l) return null;
      return {
        pendentes_vencidas: num(l.pendentes_vencidas),
        mais_antiga_min: l.mais_antiga_min == null ? null : Number(l.mais_antiga_min),
        erros_24h: num(l.erros_24h),
        enviadas_24h: num(l.enviadas_24h),
        aguardando_aprovacao: num(l.aguardando_aprovacao),
        inscricoes_atrasadas: num(l.inscricoes_atrasadas),
        ultima_execucao_fila: (l.ultima_execucao_fila as string | null) ?? null,
        ultima_execucao_fila_ok: (l.ultima_execucao_fila_ok as boolean | null) ?? null,
        ultima_execucao_cadencias: (l.ultima_execucao_cadencias as string | null) ?? null,
        ultima_execucao_cadencias_ok: (l.ultima_execucao_cadencias_ok as boolean | null) ?? null,
      };
    },
  });
}

// ── Regras de envio ─────────────────────────────────────────────────────

export function useRegrasEnvio() {
  return useQuery({
    queryKey: [...chaveFollowup, "regras"],
    ...TENTATIVAS,
    queryFn: async (): Promise<RegrasEnvio | null> => {
      const { data, error } = await tabela("regras_envio")
        .select(
          "limite_diario, aquecimento_dias, aquecimento_inicial, max_tentativas_sem_resposta, limite_opt_out_pct, minimo_envios_para_pausa, campanha_exige_base_legal, atualizado_em",
        )
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const r = data as RegrasEnvio;
      return { ...r, limite_opt_out_pct: Number(r.limite_opt_out_pct) };
    },
  });
}

export function useSalvarRegras() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (regras: Omit<RegrasEnvio, "atualizado_em">) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await tabela("regras_envio")
        .update({
          ...regras,
          atualizado_em: new Date().toISOString(),
          atualizado_por: auth.user?.id ?? null,
        })
        .eq("id", true)
        .select("id");
      if (error) throw error;
      // A RLS de update é só do admin: sem linha de volta, nada foi gravado.
      if (!data || (data as unknown[]).length === 0) {
        throw new Error("Só administradores podem alterar as regras de envio.");
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...chaveFollowup, "regras"] }),
  });
}

/** Instâncias com o limite próprio, o início do aquecimento e o uso de hoje. */
export function useInstanciasLimites() {
  return useQuery({
    queryKey: [...chaveFollowup, "instancias"],
    ...TENTATIVAS,
    refetchInterval: 60_000,
    queryFn: async (): Promise<InstanciaLimite[]> => {
      const { data, error } = await tabela("whatsapp_instances")
        .select("id, instance_name, limite_diario, aquecimento_inicio")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const instancias = (data ?? []) as Omit<InstanciaLimite, "enviados_hoje">[];
      const { data: uso, error: erroUso } = await tabela("uso_instancia")
        .select("instance_id, enviados")
        .eq("dia", diaEmSaoPaulo());
      if (erroUso) throw erroUso;
      const porInstancia = new Map(
        ((uso ?? []) as { instance_id: string; enviados: number }[]).map((u) => [
          u.instance_id,
          u.enviados,
        ]),
      );
      return instancias.map((i) => ({ ...i, enviados_hoje: porInstancia.get(i.id) ?? 0 }));
    },
  });
}

export function useSalvarInstanciaLimite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      limite_diario,
      aquecimento_inicio,
    }: {
      id: string;
      limite_diario: number | null;
      aquecimento_inicio: string | null;
    }) => {
      const { error } = await tabela("whatsapp_instances")
        .update({ limite_diario, aquecimento_inicio })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...chaveFollowup, "instancias"] }),
  });
}

// ── Ficha do lead ───────────────────────────────────────────────────────

export function useInscricoesDoLead(leadId: string) {
  return useQuery({
    queryKey: [...chaveFollowup, "lead", leadId, "inscricoes"],
    ...TENTATIVAS,
    queryFn: async (): Promise<Inscricao[]> => {
      const { data, error } = await tabela("inscricoes")
        .select(
          "id, cadencia_id, lead_id, status, etapa_atual, proxima_em, ultimo_envio_em, motivo_saida, criado_em, cadencia:cadencias(id, nome, gatilho)",
        )
        .eq("lead_id", leadId)
        .order("criado_em", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Inscricao[];
    },
  });
}

export function useEventosDoLead(leadId: string) {
  return useQuery({
    queryKey: [...chaveFollowup, "lead", leadId, "eventos"],
    ...TENTATIVAS,
    queryFn: async (): Promise<EventoEnvio[]> => {
      const { data, error } = await tabela("envios_eventos")
        .select("id, evento, motivo, etapa_ordem, criado_em, cadencia:cadencias(nome)")
        .eq("lead_id", leadId)
        .order("criado_em", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as EventoEnvio[];
    },
  });
}

/** Cadências em que dá para inscrever um lead pela ficha (gatilho manual, ligadas). */
export function useCadenciasManuais(enabled = true) {
  return useQuery({
    queryKey: [...chaveFollowup, "manuais"],
    ...TENTATIVAS,
    enabled,
    queryFn: async (): Promise<{ id: string; nome: string }[]> => {
      const { data, error } = await tabela("cadencias")
        .select("id, nome")
        .eq("gatilho", "manual")
        .eq("ativa", true)
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
}

export type AcaoInscricao = "pausar" | "retomar" | "cancelar";

const RPC_ACAO: Record<AcaoInscricao, string> = {
  pausar: "pausar_inscricao",
  retomar: "retomar_inscricao",
  cancelar: "cancelar_inscricao",
};

export function useAcaoInscricao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, acao }: { id: string; acao: AcaoInscricao }) =>
      rpc<void>(RPC_ACAO[acao], { p_inscricao_id: id }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: chaveFollowup }),
  });
}

export function useInscreverLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cadenciaId, leadId }: { cadenciaId: string; leadId: string }) =>
      rpc<string>("inscrever_lead", { p_cadencia_id: cadenciaId, p_lead_id: leadId }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: chaveFollowup }),
  });
}

// ── Campanhas ───────────────────────────────────────────────────────────

/** Teto de leads por campanha (o mesmo de `criar_campanha`). */
export const LIMITE_LEADS_CAMPANHA = 20_000;

export function useCampanhas() {
  return useQuery({
    queryKey: [...chaveFollowup, "campanhas"],
    ...TENTATIVAS,
    queryFn: async (): Promise<Campanha[]> => {
      const { data, error } = await tabela("cadencias")
        .select("id, nome, ativa, criado_em")
        .eq("gatilho", "campanha")
        .order("criado_em", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Campanha[];
    },
  });
}

export function useProgressoCadencia(cadenciaId: string | null) {
  return useQuery({
    queryKey: [...chaveFollowup, "progresso", cadenciaId],
    ...TENTATIVAS,
    enabled: !!cadenciaId,
    refetchInterval: 10_000,
    queryFn: async (): Promise<ProgressoCadencia> => {
      const linhas = await rpc<Record<string, unknown>[] | null>("progresso_cadencia", {
        p_cadencia_id: cadenciaId,
      });
      const l = linhas?.[0] ?? {};
      return {
        total: num(l.total),
        aguardando: num(l.aguardando),
        na_fila: num(l.na_fila),
        enviados: num(l.enviados),
        pulados: num(l.pulados),
        erros: num(l.erros),
        concluidos: num(l.concluidos),
      };
    },
  });
}

export function useMotivosCadencia(cadenciaId: string | null) {
  return useQuery({
    queryKey: [...chaveFollowup, "motivos", cadenciaId],
    ...TENTATIVAS,
    enabled: !!cadenciaId,
    refetchInterval: 10_000,
    queryFn: async (): Promise<MotivoCadencia[]> =>
      (
        (await rpc<Record<string, unknown>[] | null>("motivos_cadencia", {
          p_cadencia_id: cadenciaId,
        })) ?? []
      ).map((l) => ({ motivo: String(l.motivo ?? ""), quantidade: num(l.quantidade) })),
  });
}

export async function criarCampanha(p: {
  nome: string;
  template: string;
  leadIds: string[];
  instanceId: string | null;
  midia: MidiaEtapa | null;
}): Promise<string> {
  return rpc<string>("criar_campanha", {
    p_nome: p.nome,
    p_template: p.template,
    p_lead_ids: p.leadIds,
    p_instance_id: p.instanceId,
    p_midia: p.midia,
  });
}

export function useCancelarCampanha() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rpc<void>("cancelar_campanha", { p_cadencia_id: id }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: chaveFollowup }),
  });
}
