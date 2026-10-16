// Registro central dos modelos de IA (issue #61).
//
// Todo ID de modelo usado pelas edge functions mora AQUI, e só aqui: o teste
// modelos.test.ts varre supabase/functions e falha se um ID aparecer em outro
// arquivo. Trocar de modelo, subir de versão ou ajustar temperature é uma
// mudança neste arquivo, revisável num lugar só — antes os IDs estavam
// espalhados por nove arquivos, dois deles em versão preview em produção.
//
// Sem import de Deno: o módulo é carregado pelos testes em node. O único env
// lido (OPENAI_FALLBACK_MODEL) passa por lerEnv, que tolera a ausência do Deno.

export interface ConfigModelo {
  /** ID exato que vai no corpo/caminho da requisição ao provedor. */
  readonly id: string;
  readonly temperatura?: number;
  readonly maxTokens?: number;
}

function lerEnv(nome: string): string {
  const deno = (globalThis as { Deno?: { env: { get(n: string): string | undefined } } }).Deno;
  try {
    return (deno?.env.get(nome) ?? "").trim();
  } catch {
    // Sem permissão de env (ou fora do Deno): segue sem override.
    return "";
  }
}

/**
 * Modelos que o agente pode escolher na coluna ai_agents.modelo. Espelha o
 * CHECK da migração 20260711000000_ai_agent_config_fields.sql e o tipo
 * AiAgentModelo em src/lib/types.ts — mudar um exige mudar os três.
 */
export const MODELOS_SOPHIA_PERMITIDOS = ["gpt-4o-mini", "gpt-4o"] as const;
export type ModeloSophia = (typeof MODELOS_SOPHIA_PERMITIDOS)[number];
export const MODELO_SOPHIA_PADRAO: ModeloSophia = "gpt-4o-mini";

/**
 * Modelo da Sophia a partir do valor gravado no agente. Qualquer coisa fora da
 * lista (nulo, digitado à mão no banco, modelo descontinuado) cai no padrão em
 * vez de mandar à OpenAI um ID que ela recusaria.
 */
export function resolverModeloSophia(valor: unknown): ModeloSophia {
  return MODELOS_SOPHIA_PERMITIDOS.find((m) => m === valor) ?? MODELO_SOPHIA_PADRAO;
}

export const MODELOS = {
  /**
   * Sophia (ai-agent-chat). O ID efetivo vem de ai_agents.modelo via
   * resolverModeloSophia; este é o padrão. 0.4 segura a variação de fraseado
   * sem deixar a resposta robótica.
   */
  sophiaChat: { id: MODELO_SOPHIA_PADRAO, temperatura: 0.4, maxTokens: 1000 },
  /**
   * Reserva da Sophia, só via env OPENAI_FALLBACK_MODEL. Vazio desliga o
   * fallback (comportamento padrão); usa os mesmos parâmetros do principal.
   */
  sophiaFallback: { id: lerEnv("OPENAI_FALLBACK_MODEL") },

  /** Extração dos dados de qualificação do lead (lead-qualification.ts). */
  qualificacaoLead: { id: "gpt-4o-mini", temperatura: 0 },
  /** Extração da data/hora da visita combinada (lead-visita.ts). */
  extracaoVisita: { id: "gpt-4o-mini", temperatura: 0 },

  /** Embeddings do RAG (rag.ts). Trocar invalida o índice: reindexar tudo. */
  embeddingRag: { id: "text-embedding-3-small" },

  /** Transcrição de áudio (transcricao.ts): o mais barato e recente primeiro. */
  transcricao: { id: "gpt-4o-mini-transcribe" },
  /** Reserva da transcrição, tentada quando a primeira falha. */
  transcricaoReserva: { id: "whisper-1" },

  /**
   * Planner do Imagery Engine (imagery-plan-post), API direta do Google.
   * Era a versão preview da família 3; preview pode mudar de comportamento ou
   * sair do ar sem aviso, então produção usa a versão estável 2.5.
   */
  planejamentoImagem: { id: "gemini-2.5-flash" },
  /** Imagem dos slides internos (imagery-generate-image). Versão GA. */
  imagemRapida: { id: "gemini-2.5-flash-image" },
  /**
   * Imagem da capa (imagery-generate-image). ID mantido como estava: não há
   * confirmação de que seja o identificador GA do modelo pro de imagem. Antes
   * do deploy, conferir em imagery_logs (step "generate", success = false) se
   * há falhas 404/400 para este ID; se houver, trocar aqui. Um 503 persistente
   * já cai para imagemRapida no próprio gerador.
   */
  imagemCapa: { id: "gemini-3-pro-image" },
  /** Validação visual das imagens (imagery-validate-image), via gateway Lovable. */
  validacaoImagem: { id: "google/gemini-2.5-flash" },

  /** Classificador da resposta a um follow-up: decisão, pouca variação. */
  followUpClassificador: { id: "gpt-4o-mini", temperatura: 0.2 },
  /** Redator do follow-up: texto mais natural, ainda contido. */
  followUpRedator: { id: "gpt-4o-mini", temperatura: 0.5 },
} as const satisfies Record<string, ConfigModelo>;

/**
 * Preço por 1M de tokens em USD dos modelos OpenAI cobrados por token (usado
 * por telemetria.ts). Conferir na página de preços do provedor ao trocar de
 * modelo: o custo registrado é estimativa a partir desta tabela.
 */
export const PRECO_POR_MILHAO: Record<string, { entrada: number; saida: number }> = {
  "gpt-4o-mini": { entrada: 0.15, saida: 0.6 },
  "gpt-4o": { entrada: 2.5, saida: 10 },
  "text-embedding-3-small": { entrada: 0.02, saida: 0 },
};
