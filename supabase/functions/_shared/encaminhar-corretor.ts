// Quando a Sophia para de perguntar e passa o lead ao corretor.
//
// O roteiro antigo (nome, cidade, objetivo, tamanho, como conheceu, uma
// pergunta por vez) deixava a decisão de parar com o modelo, que não parava:
// quem já tinha dito o tamanho do terreno ou pedido o preço continuava
// recebendo perguntas, e quem insistia no preço recebia a mesma oferta de novo.
//
// A regra aqui é determinística e roda depois do modelo: com sinais
// suficientes, a resposta vira "vou passar seu contato para o corretor", o lead
// é entregue (rodízio) com resumo, e daí em diante a Sophia só tira dúvidas.

import { metragemEmNumero } from "./ferramentas-sophia.ts";

function normalizar(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** "quanto custa", "qual o valor", "preço", "parcela", "entrada"... */
export function pediuPreco(texto: string): boolean {
  const t = normalizar(texto);
  if (/\bcondominio\b/.test(t)) return false;
  return (
    /\b(preco|precos|valor|valores|quanto (custa|e|sai|fica|ta|esta)|qual o investimento|tabela|parcela|parcelas|parcelamento|entrada|a vista|financiamento|financia)\b/.test(
      t,
    ) || /\bquanto\b.*\b(lote|terreno|m2|metro)/.test(t)
  );
}

/** Interesse declarado em palavras ("tenho interesse", "quero comprar"...). */
export function declarouInteresse(texto: string): boolean {
  const t = normalizar(texto);
  return /\b(tenho interesse|me interess|quero (comprar|um lote|um terreno|construir|investir)|pretendo (comprar|construir)|estou procurando|to procurando|procuro um (lote|terreno))\b/.test(
    t,
  );
}

/** Metragem citada na própria mensagem ("uns 360m²", "12x30"). */
export function metragemNaMensagem(texto: string): number | null {
  const t = normalizar(texto);
  if (!/(m2|m²|metro|\d\s*x\s*\d)/.test(t) && !/^\s*\d{3,4}\s*$/.test(t)) return null;
  return metragemEmNumero(t);
}

export interface SinaisLead {
  nome?: unknown;
  cidade?: unknown;
  objetivo?: unknown;
  metragem_interesse?: unknown;
  quer_visitar?: unknown;
  prazo_compra?: unknown;
}

export interface EntradaEncaminhamento {
  lead: SinaisLead;
  /** O que a Sophia registrou neste turno (patch de registrar_dados_lead). */
  registradoAgora: Record<string, unknown>;
  mensagem: string;
  /** Mensagens anteriores do lead, mais antigas primeiro. */
  mensagensAnteriores: string[];
}

export interface DecisaoEncaminhamento {
  encaminhar: boolean;
  motivo: string;
  pediuPreco: boolean;
  metragem: number | null;
}

function preenchido(v: unknown): boolean {
  const s = String(v ?? "").trim();
  return s !== "" && s !== "null";
}

function nomeValido(v: unknown): boolean {
  const s = String(v ?? "").trim();
  return s !== "" && !/^[\d\s+()-]+$/.test(s) && !s.includes("@") && !/^lead de teste/i.test(s);
}

/**
 * Encaminha quando há o bastante para o corretor trabalhar:
 * - interesse + tamanho do terreno; ou
 * - pedido de preço + mais um sinal (interesse, tamanho, nome ou cidade); ou
 * - o preço pedido pela 2ª vez (a oferta de vídeo/visita já foi feita).
 */
export function decidirEncaminhamento(e: EntradaEncaminhamento): DecisaoEncaminhamento {
  const dados = { ...e.lead, ...e.registradoAgora };
  const metragem =
    metragemNaMensagem(e.mensagem) ??
    (preenchido(dados.metragem_interesse) ? metragemEmNumero(dados.metragem_interesse) : null);
  const tamanho = metragem !== null;
  const interesse =
    preenchido(dados.objetivo) ||
    /^sim/i.test(String(dados.quer_visitar ?? "")) ||
    /3 meses/i.test(String(dados.prazo_compra ?? "")) ||
    declarouInteresse(e.mensagem) ||
    e.mensagensAnteriores.some(declarouInteresse);
  const identificado = nomeValido(dados.nome) || preenchido(dados.cidade);
  const precoAgora = pediuPreco(e.mensagem);
  const precoAntes = e.mensagensAnteriores.filter(pediuPreco).length;

  const base = { pediuPreco: precoAgora || precoAntes > 0, metragem };
  if (precoAgora && precoAntes >= 1) {
    return { ...base, encaminhar: true, motivo: "pediu o preço de novo" };
  }
  if (precoAgora && (interesse || tamanho || identificado)) {
    return { ...base, encaminhar: true, motivo: "pediu o preço" };
  }
  if (interesse && tamanho) {
    return { ...base, encaminhar: true, motivo: "interesse e tamanho do terreno informados" };
  }
  return { ...base, encaminhar: false, motivo: "" };
}

/** Texto que o lead recebe no lugar de mais uma pergunta. */
export function mensagemEncaminhamento(opcoes: {
  primeiroNome: string | null;
  corretor: string | null;
  metragem: number | null;
  pediuPreco: boolean;
}): string {
  const quem = opcoes.corretor
    ? `o ${opcoes.corretor}, nosso corretor,`
    : "um dos nossos corretores";
  const sobre = opcoes.pediuPreco
    ? `os valores e as condições${opcoes.metragem ? ` dos lotes de ${opcoes.metragem} m²` : ""}`
    : `as opções${opcoes.metragem ? ` de lotes de ${opcoes.metragem} m²` : " de lotes"} e os valores`;
  const vocativo = opcoes.primeiroNome ? `${opcoes.primeiroNome}, vou` : "Vou";
  return `${vocativo} passar seu contato para ${quem} que te chama aqui mesmo com ${sobre}.`;
}

/**
 * Resposta final: mantém o que o modelo respondeu de fato (sem as perguntas)
 * e fecha com o encaminhamento.
 */
export function respostaComEncaminhamento(bolhas: string[], encaminhamento: string): string[] {
  const semPergunta = bolhas.filter((b) => !b.includes("?"));
  return [...semPergunta.slice(0, 2), encaminhamento];
}

export function primeiroNome(v: unknown): string | null {
  if (!nomeValido(v)) return null;
  const p = String(v).trim().split(/\s+/)[0];
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : null;
}
