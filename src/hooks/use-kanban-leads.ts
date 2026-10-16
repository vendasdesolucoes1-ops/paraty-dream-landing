// Consultas do quadro do CRM, paginadas por coluna, e a aplicação de mudanças
// (arrasto otimista e eventos realtime) direto no cache do React Query.
//
// Antes o quadro lia a tabela inteira numa consulta só. O PostgREST corta em
// 1.000 linhas, então acima disso leads sumiam em silêncio; e cada evento
// realtime recarregava tudo. Agora cada etapa traz 50 por vez, a contagem de
// cada etapa vem do banco e um evento mexe só no registro que mudou.

import { useEffect } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { LEAD_ORIGEM_OPTIONS, LEAD_STATUS_COLUMNS, type Lead, type LeadStatus } from "@/lib/types";
import {
  TAMANHO_PAGINA_KANBAN,
  aplicarLeadNaColuna,
  ajustarContagens,
  etapaContada,
  filtrosDeBusca,
  procurarNaColuna,
  totalCarregado,
  type ColunaKanban,
  type ContagensKanban,
  type FiltrosKanban,
  type PaginaKanban,
} from "@/lib/kanban-leads";

/**
 * Todas começam com "leads": as telas que já fazem
 * `invalidateQueries({ queryKey: ["leads"] })` depois de salvar continuam
 * atualizando o quadro sem saber dele.
 */
export const chavesKanban = {
  colunas: ["leads", "kanban", "coluna"] as const,
  coluna: (status: LeadStatus, filtros: FiltrosKanban) =>
    ["leads", "kanban", "coluna", status, filtros] as const,
  contagensTodas: ["leads", "kanban", "contagens"] as const,
  contagens: (filtros: FiltrosKanban) => ["leads", "kanban", "contagens", filtros] as const,
  resumoTodos: ["leads", "kanban", "resumo"] as const,
  resumo: (vendedorId: string | null, mostrarTestes: boolean) =>
    ["leads", "kanban", "resumo", vendedorId, mostrarTestes] as const,
  fichaTodas: ["leads", "ficha"] as const,
  ficha: (id: string | null) => ["leads", "ficha", id] as const,
};

/** O pedaço da API de filtro do supabase-js que os filtros do quadro usam. */
interface ConsultaFiltravel<Q> {
  eq(coluna: string, valor: string | boolean): Q;
  is(coluna: string, valor: null): Q;
  or(filtros: string): Q;
}

/** Os mesmos filtros para a lista de uma coluna e para as contagens. */
function aplicarFiltros<Q extends ConsultaFiltravel<Q>>(consulta: Q, filtros: FiltrosKanban): Q {
  let q = consulta.is("deletado_em", null);
  if (filtros.vendedorId) q = q.eq("vendedor_id", filtros.vendedorId);
  if (!filtros.mostrarTestes) q = q.eq("is_teste", false);
  if (filtros.origem) q = q.eq("origem", filtros.origem);
  const busca = filtrosDeBusca(filtros.termo);
  if (busca) q = q.or(busca);
  return q;
}

function consultaDeContagem() {
  return supabase.from("leads").select("id", { count: "exact", head: true });
}

