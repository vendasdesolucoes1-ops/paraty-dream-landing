// Janelas de horário de visita e conferência contra a agenda do vendedor
// (issue #56).
//
// Antes a Sophia confirmava qualquer horário que o lead aceitasse — domingo às
// 20h, ou em cima de outra visita do mesmo vendedor. Agora a gestão define no
// painel (configuracoes.janelas_visita) em que dias e horários há visita, e a
// visita fora da janela ou em conflito entra como "a_confirmar".
//
// Lógica pura: sem Supabase nem Deno, para rodar nos testes com node --test.

export const CHAVE_JANELAS_VISITA = "janelas_visita";

/** Status da visita que ainda depende de um humano confirmar o horário. */
export const STATUS_A_CONFIRMAR = "a_confirmar";

/**
 * O que a Sophia diz ao lead quando o horário pedido não pôde ser confirmado
 * automaticamente. Substitui a confirmação que o modelo escreveu: o lead não
 * pode sair da conversa achando que tem visita marcada.
 */
export const MENSAGEM_VISITA_A_CONFIRMAR =
  "Anotei o horário que você pediu! || Só preciso confirmar a agenda com o consultor antes de fechar. || Já te retorno por aqui, combinado?";

export interface DiaJanela {
  /** 0 = domingo … 6 = sábado (mesma convenção de Date.getDay). */
  dia: number;
  /** "HH:mm" no fuso da configuração. */
  inicio: string;
  fim: string;
}

export interface JanelasVisita {
  dias: DiaJanela[];
  /** Duração de uma visita, usada na janela (início + duração ≤ fim) e no conflito de agenda. */
  duracao_min: number;
  fuso: string;
}

export const JANELAS_VISITA_PADRAO: JanelasVisita = {
  dias: [
    { dia: 1, inicio: "09:00", fim: "17:00" },
    { dia: 2, inicio: "09:00", fim: "17:00" },
    { dia: 3, inicio: "09:00", fim: "17:00" },
    { dia: 4, inicio: "09:00", fim: "17:00" },
    { dia: 5, inicio: "09:00", fim: "17:00" },
    { dia: 6, inicio: "09:00", fim: "16:00" },
  ],
  duracao_min: 60,
  fuso: "America/Sao_Paulo",
};

export const NOMES_DIAS = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
] as const;

const DURACAO_MIN = 15;
const DURACAO_MAX = 8 * 60;

/** "09:30" → 570. null se não for um horário válido. */
export function minutosDoHorario(hhmm: unknown): number | null {
  if (typeof hhmm !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function fusoValido(fuso: unknown): fuso is string {
  if (typeof fuso !== "string" || !fuso.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

/**
 * Lê o valor salvo em configuracoes. Nunca lança: JSON quebrado ou ausente cai
 * no padrão; entradas inválidas são descartadas uma a uma. Uma lista de dias
 * vazia é respeitada — significa "nenhuma visita é confirmada sozinha".
 */
export function lerJanelasVisita(valor: unknown): JanelasVisita {
  let bruto: unknown = valor;
  if (typeof valor === "string") {
    try {
      bruto = JSON.parse(valor);
    } catch {
      return JANELAS_VISITA_PADRAO;
    }
  }
  if (!bruto || typeof bruto !== "object" || !Array.isArray((bruto as JanelasVisita).dias)) {
    return JANELAS_VISITA_PADRAO;
  }
  const obj = bruto as { dias: unknown[]; duracao_min?: unknown; fuso?: unknown };

  const dias: DiaJanela[] = [];
  for (const d of obj.dias) {
    if (!d || typeof d !== "object") continue;
    const { dia, inicio, fim } = d as Record<string, unknown>;
    const ini = minutosDoHorario(inicio);
    const fi = minutosDoHorario(fim);
    if (!Number.isInteger(dia) || (dia as number) < 0 || (dia as number) > 6) continue;
    if (ini === null || fi === null || ini >= fi) continue;
    dias.push({ dia: dia as number, inicio: String(inicio).trim(), fim: String(fim).trim() });
  }
  dias.sort((a, b) => a.dia - b.dia || minutosDoHorario(a.inicio)! - minutosDoHorario(b.inicio)!);

  const duracao = Number(obj.duracao_min);
  return {
    dias,
    duracao_min:
      Number.isFinite(duracao) && duracao >= DURACAO_MIN && duracao <= DURACAO_MAX
        ? Math.round(duracao)
        : JANELAS_VISITA_PADRAO.duracao_min,
    fuso: fusoValido(obj.fuso) ? obj.fuso : JANELAS_VISITA_PADRAO.fuso,
  };
}

/** "sábado das 09:00 às 16:00; segunda das 09:00 às 17:00" — para o prompt. */
export function descreverJanelas(janelas: JanelasVisita): string {
  if (janelas.dias.length === 0) return "nenhum horário fixo cadastrado";
  return janelas.dias.map((d) => `${NOMES_DIAS[d.dia]} das ${d.inicio} às ${d.fim}`).join("; ");
}

/** Dia da semana (0–6) e minutos desde a meia-noite de um instante, no fuso dado. */
export function partesNoFuso(momento: Date, fuso: string): { dia: number; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(momento);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(valor("weekday"));
  return { dia, minutos: Number(valor("hour")) * 60 + Number(valor("minute")) };
}

/** true se a visita inteira (início + duração) cabe numa das janelas do dia. */
export function dentroDaJanela(momento: Date, janelas: JanelasVisita): boolean {
  const { dia, minutos } = partesNoFuso(momento, janelas.fuso);
  return janelas.dias.some((d) => {
    if (d.dia !== dia) return false;
    const ini = minutosDoHorario(d.inicio);
    const fim = minutosDoHorario(d.fim);
    return ini !== null && fim !== null && minutos >= ini && minutos + janelas.duracao_min <= fim;
  });
}

/**
 * true se a visita pedida se sobrepõe a alguma já marcada para o mesmo
 * vendedor. Duas visitas de `duracaoMin` se sobrepõem quando os inícios estão a
 * menos de `duracaoMin` um do outro; encostadas (fim de uma = início da outra)
 * não conflitam.
 */
export function conflitaComAgenda(momento: Date, ocupados: Date[], duracaoMin: number): boolean {
  const duracaoMs = duracaoMin * 60_000;
  return ocupados.some((o) => Math.abs(o.getTime() - momento.getTime()) < duracaoMs);
}

export type MotivoAConfirmar = "fora_da_janela" | "conflito_agenda";

/**
 * Decide se o horário pode ser confirmado automaticamente. null = pode
 * (comportamento de sempre); senão, o motivo pelo qual a visita fica a confirmar.
 */
export function avaliarHorarioVisita(
  momento: Date,
  janelas: JanelasVisita,
  ocupados: Date[],
): MotivoAConfirmar | null {
  if (!dentroDaJanela(momento, janelas)) return "fora_da_janela";
  if (conflitaComAgenda(momento, ocupados, janelas.duracao_min)) return "conflito_agenda";
  return null;
}
