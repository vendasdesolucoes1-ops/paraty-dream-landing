// Regras puras do quadro do CRM: quais leads pertencem a cada coluna e como um
// evento realtime de `leads` é aplicado no cache paginado sem recarregar tudo.
//
// Só há imports de tipo aqui de propósito: assim o arquivo roda direto no
// `node --test` (ver kanban-leads.test.ts), sem bundler nem alias "@/".

import type { InfiniteData } from "@tanstack/react-query";
import type { Lead, LeadStatus } from "@/lib/types";

/** Quantos cartões cada coluna traz por vez. */
export const TAMANHO_PAGINA_KANBAN = 50;

/** Filtros do quadro que vão para o banco. Fazem parte da chave das consultas. */
export interface FiltrosKanban {
  /** Carteira do vendedor; null quando gestor/admin vê todos. */
  vendedorId: string | null;
  mostrarTestes: boolean;
  /** Origem escolhida no chip; null é "todas". */
  origem: string | null;
  /** Texto da busca já limpo por `limparTermoBusca`; "" é sem busca. */
  termo: string;
}

export interface PaginaKanban {
  leads: Lead[];
  /** A página veio cheia: pode haver mais leads depois dela no banco. */
  temMais: boolean;
}

export type ColunaKanban = InfiniteData<PaginaKanban, number>;

/** O que basta para ler uma coluna (o tipo do pageParam não importa aqui). */
type PaginasKanban = Pick<ColunaKanban, "pages">;

export type ContagensKanban = Partial<Record<LeadStatus, number>>;

/**
 * Tira da busca os caracteres que têm significado na sintaxe do filtro .or()
 * do PostgREST (vírgula, parênteses, curingas). O resto vai como digitado.
 */
