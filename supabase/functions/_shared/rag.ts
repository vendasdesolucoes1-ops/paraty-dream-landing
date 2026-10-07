// RAG da Sophia: embeddings, recuperação e montagem do contexto.
//
// Usado por duas funções:
//   - rag-admin     → indexa a base (chunking + embeddings) e avalia a busca
//   - ai-agent-chat → recupera os trechos relevantes a cada mensagem
//
// O desenho completo está em docs/rag.md. Em uma linha: a fonte de verdade é
// `configuracoes.rag_conhecimento`; `rag_chunks` é um índice derivado e
// descartável; qualquer falha aqui faz a Sophia recuar para a base inteira.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const MODELO_EMBEDDING = "text-embedding-3-small";
export const DIMENSOES = 1536;

/** Trechos injetados no prompt. Com ~800 chars cada, cabem ~3 mil caracteres. */
export const LIMITE_TRECHOS = 5;

/**
 * Critério de relevância: decide se os trechos recuperados servem ou se a
 * Sophia recua para a base inteira. O cosseno absoluto sozinho NÃO separa
 * pergunta real de conversa solta — "Qual é o CEP?" acerta em 1º lugar com
 * cosseno 0,25 (consulta curta contra um trecho longo), enquanto "Oi, tudo
 * bem?" chega a 0,32. Por isso são dois caminhos:
 *   - cosseno >= CONFIANTE: o vetor está seguro, basta;
 *   - cosseno >= MINIMA E algum trecho também casou na busca textual: o vetor
 *     está fraco, mas há uma palavra da pergunta no texto ("cep", "fgts").
 * Valores calibrados com o golden set (docs/rag.md, seção "Avaliação").
 */
export const SIMILARIDADE_CONFIANTE = 0.35;
export const SIMILARIDADE_MINIMA = 0.2;

export const TIMEOUT_EMBEDDING_MS = 4000;

export async function sha256Hex(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** pgvector aceita o literal "[0.1,0.2,...]"; 7 casas bastam para float4 e encolhem o payload. */
export function vetorParaSql(vetor: number[]): string {
  return `[${vetor.map((x) => Number(x.toFixed(7))).join(",")}]`;
}

/** Erro que não adianta tentar de novo (4xx exceto 429). */
class ErroDefinitivo extends Error {}

interface OpcoesEmbedding {
  timeoutMs?: number;
  tentativas?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Gera embeddings em lote. Repete em 429/5xx com espera crescente: a indexação
 * roda em segundo plano e vale esperar; a busca por mensagem usa 1 tentativa.
 */
export async function gerarEmbeddings(
  apiKey: string,
  textos: string[],
  { timeoutMs = 20000, tentativas = 3, fetchImpl = fetch }: OpcoesEmbedding = {},
): Promise<number[][]> {
  if (!textos.length) return [];
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");

  let ultimoErro = "";
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const resp = await fetchImpl("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: MODELO_EMBEDDING, input: textos, dimensions: DIMENSOES }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (resp.ok) {
        const json = await resp.json();
        const dados = (json.data ?? []) as { index: number; embedding: number[] }[];
        if (dados.length !== textos.length) {
          throw new Error(
            `OpenAI devolveu ${dados.length} embeddings para ${textos.length} textos`,
          );
        }
        return dados.sort((a, b) => a.index - b.index).map((d) => d.embedding);
      }

      const corpo = (await resp.text()).slice(0, 300);
      // Chave inválida, payload errado etc.: repetir não muda nada.
      if (resp.status !== 429 && resp.status < 500)
        throw new ErroDefinitivo(`OpenAI ${resp.status}: ${corpo}`);
      ultimoErro = `OpenAI ${resp.status}: ${corpo}`;
    } catch (e) {
      if (e instanceof ErroDefinitivo) throw e;
      ultimoErro = e instanceof Error ? e.message : String(e);
    }
    if (tentativa < tentativas) await new Promise((r) => setTimeout(r, 500 * 2 ** (tentativa - 1)));
  }
  throw new Error(`embeddings falharam após ${tentativas} tentativas: ${ultimoErro}`);
}

