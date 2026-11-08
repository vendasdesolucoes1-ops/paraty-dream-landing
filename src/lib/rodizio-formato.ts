// Regras puras da tela Rodízio (sem Supabase, para rodar nos testes do Node).

import type { Tone } from "@/components/ds/pill";

/** Como a fila enxerga o vendedor (mesmo critério de rodizio_painel no banco). */
export type SituacaoRodizio = "na_fila" | "limite" | "pausado" | "sem_telefone" | "inativo";

export type LoginVendedor = "ativo" | "desativado" | "excluido" | "sem_login";

export type OrigemAtribuicao = "rodizio" | "distribuicao" | "manual" | "remocao" | "sistema";

export interface VendedorRodizio {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  no_rodizio: boolean;
  limite_diario: number | null;
  tem_telefone: boolean;
  situacao: SituacaoRodizio;
  /** Posição na vez (1 = próximo); só para quem está na fila. */
  vez: number | null;
  hoje: number;
  total: number;
  ultima: string | null;
  carteira_aberta: number;
  login: LoginVendedor;
  papel: string | null;
}

export interface PainelRodizio {
  ativo: boolean;
  em_espera: number;
  hoje: number;
  total: number;
  vendedores: VendedorRodizio[];
}

export interface Atribuicao {
  id: number;
  criado_em: string;
  origem: OrigemAtribuicao;
  lead_id: string | null;
  lead_nome: string | null;
  vendedor_id: string;
  vendedor_nome: string;
  autor_nome: string | null;
}

export interface ResultadoDistribuicao {
  confirmado: boolean;
  em_espera: number;
  distribuidos: number;
  continuam_em_espera: number;
  por_vendedor: { vendedor_id: string; nome: string; quantidade: number }[];
}

export const SITUACAO: Record<SituacaoRodizio, { rotulo: string; tom: Tone; dica: string }> = {
  na_fila: {
    rotulo: "Na fila",
    tom: "success",
    dica: "Recebe o próximo lead quando chegar a vez.",
  },
  limite: {
    rotulo: "Limite do dia",
    tom: "warning",
    dica: "Já recebeu o máximo de hoje. Volta para a fila à meia-noite.",
  },
  pausado: { rotulo: "Pausado", tom: "neutral", dica: "Fora da fila. Continua com a carteira." },
  sem_telefone: {
    rotulo: "Sem WhatsApp",
    tom: "danger",
    dica: "Sem telefone não chega o aviso do lead novo: fica fora da fila.",
  },
  inativo: {
    rotulo: "Inativo",
    tom: "neutral",
    dica: "Vendedor desativado. Não recebe leads.",
  },
};

export const ORIGEM: Record<OrigemAtribuicao, { rotulo: string; tom: Tone }> = {
  rodizio: { rotulo: "Rodízio", tom: "success" },
  distribuicao: { rotulo: "Distribuição", tom: "info" },
  manual: { rotulo: "Entrega manual", tom: "accent" },
  remocao: { rotulo: "Removido", tom: "neutral" },
  sistema: { rotulo: "Sistema", tom: "neutral" },
};

/**
 * Telefone para gravar no vendedor: só dígitos, com 55. Devolve null para
 * vazio e "invalido" quando não dá um número de celular/fixo brasileiro.
 */
export function normalizarTelefone(valor: string): string | null | "invalido" {
  const d = valor.replace(/\D/g, "");
  if (!d) return null;
  const com55 = d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
  return com55.length === 12 || com55.length === 13 ? com55 : "invalido";
}

/** Limite digitado → número válido (1 a 500), null (sem limite) ou "invalido". */
export function lerLimite(valor: string): number | null | "invalido" {
  const t = valor.trim();
  if (!t) return null;
  if (!/^\d+$/.test(t)) return "invalido";
  const n = Number(t);
  return n >= 1 && n <= 500 ? n : "invalido";
}

/** Pode voltar a ser vendedor ativo pela tela? Só se o login não foi desligado. */
export function podeReativar(v: Pick<VendedorRodizio, "ativo" | "login">): boolean {
  return !v.ativo && (v.login === "ativo" || v.login === "sem_login");
}

/** Por que a fila está parada (ou null se está andando). */
export function motivoFilaParada(p: Pick<PainelRodizio, "ativo" | "vendedores">): string | null {
  if (!p.ativo) return "O rodízio está desligado: os leads novos entram sem vendedor.";
  const naFila = p.vendedores.filter((v) => v.situacao === "na_fila").length;
  if (naFila > 0) return null;
  if (p.vendedores.some((v) => v.situacao === "limite")) {
    return "Todos da fila bateram o limite de hoje: os próximos leads entram sem vendedor.";
  }
  return "Ninguém na fila: os leads novos entram sem vendedor. Coloque pelo menos um vendedor com WhatsApp.";
}

export function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;
}