export function limparTermoBusca(busca: string): string {
  return busca
    .replace(/[,()*%\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Minúsculas e sem acento, como a coluna `leads.busca` (função sem_acento do banco). */
export function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Os filtros de busca no formato do .or() do PostgREST; null quando não há
 * busca. Nome, cidade e e-mail vão pela coluna `busca`, sem acento.
 */
export function filtrosDeBusca(termo: string): string | null {
  if (!termo) return null;
  const filtros = [`busca.ilike.%${semAcento(termo)}%`];
  const digitos = termo.replace(/\D/g, "");
  if (digitos.length >= 3) filtros.push(`telefone.ilike.%${digitos}%`);
  return filtros.join(",");
}

/**
 * O mesmo filtro do banco, avaliado no navegador, para decidir se um registro
 * que chegou pelo realtime entra numa coluna já carregada. A busca imita o
 * `ilike` sobre a coluna `busca`: sem diferença de caixa nem de acento.
 */
export function leadCasaComFiltros(lead: Lead, filtros: FiltrosKanban): boolean {
  if (lead.deletado_em) return false;
  if (filtros.vendedorId && lead.vendedor_id !== filtros.vendedorId) return false;
  if (!filtros.mostrarTestes && lead.is_teste) return false;
  if (filtros.origem && lead.origem !== filtros.origem) return false;
  if (filtros.termo) {
    const termo = semAcento(filtros.termo);
    const digitos = filtros.termo.replace(/\D/g, "");
    const bate =
      semAcento(`${lead.nome ?? ""} ${lead.cidade ?? ""} ${lead.email ?? ""}`).includes(termo) ||
      (digitos.length >= 3 && (lead.telefone ?? "").includes(digitos));
    if (!bate) return false;
  }
  return true;
}

/** Ordem das colunas: mais recente primeiro, com o id desempatando (igual ao banco). */
export function compararRecentes(a: Lead, b: Lead): number {
  const ta = Date.parse(a.created_at);
  const tb = Date.parse(b.created_at);
  if (ta !== tb) return tb - ta;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Quantos cartões a coluna já tem carregados — é o offset da próxima página. */
export function totalCarregado(coluna: PaginasKanban | undefined): number {
  return (coluna?.pages ?? []).reduce((soma, p) => soma + p.leads.length, 0);
}

/** Cartões da coluna em lista única, sem repetir id (páginas podem se sobrepor). */
export function leadsDaColuna(coluna: PaginasKanban | undefined): Lead[] {
  const vistos = new Set<string>();
  const lista: Lead[] = [];
  for (const pagina of coluna?.pages ?? []) {
    for (const lead of pagina.leads) {
      if (vistos.has(lead.id)) continue;
      vistos.add(lead.id);
      lista.push(lead);
    }
  }
  return lista;
}

export function procurarNaColuna(coluna: PaginasKanban | undefined, id: string): Lead | undefined {
  for (const pagina of coluna?.pages ?? []) {
    const achado = pagina.leads.find((l) => l.id === id);
    if (achado) return achado;
  }
  return undefined;
}

function removerDaColuna(coluna: ColunaKanban, id: string): ColunaKanban {
  if (!procurarNaColuna(coluna, id)) return coluna;
  return {
    ...coluna,
    pages: coluna.pages.map((p) =>
      p.leads.some((l) => l.id === id) ? { ...p, leads: p.leads.filter((l) => l.id !== id) } : p,
    ),
  };
}

function inserirNaColuna(coluna: ColunaKanban, lead: Lead): ColunaKanban {
  const pages = coluna.pages;
  for (let i = 0; i < pages.length; i++) {
    const pos = pages[i].leads.findIndex((l) => compararRecentes(lead, l) < 0);
    if (pos === -1) continue;
    const leads = [...pages[i].leads];
    leads.splice(pos, 0, lead);
    return { ...coluna, pages: pages.map((p, k) => (k === i ? { ...p, leads } : p)) };
  }
  // Mais antigo que tudo o que está carregado. Se ainda há páginas no banco,
  // ele vem quando a pessoa pedir mais; se não há, entra no fim.
  const ultima = pages[pages.length - 1];
  if (!ultima || ultima.temMais) return coluna;
  return {
    ...coluna,
    pages: pages.map((p, k) => (k === pages.length - 1 ? { ...p, leads: [...p.leads, lead] } : p)),
  };
}

/**
 * Aplica um lead (ou a remoção dele, com `lead` null) numa coluna carregada.
 * Fica onde estava se já está ali, entra na posição certa se passou a
 * pertencer, sai se deixou de pertencer. Devolve a mesma referência quando
 * nada muda, para o React Query não re-renderizar à toa.
 */
export function aplicarLeadNaColuna(
  coluna: ColunaKanban,
  status: LeadStatus,
  filtros: FiltrosKanban,
  id: string,
  lead: Lead | null,
): ColunaKanban {
  const pertence = !!lead && lead.status_crm === status && leadCasaComFiltros(lead, filtros);
  if (!pertence || !lead) return removerDaColuna(coluna, id);
  if (procurarNaColuna(coluna, id)) {
    return {
      ...coluna,
      pages: coluna.pages.map((p) =>
        p.leads.some((l) => l.id === id)
          ? { ...p, leads: p.leads.map((l) => (l.id === id ? lead : l)) }
          : p,
      ),
    };
  }
  return inserirNaColuna(coluna, lead);
}

/** Em qual coluna (etapa) o lead conta para esses filtros; null se não conta em nenhuma. */
export function etapaContada(lead: Lead | null, filtros: FiltrosKanban): LeadStatus | null {
  return lead && leadCasaComFiltros(lead, filtros) ? lead.status_crm : null;
}

/** Tira um da etapa de origem e põe um na de destino. Mesma referência se nada muda. */
export function ajustarContagens(
  contagens: ContagensKanban,
  de: LeadStatus | null,
  para: LeadStatus | null,
): ContagensKanban {
  if (de === para) return contagens;
  const nova = { ...contagens };
  if (de) nova[de] = Math.max(0, (nova[de] ?? 0) - 1);
  if (para) nova[para] = (nova[para] ?? 0) + 1;
  return nova;
}