interface MensagemHistorico {
  role: "user" | "assistant";
  content: string;
}

/** Mensagem curta demais para ter assunto: "sim", "pode ser", "e aí?". */
const LIMIAR_MENSAGEM_VAZIA = 25;

/**
 * Texto que representa o que o lead quer saber AGORA.
 *
 * A mensagem sozinha costuma bastar ("e o esgoto?"), mas respostas curtas
 * ("sim", "pode ser") só fazem sentido pelo que a Sophia acabou de oferecer.
 * Mensagem curta → anexa a última fala da Sophia; mensagem longa → anexa só a
 * fala anterior do lead, que costuma completar o assunto ("tem lote de 250?"
 * depois de "queria algo pequeno").
 */
export function montarConsultaRag(message: string, history: MensagemHistorico[]): string {
  const atual = String(message ?? "").trim();
  const ultimo = (role: MensagemHistorico["role"]) =>
    [...history]
      .reverse()
      .find((m) => m.role === role)
      ?.content?.trim() ?? "";

  const partes = [atual];
  if (atual.length < LIMIAR_MENSAGEM_VAZIA) {
    const sophia = ultimo("assistant");
    if (sophia) partes.push(sophia.slice(-300));
  } else {
    const anterior = ultimo("user");
    if (anterior && anterior !== atual) partes.push(anterior.slice(-200));
  }
  return partes.filter(Boolean).join("\n").slice(0, 600);
}

export interface TrechoRecuperado {
  chunk_id: string;
  documento: string;
  ordem: number;
  secao: string;
  conteudo: string;
  similaridade: number;
  rank_vetor: number | null;
  rank_texto: number | null;
  score: number;
}

export type ResultadoBusca =
  | { ok: true; trechos: TrechoRecuperado[]; melhorSimilaridade: number }
  | { ok: false; motivo: MotivoRecuo; detalhe?: string; trechos: TrechoRecuperado[] };

export type MotivoRecuo =
  | "erro" // embedding ou RPC falhou
  | "indice_indisponivel" // nada devolvido: documento sem índice em dia
  | "similaridade_baixa" // pergunta fora da base
  | "desativado"; // rag_modo = 'completo' (interruptor) ou sem chave da OpenAI

/** Aplica o critério de relevância (ver SIMILARIDADE_CONFIANTE) aos trechos recuperados. */
export function trechoRelevante(trechos: TrechoRecuperado[]): boolean {
  const melhor = Math.max(0, ...trechos.map((t) => t.similaridade));
  const casouNoTexto = trechos.some((t) => t.rank_texto !== null);
  return melhor >= SIMILARIDADE_CONFIANTE || (melhor >= SIMILARIDADE_MINIMA && casouNoTexto);
}

/** Embeda a consulta e chama rag_buscar. Nunca lança: devolve o motivo do recuo. */
export async function buscarTrechos(
  supabase: SupabaseClient,
  apiKey: string,
  consulta: string,
  { limite = LIMITE_TRECHOS, escopo = "agente" }: { limite?: number; escopo?: string } = {},
): Promise<ResultadoBusca> {
  try {
    const [embedding] = await gerarEmbeddings(apiKey, [consulta], {
      timeoutMs: TIMEOUT_EMBEDDING_MS,
      tentativas: 1,
    });

    const { data, error } = await supabase.rpc("rag_buscar", {
      p_consulta: consulta,
      p_embedding: vetorParaSql(embedding),
      p_escopo: escopo,
      p_limite: limite,
    });
    if (error) return { ok: false, motivo: "erro", detalhe: error.message, trechos: [] };

    const trechos = (data ?? []) as TrechoRecuperado[];
    if (!trechos.length) return { ok: false, motivo: "indice_indisponivel", trechos };

    if (!trechoRelevante(trechos)) return { ok: false, motivo: "similaridade_baixa", trechos };
    return {
      ok: true,
      trechos,
      melhorSimilaridade: Math.max(...trechos.map((t) => t.similaridade)),
    };
  } catch (e) {
    return {
      ok: false,
      motivo: "erro",
      detalhe: e instanceof Error ? e.message : String(e),
      trechos: [],
    };
  }
}