/** Conta no banco (sem trazer linhas) os leads que casam com a consulta montada. */
async function contar(
  montar: (
    q: ReturnType<typeof consultaDeContagem>,
  ) => PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number> {
  const { count, error } = await montar(consultaDeContagem());
  if (error) throw error;
  return count ?? 0;
}

/** Uma etapa do quadro, 50 cartões por vez, do mais recente para o mais antigo. */
export function useColunaKanban(status: LeadStatus, filtros: FiltrosKanban, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: chavesKanban.coluna(status, filtros),
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<PaginaKanban> => {
      const { data, error } = await aplicarFiltros(
        supabase.from("leads").select("*").eq("status_crm", status),
        filtros,
      )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(pageParam, pageParam + TAMANHO_PAGINA_KANBAN - 1);
      if (error) throw error;
      const leads = (data ?? []) as Lead[];
      return { leads, temMais: leads.length === TAMANHO_PAGINA_KANBAN };
    },
    // O offset da próxima página é o que já está na tela: as mudanças do
    // realtime entram e saem das páginas carregadas como entram e saem do
    // banco, então a conta continua batendo.
    getNextPageParam: (ultima, paginas) =>
      ultima.temMais ? totalCarregado({ pages: paginas }) : undefined,
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Total de leads de cada etapa com os filtros atuais, contado no banco. */
export function useContagensKanban(filtros: FiltrosKanban, enabled: boolean) {
  return useQuery({
    queryKey: chavesKanban.contagens(filtros),
    queryFn: async (): Promise<ContagensKanban> => {
      const totais = await Promise.all(
        LEAD_STATUS_COLUMNS.map((c) =>
          contar((q) => aplicarFiltros(q.eq("status_crm", c.value), filtros)),
        ),
      );
      return Object.fromEntries(LEAD_STATUS_COLUMNS.map((c, i) => [c.value, totais[i]]));
    },
    placeholderData: keepPreviousData,
    enabled,
  });
}

export interface ResumoKanban {
  /** Leads da carteira depois do filtro de testes, sem busca nem origem. */
  todas: number;
  porOrigem: Record<string, number>;
  /** Leads de teste da carteira, para o chip "Mostrar leads de teste". */
  testes: number;
}

/** Os números dos chips (origens e testes), também contados no banco. */
export function useResumoKanban(
  vendedorId: string | null,
  mostrarTestes: boolean,
  enabled: boolean,
) {
  return useQuery({
    queryKey: chavesKanban.resumo(vendedorId, mostrarTestes),
    queryFn: async (): Promise<ResumoKanban> => {
      const base: FiltrosKanban = { vendedorId, mostrarTestes, origem: null, termo: "" };
      const [todas, testes, ...origens] = await Promise.all([
        contar((q) => aplicarFiltros(q, base)),
        contar((q) => aplicarFiltros(q.eq("is_teste", true), { ...base, mostrarTestes: true })),
        ...LEAD_ORIGEM_OPTIONS.map((o) =>
          contar((q) => aplicarFiltros(q, { ...base, origem: o.value })),
        ),
      ]);
      return {
        todas,
        testes,
        porOrigem: Object.fromEntries(LEAD_ORIGEM_OPTIONS.map((o, i) => [o.value, origens[i]])),
      };
    },
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** O lead já carregado em alguma coluna (de qualquer combinação de filtros). */
function procurarNoCache(queryClient: QueryClient, id: string): Lead | undefined {
  for (const [, coluna] of queryClient.getQueriesData<ColunaKanban>({
    queryKey: chavesKanban.colunas,
  })) {
    const achado = procurarNaColuna(coluna, id);
    if (achado) return achado;
  }
  return queryClient.getQueryData<Lead | null>(chavesKanban.ficha(id)) ?? undefined;
}

/**
 * A ficha aberta no quadro. Busca o lead pelo id porque ele pode não estar em
 * nenhuma página carregada (veio pela URL, está na página 7 da coluna, ou o
 * filtro atual o esconde); enquanto isso mostra o que já houver no cache.
 */
export function useLeadFicha(id: string | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: chavesKanban.ficha(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", id as string)
        .maybeSingle();
      if (error) throw error;
      return (data as Lead | null) ?? null;
    },
    placeholderData: () => (id ? procurarNoCache(queryClient, id) : undefined),
    enabled: !!id,
  });
}

export interface ResultadoAplicacao {
  /** Contagens que não deu para ajustar à mão (versão anterior desconhecida). */
  contagensIncertas: FiltrosKanban[];
  /** A mudança pode ter mexido nos números dos chips de origem/testes. */
  resumoMudou: boolean;
}

/**
 * Aplica no cache a nova versão de um lead (`novo` null quando foi apagado).
 *
 * `anterior` é a versão de antes, quando quem chama sabe (arrasto otimista,
 * INSERT = null). Se não vier, é procurada nas colunas carregadas: o realtime
 * só manda o id em `old`, porque a tabela não tem REPLICA IDENTITY FULL.
 */
export function aplicarLeadNoCache(
  queryClient: QueryClient,
  id: string,
  novo: Lead | null,
  anterior?: Lead | null,
): ResultadoAplicacao {
  const versaoAnterior = anterior === undefined ? procurarNoCache(queryClient, id) : anterior;

  for (const [chave, coluna] of queryClient.getQueriesData<ColunaKanban>({
    queryKey: chavesKanban.colunas,
  })) {
    if (!coluna) continue;
    const status = chave[3] as LeadStatus;
    const filtros = chave[4] as FiltrosKanban;
    const atualizada = aplicarLeadNaColuna(coluna, status, filtros, id, novo);
    if (atualizada !== coluna) queryClient.setQueryData(chave, atualizada);
  }

  const contagensIncertas: FiltrosKanban[] = [];
  for (const [chave, contagens] of queryClient.getQueriesData<ContagensKanban>({
    queryKey: chavesKanban.contagensTodas,
  })) {
    if (!contagens) continue;
    const filtros = chave[3] as FiltrosKanban;
    if (versaoAnterior === undefined) {
      contagensIncertas.push(filtros);
      continue;
    }
    const atualizadas = ajustarContagens(
      contagens,
      etapaContada(versaoAnterior, filtros),
      etapaContada(novo, filtros),
    );
    if (atualizadas !== contagens) queryClient.setQueryData(chave, atualizadas);
  }

  if (novo && queryClient.getQueryData(chavesKanban.ficha(id)) !== undefined) {
    queryClient.setQueryData(chavesKanban.ficha(id), novo);
  }

  const resumoMudou =
    !versaoAnterior ||
    !novo ||
    versaoAnterior.is_teste !== novo.is_teste ||
    versaoAnterior.origem !== novo.origem ||
    versaoAnterior.vendedor_id !== novo.vendedor_id ||
    !!versaoAnterior.deletado_em !== !!novo.deletado_em;

  return { contagensIncertas, resumoMudou };
}

/** Espera os eventos de uma rajada pararem antes de recontar no banco. */
const ESPERA_RECONTAGEM_MS = 800;

/**
 * Escuta `leads` no realtime e aplica cada INSERT/UPDATE/DELETE só no registro
 * alterado. O que não dá para deduzir do evento (contagem de uma etapa que o
 * lead deixou sem estar carregado, números dos chips) é recontado no banco,
 * numa consulta só de contagem, agrupando a rajada de eventos.
 */
export function useLeadsRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const contagensPendentes = new Map<string, FiltrosKanban>();
    let resumoPendente = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function agendarRecontagem() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        for (const filtros of contagensPendentes.values()) {
          queryClient.invalidateQueries({
            queryKey: chavesKanban.contagens(filtros),
            exact: true,
          });
        }
        contagensPendentes.clear();
        if (resumoPendente) {
          resumoPendente = false;
          queryClient.invalidateQueries({ queryKey: chavesKanban.resumoTodos });
        }
      }, ESPERA_RECONTAGEM_MS);
    }

    const channel = supabase
      .channel("leads-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload) => {
        const novo = payload.eventType === "DELETE" ? null : (payload.new as Lead);
        const id = novo?.id ?? (payload.old as { id?: string } | null)?.id;
        if (!id) return;
        const { contagensIncertas, resumoMudou } = aplicarLeadNoCache(
          queryClient,
          id,
          novo,
          payload.eventType === "INSERT" ? null : undefined,
        );
        for (const filtros of contagensIncertas) {
          contagensPendentes.set(JSON.stringify(filtros), filtros);
        }
        if (resumoMudou) resumoPendente = true;
        if (contagensPendentes.size > 0 || resumoPendente) agendarRecontagem();
      })
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
