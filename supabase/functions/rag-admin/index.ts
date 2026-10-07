// Supabase Edge Function — operações administrativas do RAG da Sophia.
//
//   POST {"action":"indexar","chave":"rag_conhecimento"}  reindexa (só o que mudou)
//   POST {"action":"indexar","force":true}                 reembeda tudo
//   POST {"action":"buscar","consulta":"..."}              diagnóstico: o que a busca devolve
//   POST {"action":"avaliar"}                              mede a busca no golden set
//   POST {"action":"status"}                               estado do índice
//
// Quem chama:
//   - o gatilho `rag_reindexar_ao_alterar` (pg_net), com o segredo `rag_admin_secret` do Vault;
//   - um admin/gestor logado, para reindexar ou diagnosticar à mão.
// Qualquer outra chamada é recusada — esta função gasta crédito de IA.
//
// Visão geral e operação: docs/rag.md.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { dividirEmTrechos, textoParaEmbedding } from "../_shared/rag-chunker.ts";
import { PERGUNTAS_FORA, PERGUNTAS_OURO } from "../_shared/rag-golden.ts";
import {
  buscarTrechos,
  gerarEmbeddings,
  LIMITE_TRECHOS,
  MODELO_EMBEDDING,
  sha256Hex,
  SIMILARIDADE_CONFIANTE,
  SIMILARIDADE_MINIMA,
  trechoRelevante,
  vetorParaSql,
  type TrechoRecuperado,
} from "../_shared/rag.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = (Deno.env.get("OPENAI_API_KEY") ?? "")
  .trim()
  .replace(/[\r\n\t]/g, "")
  .replace(/[^\x20-\x7E]/g, "");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Comparação em tempo constante (mesma razão de _shared/internal-auth.ts).
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Devolve uma Response de recusa, ou null quando a chamada pode seguir. */
async function autorizar(req: Request): Promise<Response | null> {
  // Gatilho do banco: segredo próprio guardado no Vault e conferido pelo
  // próprio banco (rag_segredo_valido). Não usa a service_role_key do Vault
  // porque aquele valor não é um JWT válido (ver docs/rag.md, "Segredos").
  const segredo = req.headers.get("x-rag-secret");
  if (segredo) {
    const { data } = await supabase.rpc("rag_segredo_valido", { p_segredo: segredo });
    return data === true ? null : json({ error: "Unauthorized" }, 401);
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Unauthorized" }, 401);

  // Chamadas internas com a service role.
  if (SUPABASE_SERVICE_ROLE_KEY && iguais(token, SUPABASE_SERVICE_ROLE_KEY)) return null;

  const { data: usuario, error } = await supabase.auth.getUser(token);
  if (error || !usuario.user) return json({ error: "Unauthorized" }, 401);

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", usuario.user.id)
    .maybeSingle();
  if (!perfil?.ativo || !["admin", "gestor"].includes(perfil.role)) {
    return json({ error: "Forbidden: apenas admin ou gestor" }, 403);
  }
  return null;
}

// ---------------------------------------------------------------------------
// indexar
// ---------------------------------------------------------------------------

interface RelatorioIndexacao {
  chave: string;
  status: "indexado" | "em_dia" | "ignorado" | "obsoleto" | "erro";
  motivo?: string;
  trechos?: number;
  novos?: number;
  reaproveitados?: number;
  removidos?: number;
  ms?: number;
}

async function indexar(chave: string, force: boolean): Promise<RelatorioIndexacao> {
  const inicio = Date.now();
  const ms = () => Date.now() - inicio;

  const { data: doc } = await supabase
    .from("rag_documentos")
    .select("chave, ativo, conteudo_hash, modelo_embedding, status")
    .eq("chave", chave)
    .maybeSingle();
  if (!doc) return { chave, status: "ignorado", motivo: "chave não registrada em rag_documentos" };
  if (!doc.ativo) return { chave, status: "ignorado", motivo: "documento inativo" };

  const { data: cfg } = await supabase
    .from("configuracoes")
    .select("valor")
    .eq("chave", chave)
    .maybeSingle();
  const texto = cfg?.valor ?? "";
  if (!texto.trim()) {
    return registrarErro(chave, doc.conteudo_hash, null, "documento vazio", ms());
  }

  const hashDocumento = await sha256Hex(texto);

  try {
    const { titulo, trechos } = dividirEmTrechos(texto);
    if (!trechos.length) throw new Error("a base não gerou nenhum trecho");

    // Hash = modelo + texto embedado: trocar de modelo ou editar o trecho muda o
    // hash e força novo embedding; o resto é reaproveitado.
    const vistos = new Set<string>();
    const itens: {
      hash: string;
      ordem: number;
      secao: string;
      conteudo: string;
      textoEmbedding: string;
    }[] = [];
    for (const t of trechos) {
      const textoEmbedding = textoParaEmbedding(t.secao, t.conteudo);
      const hash = await sha256Hex(`${MODELO_EMBEDDING}\n${textoEmbedding}`);
      if (vistos.has(hash)) continue;
      vistos.add(hash);
      itens.push({
        hash,
        ordem: itens.length,
        secao: t.secao,
        conteudo: t.conteudo,
        textoEmbedding,
      });
    }

    // "Em dia" se decide pelos trechos, não pelo hash do documento: mudar a
    // receita de indexação (chunking, texto embedado, modelo) sem mexer no
    // documento também precisa reindexar.
    const { data: gravados } = await supabase
      .from("rag_chunks")
      .select("hash")
      .eq("documento_chave", chave);
    const existentes = new Set<string>((gravados ?? []).map((r) => r.hash));
    const vigentes = new Set(itens.map((i) => i.hash));

    const novos = force ? itens : itens.filter((i) => !existentes.has(i.hash));
    const obsoletos = [...existentes].filter((h) => !vigentes.has(h)).length;
    if (
      !force &&
      !novos.length &&
      !obsoletos &&
      doc.status === "ok" &&
      doc.conteudo_hash === hashDocumento
    ) {
      return { chave, status: "em_dia", ms: ms() };
    }

    const embeddings = await gerarEmbeddings(
      OPENAI_API_KEY,
      novos.map((i) => i.textoEmbedding),
    );
    const embeddingPorHash = new Map(novos.map((n, i) => [n.hash, embeddings[i]]));

    const { data: aplicado, error } = await supabase.rpc("rag_substituir_chunks", {
      p_documento: chave,
      p_conteudo_hash: hashDocumento,
      p_modelo: MODELO_EMBEDDING,
      p_titulo: titulo,
      p_trechos: itens.map((i) => ({
        hash: i.hash,
        ordem: i.ordem,
        secao: i.secao,
        conteudo: i.conteudo,
        embedding: embeddingPorHash.has(i.hash)
          ? vetorParaSql(embeddingPorHash.get(i.hash)!)
          : null,
      })),
    });
    if (error) throw new Error(error.message);

    if (!aplicado?.aplicado) {
      // O texto mudou durante a indexação; a edição mais nova já disparou outra.
      return { chave, status: "obsoleto", motivo: aplicado?.motivo, ms: ms() };
    }
    return {
      chave,
      status: "indexado",
      trechos: aplicado.total,
      novos: aplicado.novos,
      reaproveitados: aplicado.reaproveitados,
      removidos: aplicado.removidos,
      ms: ms(),
    };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    return registrarErro(chave, doc.conteudo_hash, hashDocumento, mensagem, ms());
  }
}

/**
 * Anota o erro no documento. O status só vira 'erro' (e a busca para de servir
 * o índice) se ele já estava desatualizado; um force falho sobre um índice em
 * dia não pode derrubar um índice bom.
 */
async function registrarErro(
  chave: string,
  hashIndexado: string | null,
  hashAtual: string | null,
  mensagem: string,
  ms: number,
): Promise<RelatorioIndexacao> {
  console.error(`[rag-admin] indexação de ${chave} falhou:`, mensagem);
  const desatualizado = hashAtual === null || hashIndexado !== hashAtual;
  await supabase
    .from("rag_documentos")
    .update({ erro: mensagem.slice(0, 500), ...(desatualizado ? { status: "erro" } : {}) })
    .eq("chave", chave);
  return { chave, status: "erro", motivo: mensagem, ms };
}

// ---------------------------------------------------------------------------
// avaliar
// ---------------------------------------------------------------------------

/** Minúsculas e sem acento: "Pavimentação" casa com "pavimentacao". */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

interface ConfigBusca {
  rrf_k: number;
  peso_vetor: number;
  peso_texto: number;
}

/** Sem `cfg`, usa rag_buscar (a configuração de produção); com `cfg`, o núcleo parametrizável. */
async function buscarPorEmbedding(
  embedding: number[],
  consulta: string,
  limite: number,
  cfg?: ConfigBusca,
) {
  const base = {
    p_consulta: consulta,
    p_embedding: vetorParaSql(embedding),
    p_escopo: "agente",
    p_limite: limite,
  };
  const { data, error } = cfg
    ? await supabase.rpc("rag_buscar_hibrido", {
        ...base,
        p_candidatos: 20,
        p_rrf_k: cfg.rrf_k,
        p_peso_vetor: cfg.peso_vetor,
        p_peso_texto: cfg.peso_texto,
      })
    : await supabase.rpc("rag_buscar", base);
  if (error) throw new Error(error.message);
  return (data ?? []) as TrechoRecuperado[];
}

const melhorSim = (trechos: TrechoRecuperado[]) =>
  Number(Math.max(0, ...trechos.map((t) => t.similaridade)).toFixed(3));

async function rodarAvaliacao(embeddings: number[][], cfg?: ConfigBusca) {
  const casos = [];
  for (const [i, caso] of PERGUNTAS_OURO.entries()) {
    const trechos = await buscarPorEmbedding(embeddings[i], caso.pergunta, LIMITE_TRECHOS, cfg);
    const esperadas = caso.contem.map(normalizar);
    const posicao = trechos.findIndex((t) => {
      const alvo = normalizar(`${t.secao} ${t.conteudo}`);
      return esperadas.some((e) => alvo.includes(e));
    });
    casos.push({
      pergunta: caso.pergunta,
      acertou: posicao >= 0,
      posicao: posicao >= 0 ? posicao + 1 : null,
      melhor_similaridade: melhorSim(trechos),
      passa_no_criterio: trechoRelevante(trechos),
      secoes: trechos.map((t) => t.secao),
    });
  }

  const fora = [];
  for (const [j, pergunta] of PERGUNTAS_FORA.entries()) {
    const idx = PERGUNTAS_OURO.length + j;
    const trechos = await buscarPorEmbedding(embeddings[idx], pergunta, LIMITE_TRECHOS, cfg);
    fora.push({
      pergunta,
      melhor_similaridade: melhorSim(trechos),
      passa_no_criterio: trechoRelevante(trechos),
    });
  }

  const acertos = casos.filter((c) => c.acertou);
  const mrr = casos.reduce((soma, c) => soma + (c.posicao ? 1 / c.posicao : 0), 0) / casos.length;
  return {
    casos,
    fora,
    resumo: {
      acerto_no_top_k: Number((acertos.length / casos.length).toFixed(3)),
      mrr: Number(mrr.toFixed(3)),
      // O critério decide entre usar os trechos ou recuar para a base inteira:
      // o ideal é todas as perguntas reais passarem e as de fora não passarem.
      criterio_relevancia: {
        reais_que_passam: casos.filter((c) => c.passa_no_criterio).length,
        de_fora_que_passam: fora.filter((f) => f.passa_no_criterio).length,
      },
    },
  };
}

/**
 * Sem corpo extra: relatório completo da configuração de produção.
 * Com `grade: [{rrf_k, peso_vetor, peso_texto}, ...]`: só o resumo de cada
 * configuração, para escolher os parâmetros de rag_buscar com números.
 */
async function avaliar(corpo: { grade?: ConfigBusca[] }) {
  const perguntas = [...PERGUNTAS_OURO.map((c) => c.pergunta), ...PERGUNTAS_FORA];
  const embeddings = await gerarEmbeddings(OPENAI_API_KEY, perguntas);

  if (Array.isArray(corpo.grade)) {
    const grade = [];
    for (const config of corpo.grade.slice(0, 40)) {
      grade.push({ config, ...(await rodarAvaliacao(embeddings, config)).resumo });
    }
    return { modelo: MODELO_EMBEDDING, limite: LIMITE_TRECHOS, grade };
  }

  const { casos, fora, resumo } = await rodarAvaliacao(embeddings);
  return {
    modelo: MODELO_EMBEDDING,
    limite: LIMITE_TRECHOS,
    perguntas: casos.length,
    ...resumo,
    limiares: { confiante: SIMILARIDADE_CONFIANTE, minima: SIMILARIDADE_MINIMA },
    falhas: casos.filter((c) => !c.acertou),
    sem_criterio: casos.filter((c) => !c.passa_no_criterio),
    fora_da_base: fora,
    casos,
  };
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

async function status() {
  const { data: docs } = await supabase
    .from("rag_documentos")
    .select(
      "chave, escopo, ativo, titulo, n_trechos, modelo_embedding, indexado_em, status, erro, conteudo_hash",
    );
  const saida = [];
  for (const d of docs ?? []) {
    const { data: cfg } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", d.chave)
      .maybeSingle();
    const atual = cfg?.valor ? await sha256Hex(cfg.valor) : null;
    saida.push({
      ...d,
      conteudo_hash: undefined,
      em_dia: Boolean(d.conteudo_hash) && d.conteudo_hash === atual,
    });
  }
  const { data: modo } = await supabase
    .from("configuracoes")
    .select("valor")
    .eq("chave", "rag_modo")
    .maybeSingle();
  return { modo: modo?.valor ?? "busca (padrão)", documentos: saida };
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const recusa = await autorizar(req);
  if (recusa) return recusa;

  try {
    const corpo = await req.json().catch(() => ({}));
    const action = String(corpo.action ?? "indexar");

    if (action === "status") return json(await status());

    if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY não configurada" }, 503);

    if (action === "indexar") {
      const force = corpo.force === true;
      let chaves: string[];
      if (typeof corpo.chave === "string") {
        chaves = [corpo.chave];
      } else {
        const { data } = await supabase.from("rag_documentos").select("chave").eq("ativo", true);
        chaves = (data ?? []).map((d) => d.chave);
      }
      const relatorios = [];
      for (const chave of chaves) relatorios.push(await indexar(chave, force));
      return json({ relatorios });
    }

    if (action === "buscar") {
      const consulta = String(corpo.consulta ?? "").trim();
      if (!consulta) return json({ error: "consulta obrigatória" }, 400);
      const limite = Math.min(Math.max(Number(corpo.limite) || LIMITE_TRECHOS, 1), 20);
      const resultado = await buscarTrechos(supabase, OPENAI_API_KEY, consulta, { limite });
      return json({
        usaria_busca: resultado.ok,
        motivo_recuo: resultado.ok ? null : resultado.motivo,
        detalhe: resultado.ok ? null : (resultado.detalhe ?? null),
        limiares: { confiante: SIMILARIDADE_CONFIANTE, minima: SIMILARIDADE_MINIMA },
        trechos: resultado.trechos.map((t) => ({
          secao: t.secao,
          similaridade: Number(t.similaridade.toFixed(3)),
          rank_vetor: t.rank_vetor,
          rank_texto: t.rank_texto,
          conteudo: t.conteudo,
        })),
      });
    }

    if (action === "avaliar") return json(await avaliar(corpo));

    return json({ error: `action desconhecida: ${action}` }, 400);
  } catch (e) {
    console.error("[rag-admin]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
