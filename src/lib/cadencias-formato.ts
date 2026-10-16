// Funções puras das telas de follow-up (cadências, campanhas, regras de envio).
//
// Sem import de "@/": este arquivo é testado direto pelo `node --test`
// (src/lib/cadencias-formato.test.ts), que não resolve o alias do Vite.

// ── Deslocamento (interval do Postgres) ─────────────────────────────────

/** Deslocamento de uma etapa, em partes que o formulário edita. */
export interface Deslocamento {
  dias: number;
  horas: number;
  minutos: number;
}

const UNIDADES_DIAS: Record<string, number> = {
  year: 365,
  years: 365,
  mon: 30,
  mons: 30,
  day: 1,
  days: 1,
};

/**
 * Lê o `interval` como o PostgREST devolve (IntervalStyle "postgres"):
 * "1 day", "-1 days", "3 days 02:00:00", "-1 days +02:00:00", "00:00:00",
 * "-02:30:00". Também aceita o formato que `formatIntervaloPg` grava
 * ("1 day 2 hours"). Texto que não reconhece vira zero.
 */
export function parseIntervalo(texto: string | null | undefined): Deslocamento {
  const saida: Deslocamento = { dias: 0, horas: 0, minutos: 0 };
  if (!texto) return saida;
  const tokens = texto.trim().toLowerCase().split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const relogio = /^([+-]?)(\d+):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(t);
    if (relogio) {
      const sinal = relogio[1] === "-" ? -1 : 1;
      saida.horas += sinal * Number(relogio[2]);
      saida.minutos += sinal * Number(relogio[3]);
      continue;
    }
    const n = Number(t);
    const unidade = tokens[i + 1];
    if (!Number.isFinite(n) || !unidade) continue;
    if (unidade in UNIDADES_DIAS) {
      saida.dias += n * UNIDADES_DIAS[unidade];
      i++;
    } else if (unidade === "hour" || unidade === "hours") {
      saida.horas += n;
      i++;
    } else if (unidade.startsWith("min")) {
      saida.minutos += n;
      i++;
    }
  }
  return saida;
}

/** Deslocamento → texto que o Postgres aceita como interval ("1 day 2 hours", "-1 day", "0"). */
export function formatIntervaloPg(d: Deslocamento): string {
  const partes: string[] = [];
  if (d.dias) partes.push(`${d.dias} ${Math.abs(d.dias) === 1 ? "day" : "days"}`);
  if (d.horas) partes.push(`${d.horas} ${Math.abs(d.horas) === 1 ? "hour" : "hours"}`);
  if (d.minutos) partes.push(`${d.minutos} ${Math.abs(d.minutos) === 1 ? "minute" : "minutes"}`);
  return partes.length > 0 ? partes.join(" ") : "0";
}

export type ReferenciaEtapa = "inscricao" | "anterior" | "visita";

const REFERENCIA_TEXTO: Record<ReferenciaEtapa, string> = {
  inscricao: "da inscrição",
  anterior: "do envio anterior",
  visita: "da visita",
};

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

/**
 * Quando a etapa sai, em uma frase: "1 dia depois do envio anterior",
 * "1 dia antes da visita, às 10:00", "no momento da inscrição".
 */
export function descreverDeslocamento(
  d: Deslocamento,
  referencia: ReferenciaEtapa,
  horaFixa?: string | null,
): string {
  const totalMin = d.dias * 1440 + d.horas * 60 + d.minutos;
  const abs = Math.abs(totalMin);
  const dias = Math.floor(abs / 1440);
  const horas = Math.floor((abs % 1440) / 60);
  const minutos = abs % 60;
  const pedacos = [
    dias ? plural(dias, "dia", "dias") : "",
    horas ? `${horas} h` : "",
    minutos ? `${minutos} min` : "",
  ].filter(Boolean);
  const ref = REFERENCIA_TEXTO[referencia];
  const base =
    totalMin === 0
      ? referencia === "visita"
        ? "no dia da visita"
        : `no momento ${ref}`
      : `${pedacos.join(" e ")} ${totalMin < 0 ? "antes" : "depois"} ${ref}`;
  const hora = horaFixa ? horaFixa.slice(0, 5) : null;
  return hora ? `${base}, às ${hora}` : base;
}

