// Regras determinísticas da Sophia: o que NÃO pode depender do modelo.
//
// Identidade, despedida do opt-out, quando um pedido é de fato "quero falar
// com uma pessoa", como cada mensagem do histórico aparece para o modelo e o
// texto da condição comercial. Módulo puro, sem Deno nem rede: testado em node
// (sophia-regras.test.ts).

/** Resposta fixa quando perguntam se é robô / pessoa. */
export const RESPOSTA_IDENTIDADE =
  "Sou a assistente digital da equipe do Moradas de Paraty. Se preferir, chamo um consultor agora.";

/** Despedida do opt-out: uma vez só, sem pergunta depois. */
export const MENSAGEM_OPT_OUT =
  "Pronto, não vou mais te enviar mensagens. Se mudar de ideia, é só chamar.";

/** Texto padrão quando não há consultor cadastrado (não deve acontecer com a IA ligada). */
export const CONSULTOR_GENERICO = "um consultor da equipe";

export interface Consultor {
  vendedor_id?: string | null;
  nome?: string | null;
  telefone?: string | null;
}

/** Lê o JSON de configuracoes.consultor_responsavel; inválido = null. */
export function lerConsultor(valor: unknown): Consultor | null {
  let dados: unknown = valor;
  if (typeof valor === "string") {
    try {
      dados = JSON.parse(valor);
    } catch {
      return null;
    }
  }
  if (!dados || typeof dados !== "object") return null;
  const c = dados as Record<string, unknown>;
  const nome = String(c.nome ?? "").trim();
  if (!nome) return null;
  return {
    vendedor_id: c.vendedor_id ? String(c.vendedor_id) : null,
    nome,
    telefone: c.telefone ? String(c.telefone).replace(/\D/g, "") : null,
  };
}

/** Primeiro nome do consultor, para a Sophia citar ("o Fernando vai te receber"). */
export function nomeDoConsultor(c: Consultor | null | undefined): string {
  const nome = String(c?.nome ?? "").trim();
  return nome ? nome.split(/\s+/)[0] : CONSULTOR_GENERICO;
}

// ---------------------------------------------------------------------------
// Pedido de atendimento humano: palavra inteira + intenção

function normalizar(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Verbos/expressões de quem quer ser atendido por alguém. */
const INTENCAO =
  /\b(quero|queria|gostaria|prefiro|preciso|posso|pode|podia|poderia|da pra|tem como|me passa|me passe|me coloca|me transfere|me transfira|chama|chame|chamar|falar|conversar|atendimento|atender|ligar|ligue|liga)\b/;

/** Frases que já são pedido sozinhas, mesmo sem a palavra-chave configurada. */
const PEDIDOS_DIRETOS = [
  /\bfalar com (uma |um |alguma |algum )?(pessoa|humano|atendente|corretor|corretora|consultor|consultora|vendedor|vendedora|gente de verdade)\b/,
  /\b(quero|prefiro|preciso de) (um |uma )?(atendente|humano|pessoa|corretor|corretora|consultor|consultora)\b/,
  /\bme (passa|passe|transfere|transfira|coloca) (pra|para) (um |uma )?(atendente|humano|pessoa|corretor|corretora|consultor|consultora)\b/,
];

/**
 * O lead pediu para falar com uma pessoa?
 *
 * Antes bastava a palavra aparecer em qualquer lugar ("meu corretor me indicou
 * vocês" pausava a IA). Agora: frase direta ("quero falar com um corretor"), ou
 * palavra-chave configurada como PALAVRA INTEIRA junto de uma intenção de ser
 * atendido. Na dúvida, não transfere: o modelo ainda tem a ferramenta
 * transferir_para_humano para o pedido dito de outro jeito.
 */
export function pediuAtendimentoHumano(texto: string, palavrasChave: string[] = []): boolean {
  const t = normalizar(texto);
  if (!t) return false;
  if (PEDIDOS_DIRETOS.some((re) => re.test(t))) return true;
  const palavras = palavrasChave.map(normalizar).filter((p) => p.length > 0);
  const temPalavra = palavras.some((p) =>
    new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t),
  );
  if (!temPalavra) return false;
  // "Corretor" sozinho como resposta curta ("corretor", "um atendente") também vale.
  if (t.split(" ").length <= 3) return true;
  return (
    INTENCAO.test(t) &&
    !/\b(me indicou|indicou voces|indicacao do|meu corretor|minha corretora)\b/.test(t)
  );
}