/**
 * Trechos na ordem do documento (não na ordem do score): a leitura fica
 * coerente — identidade, depois estrutura, depois diferenciais — e o rótulo da
 * seção diz de onde cada informação veio.
 */
export function formatarTrechos(trechos: TrechoRecuperado[]): string {
  return [...trechos]
    .sort((a, b) => a.ordem - b.ordem)
    .map((t) => `### ${t.secao}\n${t.conteudo}`)
    .join("\n\n");
}

/** O que entra no prompt da Sophia como "conteúdo oficial" nesta mensagem. */
export interface ConhecimentoParaPrompt {
  /** Trechos selecionados ("busca") ou a base inteira ("completo"). */
  texto: string;
  modo: "busca" | "completo";
  /** Preenchido quando "completo" foi um recuo, não uma escolha. */
  motivoRecuo: MotivoRecuo | null;
  consulta: string;
  trechos: TrechoRecuperado[];
  latenciaMs: number;
}

/**
 * Decide o que a Sophia vê da base nesta mensagem: os trechos mais relevantes
 * ou, em qualquer dúvida, a base inteira (o comportamento de antes do RAG).
 * Nunca lança — a busca é uma otimização e não pode derrubar a conversa.
 */
export async function resolverConhecimento(
  supabase: SupabaseClient,
  apiKey: string,
  entrada: {
    baseCompleta: string;
    /** Valor de configuracoes.rag_modo. Só "completo" desliga a busca. */
    modoConfigurado: string | null | undefined;
    message: string;
    history: MensagemHistorico[];
  },
): Promise<ConhecimentoParaPrompt> {
  const inicio = Date.now();
  const consulta = montarConsultaRag(entrada.message, entrada.history);
  const completo = (motivo: MotivoRecuo, trechos: TrechoRecuperado[] = []) => ({
    texto: entrada.baseCompleta,
    modo: "completo" as const,
    motivoRecuo: motivo,
    consulta,
    trechos,
    latenciaMs: Date.now() - inicio,
  });

  if (entrada.modoConfigurado?.trim().toLowerCase() === "completo" || !apiKey) {
    return completo("desativado");
  }
  if (!consulta) return completo("similaridade_baixa");

  const resultado = await buscarTrechos(supabase, apiKey, consulta);
  if (!resultado.ok) {
    if (resultado.detalhe)
      console.error("[rag] busca falhou, usando a base inteira:", resultado.detalhe);
    return completo(resultado.motivo, resultado.trechos);
  }
  return {
    texto: formatarTrechos(resultado.trechos),
    modo: "busca",
    motivoRecuo: null,
    consulta,
    trechos: resultado.trechos,
    latenciaMs: Date.now() - inicio,
  };
}

/** Registro best-effort da consulta; falhar aqui nunca pode afetar a conversa. */
export async function registrarConsultaRag(
  supabase: SupabaseClient,
  registro: {
    lead_id: string | null;
    consulta: string;
    modo: "busca" | "completo";
    motivo_recuo?: MotivoRecuo | null;
    trechos: TrechoRecuperado[];
    latencia_ms: number;
  },
): Promise<void> {
  try {
    const sims = registro.trechos.map((t) => t.similaridade);
    const { error } = await supabase.from("rag_consultas").insert({
      lead_id: registro.lead_id,
      consulta: registro.consulta,
      modo: registro.modo,
      motivo_recuo: registro.motivo_recuo ?? null,
      chunk_ids: registro.trechos.map((t) => t.chunk_id),
      similaridades: sims,
      melhor_similaridade: sims.length ? Math.max(...sims) : null,
      latencia_ms: registro.latencia_ms,
    });
    if (error) console.error("[rag] registro da consulta falhou:", error.message);
  } catch (e) {
    console.error("[rag] registro da consulta falhou:", e);
  }
}
