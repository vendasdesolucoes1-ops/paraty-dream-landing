// Regras puras da tela Rodízio (sem Supabase, para rodar nos testes do Node).

import type { Tone } from "@/components/ds/pill";

/** Como a fila enxerga o vendedor (mesmo critério de rodizio_painel no banco). */
export type SituacaoRodizio = "na_fila" | "limite" | "pausado" | "sem_telefone" | "inativo";

export type LoginVendedor = "ativo" | "desativado" | "excluido" | "sem_login";

export type OrigemAtribuicao = "rodizio" | "distribuicao" | "manual" | "remocao" | "sistema";

/** Se o WhatsApp do aviso saiu para o vendedor (ver rodizio_historico no banco). */
export type SituacaoWhatsapp =
  | "enviado"
  | "resumo"
  | "pendente"
  | "erro"
  | "cancelado"
  | "proprio"
  | "sem_telefone"
  | "nao_enviado";

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
  /** Nulo em remoção (não há aviso) ou enquanto o banco não tem a coluna. */
  whatsapp_situacao?: SituacaoWhatsapp | null;
  whatsapp_em?: string | null;
  whatsapp_motivo?: string | null;
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

const HORA = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});
const DIA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** "13:57" no mesmo dia da atribuição; "10/11 13:57" em outro dia. */
function quando(em: Date, referencia: Date): string {
  const dia = DIA.format(em);
  return dia === DIA.format(referencia) ? HORA.format(em) : `${dia} ${HORA.format(em)}`;
}

/** "5 min depois", "5 h depois": só quando o aviso demorou a sair. */
function atraso(em: Date, atribuido: Date): string | null {
  const min = Math.round((em.getTime() - atribuido.getTime()) / 60_000);
  if (min < 10) return null;
  if (min < 60) return `${min} min depois`;
  return `${Math.round(min / 60)} h depois`;
}

/** Motivo do banco (avisos_vendedor.erro) em linguagem da equipe. */
const MOTIVO: Record<string, string> = {
  "lead passou para outro vendedor": "o lead mudou de vendedor antes do envio",
  "vendedor inativo ou sem telefone": "vendedor inativo ou sem WhatsApp",
  "lead excluído ou de teste": "o lead foi excluído",
  "expirou na fila": "ficou mais de 24 h na fila",
  "resumo da qualificação já enviado": "a Sophia já mandou o resumo",
};

/**
 * Etiqueta do WhatsApp de uma linha do histórico: se o vendedor foi avisado,
 * quando, e por que não. Nulo quando não se aplica (remoção).
 */
export function descreverWhatsapp(
  a: Pick<Atribuicao, "criado_em" | "whatsapp_situacao" | "whatsapp_em" | "whatsapp_motivo">,
): { rotulo: string; tom: Tone; dica: string } | null {
  const situacao = a.whatsapp_situacao;
  if (!situacao) return null;
  const atribuido = new Date(a.criado_em);
  const em = a.whatsapp_em ? new Date(a.whatsapp_em) : null;
  const motivo = a.whatsapp_motivo ? (MOTIVO[a.whatsapp_motivo] ?? a.whatsapp_motivo) : null;

  switch (situacao) {
    case "enviado":
    case "resumo": {
      const hora = em ? ` às ${quando(em, atribuido)}` : "";
      const demora = em ? atraso(em, atribuido) : null;
      return {
        rotulo: `${situacao === "resumo" ? "Resumo da Sophia" : "WhatsApp enviado"}${hora}${demora ? ` · ${demora}` : ""}`,
        tom: "success",
        dica:
          situacao === "resumo"
            ? "O vendedor recebeu o resumo da qualificação feito pela Sophia, que substitui o aviso."
            : "O vendedor recebeu o aviso do lead no WhatsApp, pelo número da empresa.",
      };
    }
    case "pendente":
      return {
        rotulo: "WhatsApp na fila",
        tom: "info",
        dica: "O aviso sai em até 1 a 2 minutos.",
      };
    case "erro":
      return {
        rotulo: "WhatsApp falhou",
        tom: "danger",
        dica: motivo ? `Não foi enviado: ${motivo}` : "Não foi enviado depois de 3 tentativas.",
      };
    case "cancelado":
      return {
        rotulo: "WhatsApp não enviado",
        tom: "neutral",
        dica: motivo ? `Não foi enviado: ${motivo}.` : "O aviso foi cancelado.",
      };
    case "proprio":
      return {
        rotulo: "Pegou para si",
        tom: "neutral",
        dica: "O próprio vendedor pegou o lead no painel: não há o que avisar.",
      };
    case "sem_telefone":
      return {
        rotulo: "Vendedor sem WhatsApp",
        tom: "warning",
        dica: "Cadastre o WhatsApp do vendedor na fila acima para ele receber os avisos.",
      };
    case "nao_enviado":
      return {
        rotulo: "WhatsApp não enviado",
        tom: "warning",
        dica: "Nenhuma mensagem saiu para o vendedor nesta atribuição.",
      };
  }
}
