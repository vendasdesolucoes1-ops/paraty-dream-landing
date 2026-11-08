// Dados da tela Rodízio. As RPCs são novas e ainda não estão nos tipos
// gerados do Supabase: as chamadas passam por um rpc solto, como em
// rodizio/equipe.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Atribuicao, PainelRodizio, ResultadoDistribuicao } from "@/lib/rodizio-formato";

type RpcSolta = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcSolta;

export const CHAVE_PAINEL = ["rodizio-painel"];
export const CHAVE_HISTORICO = ["rodizio-historico"];
export const CHAVE_CONSULTOR = "consultor_responsavel";

async function chamar<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export function usePainelRodizio() {
  return useQuery({
    queryKey: CHAVE_PAINEL,
    queryFn: () => chamar<PainelRodizio>("rodizio_painel"),
    refetchInterval: 60_000,
  });
}

export function useHistoricoRodizio(limite = 50) {
  return useQuery({
    queryKey: [...CHAVE_HISTORICO, limite],
    queryFn: () => chamar<Atribuicao[]>("rodizio_historico", { p_limite: limite }),
    refetchInterval: 60_000,
  });
}

/** Invalida tudo o que a tela e o CRM mostram depois de uma mudança na fila. */
function useRecarregar() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: CHAVE_PAINEL });
    void qc.invalidateQueries({ queryKey: CHAVE_HISTORICO });
    void qc.invalidateQueries({ queryKey: ["vendedores-todos"] });
    void qc.invalidateQueries({ queryKey: ["leads"] });
  };
}

export function useLigarRodizio() {
  const recarregar = useRecarregar();
  return useMutation({
    mutationFn: (ativo: boolean) => chamar<boolean>("rodizio_ligar", { p_ativo: ativo }),
    onSuccess: (ativo) => {
      recarregar();
      toast.success(
        ativo
          ? "Rodízio ligado. Cada lead novo vai para o próximo da fila."
          : "Rodízio desligado. Os próximos leads entram sem vendedor.",
      );
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível mudar o rodízio."),
  });
}

export function useMoverNaFila() {
  const recarregar = useRecarregar();
  return useMutation({
    mutationFn: ({ id, direcao }: { id: string; direcao: -1 | 1 }) =>
      chamar<void>("rodizio_mover", { p_vendedor_id: id, p_direcao: direcao }),
    onSuccess: recarregar,
    onError: (e: Error) => toast.error(e.message || "Não foi possível mudar a ordem."),
  });
}

export interface MudancaVendedor {
  no_rodizio?: boolean;
  ativo?: boolean;
  limite_diario?: number | null;
  telefone?: string | null;
}

export function useAtualizarVendedor() {
  const recarregar = useRecarregar();
  return useMutation({
    mutationFn: async ({ id, mudanca }: { id: string; mudanca: MudancaVendedor }) => {
      // `no_rodizio` e `limite_diario` ainda não estão nos tipos gerados.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vendedores")
        .update(mudanca)
        .eq("id", id)
        .select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error("Sem permissão para alterar este vendedor.");
    },
    onSuccess: recarregar,
    onError: (e: Error) => toast.error(e.message || "Não foi possível salvar o vendedor."),
  });
}

export function useDistribuirEspera() {
  const recarregar = useRecarregar();
  return useMutation({
    mutationFn: (confirmar: boolean) =>
      chamar<ResultadoDistribuicao>("rodizio_distribuir_espera", { p_confirmar: confirmar }),
    onSuccess: (r) => {
      if (!r.confirmado) return;
      recarregar();
      toast.success(
        r.distribuidos > 0
          ? `${r.distribuidos} ${r.distribuidos === 1 ? "lead distribuído" : "leads distribuídos"}. Cada vendedor foi avisado no sino.`
          : "Nenhum lead foi distribuído: não há vaga na fila.",
      );
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível distribuir os leads."),
  });
}

// ---------------------------------------------------------------------------
// Consultor responsável (plano B da Sophia)

export interface ConsultorResponsavel {
  vendedor_id: string | null;
  nome: string;
  telefone: string;
}

function lerConsultor(valor: string | null | undefined): ConsultorResponsavel | null {
  if (!valor) return null;
  try {
    const c = JSON.parse(valor) as Partial<ConsultorResponsavel>;
    if (!c?.nome?.trim()) return null;
    return {
      vendedor_id: c.vendedor_id ?? null,
      nome: c.nome.trim(),
      telefone: String(c.telefone ?? "").replace(/\D/g, ""),
    };
  } catch {
    return null;
  }
}

export function useConsultorResponsavel() {
  return useQuery({
    queryKey: ["configuracao", CHAVE_CONSULTOR],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracoes")
        .select("valor")
        .eq("chave", CHAVE_CONSULTOR)
        .maybeSingle();
      if (error) throw error;
      return lerConsultor(data?.valor);
    },
  });
}

/** O que ainda impede ligar a Sophia (vazio = pode ligar; null = não se sabe). */
export function usePendenciasIa() {
  return useQuery({
    queryKey: ["pendencias-ativar-ia"],
    queryFn: async () => {
      const { data, error } = await rpc("pendencias_ativar_ia");
      // Banco sem a trava (ambiente antigo): não há o que mostrar.
      if (error) return null;
      return (data as string[] | null) ?? [];
    },
  });
}

export function useSalvarConsultor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: ConsultorResponsavel) => {
      const { error } = await supabase
        .from("configuracoes")
        .upsert({ chave: CHAVE_CONSULTOR, valor: JSON.stringify(c) }, { onConflict: "chave" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["configuracao", CHAVE_CONSULTOR] });
      void qc.invalidateQueries({ queryKey: ["pendencias-ativar-ia"] });
      toast.success("Consultor responsável salvo.");
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível salvar o consultor."),
  });
}