// ── Template ────────────────────────────────────────────────────────────

export const VARIAVEIS_TEMPLATE = ["primeiro_nome", "data_visita", "hora_visita"] as const;

export const EXEMPLO_TEMPLATE: Record<(typeof VARIAVEIS_TEMPLATE)[number], string> = {
  primeiro_nome: "Maria",
  data_visita: "24/10",
  hora_visita: "15h",
};

/** Partes do template, como o banco separa: por `||`, sem espaços nas pontas e sem partes vazias. */
export function partesDoTemplate(template: string): string[] {
  return template
    .split("||")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Prévia do que o lead recebe, com valores de exemplo. Segue o
 * `renderizar_template` do banco: o espaço antes de {{primeiro_nome}} some
 * junto quando o nome não serve ("Oi {{primeiro_nome}}!" → "Oi!").
 */
export function previewTemplate(
  template: string,
  valores: Partial<Record<(typeof VARIAVEIS_TEMPLATE)[number], string>> = EXEMPLO_TEMPLATE,
): string[] {
  const nome = valores.primeiro_nome;
  let texto = template.replace(/\s*\{\{primeiro_nome\}\}/g, nome ? ` ${nome}` : "");
  texto = texto.replace(/\{\{data_visita\}\}/g, valores.data_visita ?? "{{data_visita}}");
  texto = texto.replace(/\{\{hora_visita\}\}/g, valores.hora_visita ?? "{{hora_visita}}");
  return partesDoTemplate(texto);
}

/** Variáveis escritas no template que o banco não conhece (ex.: {{nome}}). */
export function variaveisDesconhecidas(template: string): string[] {
  const conhecidas = new Set<string>(VARIAVEIS_TEMPLATE);
  const achadas = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) {
    if (!conhecidas.has(m[1])) achadas.add(m[1]);
  }
  return [...achadas];
}

// ── Limites de envio ────────────────────────────────────────────────────

/** Dia corrente em Brasília, "AAAA-MM-DD" (o mesmo dia que o banco usa para a cota). */
export function diaEmSaoPaulo(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

function diasEntre(inicio: string, fim: string): number {
  const ms = Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * Limite do dia para uma instância, com a rampa de aquecimento: mesma conta de
 * `limite_diario_instancia()` no banco (divisão inteira, como no SQL).
 */
export function limiteDoDia(p: {
  limiteInstancia: number | null;
  limiteRegra: number;
  aquecimentoInicio: string | null;
  aquecimentoDias: number;
  aquecimentoInicial: number;
  hoje: string;
}): number {
  const limite = p.limiteInstancia ?? p.limiteRegra;
  if (!p.aquecimentoInicio || p.aquecimentoDias === 0) return limite;
  const dias = diasEntre(p.aquecimentoInicio, p.hoje);
  if (dias >= p.aquecimentoDias) return limite;
  const rampa =
    p.aquecimentoInicial +
    Math.trunc(((limite - p.aquecimentoInicial) * Math.max(dias, 0)) / p.aquecimentoDias);
  return Math.min(limite, rampa);
}

// ── Motivos ─────────────────────────────────────────────────────────────

const MOTIVOS: Record<string, string> = {
  opt_out: "Pediu para não receber",
  sem_interesse: "Sem interesse",
  convertido: "Já é cliente",
  takeover: "Atendimento humano em curso",
  sem_base_legal: "Sem base legal para contato",
  fora_da_janela: "Fora do horário de envio",
  limite_diario: "Limite diário da instância",
  regras_indisponiveis: "Regras de envio indisponíveis",
  limite_tentativas_sem_resposta: "Limite de tentativas sem resposta",
  sem_telefone_ou_texto: "Sem telefone ou etapa sem conteúdo",
  lead_inexistente: "Lead excluído",
};

/** Motivo técnico ("limite_diario") → frase da tela. Texto livre passa como veio. */
export function rotuloMotivo(motivo: string | null | undefined): string {
  if (!motivo) return "—";
  const conhecido = MOTIVOS[motivo];
  if (conhecido) return conhecido;
  const texto = motivo.replace(/_/g, " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
