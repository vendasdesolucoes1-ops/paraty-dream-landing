// Formatação compartilhada do painel. Um lugar só para número, data, hora e
// telefone: antes cada tela escolhia seu toLocaleString, e a mesma data
// aparecia de três jeitos diferentes conforme a página.

const numero = new Intl.NumberFormat("pt-BR");
const porcento = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });
const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const diaCurto = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const diaSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
const dataLonga = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export const formatNumero = (n: number) => numero.format(n);

/** 0,42 → "42%". Divisão por zero vira "—", nunca "NaN%". */
export function formatPorcento(parte: number, total: number): string {
  if (!total) return "—";
  return porcento.format(parte / total);
}

export const formatHora = (d: Date | string) => hora.format(new Date(d));
export const formatDiaCurto = (d: Date | string) => diaCurto.format(new Date(d));

/** "seg", "ter"… sem o ponto final que o Intl coloca. */
export const formatDiaSemana = (d: Date | string) => diaSemana.format(new Date(d)).replace(".", "");

/** "quarta-feira, 7 de outubro" — primeira letra maiúscula. */
export function formatDataLonga(d: Date | string): string {
  const texto = dataLonga.format(new Date(d));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function inicioDoDia(d = new Date()): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function somarDias(d: Date, dias: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + dias);
  return r;
}

/** "agora", "há 12 min", "há 3 h", "há 5 dias", "há 2 meses". */
export function tempoRelativo(d: Date | string, agora = new Date()): string {
  const ms = agora.getTime() - new Date(d).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.floor(h / 24);
  if (dias === 1) return "há 1 dia";
  if (dias < 60) return `há ${dias} dias`;
  return `há ${Math.floor(dias / 30)} meses`;
}

/** Idade em dias inteiros. */
export function diasDesde(d: Date | string, agora = new Date()): number {
  return Math.floor((agora.getTime() - new Date(d).getTime()) / 86_400_000);
}

/** "Hoje", "Amanhã" ou "qui, 09/10" para agrupar compromissos por dia. */
export function rotuloDia(d: Date | string, agora = new Date()): string {
  const dia = inicioDoDia(new Date(d)).getTime();
  const hoje = inicioDoDia(agora).getTime();
  if (dia === hoje) return "Hoje";
  if (dia === somarDias(new Date(hoje), 1).getTime()) return "Amanhã";
  return `${formatDiaSemana(d)}, ${formatDiaCurto(d)}`;
}

/** "Bom dia" / "Boa tarde" / "Boa noite" pela hora local. */
export function saudacao(agora = new Date()): string {
  const h = agora.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/** 5524999998888 → "(24) 99999-8888". Número fora do padrão volta como veio. */
export function formatTelefone(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

/** Link wa.me a partir do telefone gravado no CRM (já com 55). */
export function linkWhatsapp(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return `https://wa.me/${d.startsWith("55") ? d : `55${d}`}`;
}

/** Iniciais para avatar: "Maria Souza Lima" → "ML". */
export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}
