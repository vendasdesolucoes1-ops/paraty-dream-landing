// Leitura das listas de ações do /insights da Meta.
//
// `actions`, `action_values` e `cost_per_action_type` vêm como
// [{ action_type: "link_click", value: "12" }, ...]. O JSON completo é sempre
// guardado; aqui só extraímos os totais que viram colunas.
//
// ATENÇÃO — evitar contagem dobrada: a Meta devolve o mesmo evento em vários
// action_types (ex.: "lead", "onsite_conversion.lead_grouped" e
// "offsite_conversion.fb_pixel_lead"). Para cada métrica usamos o PRIMEIRO tipo
// da lista de prioridade que existir, nunca a soma de todos.

export interface Acao {
  action_type: string;
  value: string | number;
}

/** Tipos de ação por métrica, em ordem de prioridade. Ajuste aqui se o negócio mudar. */
export const TIPOS_PRINCIPAIS = {
  leads: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"],
  mensagens_iniciadas: [
    "onsite_conversion.messaging_conversation_started_7d",
    "onsite_conversion.total_messaging_connection",
  ],
  cliques_link: ["link_click"],
  compras: ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"],
  // Reserva/agendamento (ex.: visita ao stand) medida pelo pixel.
  reservas: ["schedule_total", "schedule", "offsite_conversion.fb_pixel_schedule"],
} as const;

export function numeroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function inteiroDe(v: unknown): number | null {
  const n = numeroOuNulo(v);
  return n === null ? null : Math.trunc(n);
}

/** Lê uma lista de ações defensivamente: ausente ou malformada vira lista vazia. */
export function listaDeAcoes(v: unknown): Acao[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (a): a is Acao => !!a && typeof a === "object" && typeof (a as Acao).action_type === "string",
  );
}

/** Valor do primeiro tipo da lista de prioridade presente em `acoes`; null se nenhum. */
export function valorPrioritario(acoes: Acao[], tipos: readonly string[]): number | null {
  for (const tipo of tipos) {
    const achada = acoes.find((a) => a.action_type === tipo);
    if (achada) return numeroOuNulo(achada.value);
  }
  return null;
}

export interface AcoesPrincipais {
  leads: number | null;
  mensagens_iniciadas: number | null;
  cliques_link: number | null;
  compras: number | null;
  valor_compras: number | null;
  reservas: number | null;
}

export function extrairPrincipais(actions: unknown, actionValues: unknown): AcoesPrincipais {
  const a = listaDeAcoes(actions);
  const v = listaDeAcoes(actionValues);
  const inteiro = (tipos: readonly string[]) => {
    const n = valorPrioritario(a, tipos);
    return n === null ? null : Math.trunc(n);
  };
  return {
    leads: inteiro(TIPOS_PRINCIPAIS.leads),
    mensagens_iniciadas: inteiro(TIPOS_PRINCIPAIS.mensagens_iniciadas),
    cliques_link: inteiro(TIPOS_PRINCIPAIS.cliques_link),
    compras: inteiro(TIPOS_PRINCIPAIS.compras),
    valor_compras: valorPrioritario(v, TIPOS_PRINCIPAIS.compras),
    reservas: inteiro(TIPOS_PRINCIPAIS.reservas),
  };
}

/**
 * video_p25_watched_actions & cia. vêm como lista de ações (video_view):
 * o total é o valor do primeiro item.
 */
export function totalDeVideo(v: unknown): number | null {
  const lista = listaDeAcoes(v);
  return lista.length > 0 ? inteiroDe(lista[0].value) : null;
}