// ---------------------------------------------------------------------------
// Histórico com autor

export type AutorMensagem =
  | "lead"
  | "sophia"
  | "equipe_painel"
  | "equipe_celular"
  | "disparo"
  | "sistema";

export interface LinhaHistorico {
  from_me: boolean;
  autor?: string | null;
  content: string | null;
}

export interface MensagemModelo {
  role: "user" | "assistant" | "system";
  content: string;
}

const ROTULO_EXTERNO: Record<string, string> = {
  equipe_painel: "A EQUIPE respondeu (pelo CRM)",
  equipe_celular: "A EQUIPE respondeu (pelo celular)",
  disparo: "Mensagem AUTOMÁTICA enviada pelo nosso número (follow-up/campanha)",
  sistema: "Aviso automático enviado pelo nosso número",
};

/**
 * Como cada linha de whatsapp_messages aparece para o modelo. Só o que a
 * própria Sophia escreveu vira `assistant`; o que a equipe ou um disparo
 * mandou entra como nota de sistema, para ela não tomar como fala dela.
 * Linha antiga sem autor e enviada pelo nosso número: origem desconhecida.
 */
export function mensagemDoHistorico(linha: LinhaHistorico): MensagemModelo | null {
  const conteudo = String(linha.content ?? "").trim();
  if (!conteudo) return null;
  if (!linha.from_me) return { role: "user", content: conteudo };
  if (linha.autor === "sophia") return { role: "assistant", content: conteudo };
  const rotulo =
    ROTULO_EXTERNO[String(linha.autor ?? "")] ??
    "Mensagem enviada pelo nosso número (equipe ou automação, origem não registrada)";
  return {
    role: "system",
    content: `${rotulo} — não foi você quem escreveu: "${conteudo}"`,
  };
}

/** Junta mensagens consecutivas do lead ou da Sophia; notas de sistema ficam separadas. */
export function agruparHistorico(mensagens: MensagemModelo[]): MensagemModelo[] {
  const saida: MensagemModelo[] = [];
  for (const m of mensagens) {
    const conteudo = String(m.content ?? "").trim();
    if (!conteudo) continue;
    const anterior = saida[saida.length - 1];
    if (anterior && anterior.role === m.role && m.role !== "system") {
      anterior.content = `${anterior.content}\n${conteudo}`;
    } else {
      saida.push({ role: m.role, content: conteudo });
    }
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Condição comercial e localização

export interface CondicaoComercial {
  entrada_percentual: number | string | null;
  parcelas_max: number | string | null;
}

/** "10% de entrada e o restante em até 240x direto com a loteadora, sem banco, sujeito a análise". */
export function textoCondicao(c: CondicaoComercial | null | undefined): string | null {
  if (!c) return null;
  const entrada = Number(c.entrada_percentual);
  const parcelas = Number(c.parcelas_max);
  if (!Number.isFinite(entrada) || !Number.isFinite(parcelas) || parcelas <= 0) return null;
  const pct = String(Math.round(entrada * 100) / 100).replace(".", ",");
  return `${pct}% de entrada e o restante em até ${Math.round(parcelas)}x direto com a loteadora, sem banco, sujeito a análise`;
}

export function linkMaps(latitude: number | string, longitude: number | string): string {
  return `https://www.google.com/maps/search/?api=1&query=${Number(latitude)},${Number(longitude)}`;
}

// ---------------------------------------------------------------------------
// Visita

/** "sábado, 07/11 às 10h" a partir de YYYY-MM-DD e HH:MM. */
export function descreverVisita(dataIso: string, hora: string): string {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia, 12));
  const dias = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const [h, m] = hora.split(":");
  const horaTxt = m && m !== "00" ? `${Number(h)}h${m}` : `${Number(h)}h`;
  return `${dias[d.getUTCDay()]}, ${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")} às ${horaTxt}`;
}

/** Instante da visita no fuso de Paraty (-03:00, sem horário de verão). */
export function instanteDaVisita(dataIso: string, hora: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataIso) || !/^\d{1,2}:\d{2}$/.test(hora)) return null;
  const [h, m] = hora.split(":");
  const d = new Date(`${dataIso}T${h.padStart(2, "0")}:${m}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
