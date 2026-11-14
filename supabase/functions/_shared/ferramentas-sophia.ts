// Ferramentas da Sophia (function calling) e níveis de autonomia.
//
// Antes, tudo o que a Sophia sabia precisava caber no prompt de uma vez, e uma
// lista de lotes vazia virava "vou checar com a equipe" em toda resposta. Com
// ferramentas ela consulta o estoque com filtro, busca na base o que não veio
// no prompt, grava no CRM o que o lead contou e vê horários livres de verdade.
//
// O quanto ela pode fazer é configurado no painel (ai_agents.autonomia):
//   responder  — conversa, tira dúvidas e pré-qualifica; não mexe no CRM
//   qualificar — + grava os dados do lead e marca como qualificado
//   agendar    — + vê horários livres e marca a visita (padrão)
// Opt-out e transferência para humano valem em todos os níveis.
//
// As partes puras (definições, filtros, horários) são testadas em node
// (ferramentas-sophia.test.ts); os executores recebem o cliente do Supabase.

import type { JanelasVisita } from "./janela-visita.ts";
import { conflitaComAgenda, dentroDaJanela, minutosDoHorario } from "./janela-visita.ts";
import { proximosDias } from "./data-br.ts";

export const NIVEIS_AUTONOMIA = ["responder", "qualificar", "agendar"] as const;
export type NivelAutonomia = (typeof NIVEIS_AUTONOMIA)[number];
export const AUTONOMIA_PADRAO: NivelAutonomia = "agendar";

export function nivelAutonomia(valor: unknown): NivelAutonomia {
  return NIVEIS_AUTONOMIA.find((n) => n === valor) ?? AUTONOMIA_PADRAO;
}

/** O nível permite pelo menos `minimo`? */
export function permite(nivel: NivelAutonomia, minimo: NivelAutonomia): boolean {
  return NIVEIS_AUTONOMIA.indexOf(nivel) >= NIVEIS_AUTONOMIA.indexOf(minimo);
}

// ---------------------------------------------------------------------------
// Definições (formato tools da OpenAI, strict)

const nulo = <T extends Record<string, unknown>>(tipo: T) => ({
  ...tipo,
  type: [tipo.type, "null"],
});

const CONSULTAR_LOTES = {
  type: "function",
  function: {
    name: "consultar_lotes",
    description:
      "Consulta em tempo real os lotes disponíveis (metragem, quadra, tipo). Use quando o lead perguntar opções, tamanhos ou disponibilidade, ou antes de apresentar uma opção. Nunca devolve preço nem número de lote.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["metragem_min", "metragem_max", "quadra"],
      properties: {
        metragem_min: nulo({ type: "number", description: "Metragem mínima em m², ou null" }),
        metragem_max: nulo({ type: "number", description: "Metragem máxima em m², ou null" }),
        quadra: nulo({ type: "string", description: "Quadra específica, ou null" }),
      },
    },
  },
} as const;

const BUSCAR_INFORMACAO = {
  type: "function",
  function: {
    name: "buscar_informacao",
    description:
      "Busca na base de conhecimento oficial do empreendimento (localização, infraestrutura, documentação, regras do condomínio, região). Use quando a resposta não estiver no conteúdo que você já recebeu.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["pergunta"],
      properties: { pergunta: { type: "string", description: "O que você quer descobrir" } },
    },
  },
} as const;

const REGISTRAR_DADOS_LEAD = {
  type: "function",
  function: {
    name: "registrar_dados_lead",
    description:
      "Grava no CRM o que o lead contou nesta conversa. Chame assim que ele disser algo novo (nome, cidade, objetivo, tamanho, como conheceu, prazo). Só preencha o que ele disse; o resto vai null.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["nome", "cidade", "objetivo", "metragem_interesse", "canal_origem", "observacao"],
      properties: {
        nome: nulo({ type: "string" }),
        cidade: nulo({ type: "string", description: "Cidade onde mora" }),
        objetivo: {
          type: ["string", "null"],
          enum: ["moradia", "investimento", "temporada", null],
        },
        metragem_interesse: nulo({
          type: "string",
          description:
            'Tamanho em m², com número: "360", "12x30", "entre 300 e 450". Sem número, não preencha.',
        }),
        canal_origem: nulo({
          type: "string",
          description: "Instagram, Google, indicação, site...",
        }),
        observacao: nulo({
          type: "string",
          description:
            "Algo útil para o vendedor: prazo de compra, com quem decide, preferência de quadra",
        }),
      },
    },
  },
} as const;

const VER_HORARIOS_VISITA = {
  type: "function",
  function: {
    name: "ver_horarios_visita",
    description:
      "Lista horários de visita livres nos próximos dias, já dentro das janelas de visita e sem conflito com a agenda. Use antes de propor dia e hora.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["data"],
      properties: {
        data: nulo({
          type: "string",
          description: "Dia específico YYYY-MM-DD, ou null para os próximos dias",
        }),
      },
    },
  },
} as const;

const QUALIFICAR_LEAD = {
  type: "function",
  function: {
    name: "qualificar_lead",
    description:
      "Marca o lead como qualificado no CRM (etapa Qualificado) e avisa o consultor. Chame quando souber nome, cidade, objetivo e tamanho de interesse, ou quando ele já disse que quer visitar ou comprar em breve.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["resumo"],
      properties: {
        resumo: {
          type: "string",
          description: "Uma linha para o consultor: o que o lead procura e por que está pronto",
        },
      },
    },
  },
} as const;

const REGISTRAR_RECUSA = {
  type: "function",
  function: {
    name: "registrar_recusa",
    description:
      'Registra que o lead recusou a visita ("visita") ou disse que não tem interesse em seguir ("sem_interesse"). Não é opt-out: para "não quero mais mensagens" use bloquear_contato.',
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["tipo"],
      properties: { tipo: { type: "string", enum: ["visita", "sem_interesse"] } },
    },
  },
} as const;

const AGENDAR_VISITA = {
  type: "function",
  function: {
    name: "agendar_visita",
    description:
      "Marca a visita na Agenda com o consultor. Use quando o lead aceitar um dia e horário. Devolve se ficou confirmada ou 'a confirmar', com endereço, link do mapa e nome do consultor. Só diga que está agendado depois do retorno ok=true.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["data", "hora", "acompanhantes", "observacao"],
      properties: {
        data: { type: "string", description: "Dia da visita, YYYY-MM-DD (leia no calendário)" },
        hora: { type: "string", description: "Horário HH:MM, no fuso de Paraty" },
        acompanhantes: nulo({
          type: "integer",
          description: "Quantas pessoas vêm junto além do lead, ou null",
        }),
        observacao: nulo({
          type: "string",
          description: 'Ex.: "vem com a esposa", "quer ver lotes de 360m²"',
        }),
      },
    },
  },
} as const;

const TRANSFERIR_PARA_HUMANO = {
  type: "function",
  function: {
    name: "transferir_para_humano",
    description:
      "Passa a conversa para o consultor: a IA pausa nesta conversa e o consultor é avisado. Use quando o lead pedir uma pessoa, aceitar falar com o consultor ou quando o assunto fugir do que você pode resolver.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["motivo"],
      properties: {
        motivo: { type: "string", description: "Por que a conversa vai para uma pessoa" },
      },
    },
  },
} as const;

const BLOQUEAR_CONTATO = {
  type: "function",
  function: {
    name: "bloquear_contato",
    description:
      'O lead pediu para não receber mais mensagens ("não quero mais", "me tira da lista", "para de mandar"). Bloqueia o contato e encerra. A despedida é enviada automaticamente.',
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["motivo"],
      properties: { motivo: { type: "string" } },
    },
  },
} as const;

export const TIPOS_MIDIA = ["localizacao", "foto", "video_drone", "video_lote", "pdf"] as const;
export type TipoMidia = (typeof TIPOS_MIDIA)[number];

const ENVIAR_MIDIA = {
  type: "function",
  function: {
    name: "enviar_midia",
    description:
      "Envia ao lead um material cadastrado pela equipe: localização (pin no mapa), fotos, vídeo de drone, vídeo do lote demarcado ou PDF. Use quando ele pedir, ou quando morar longe e estiver em dúvida se vale a viagem.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["tipo"],
      properties: { tipo: { type: "string", enum: [...TIPOS_MIDIA] } },
    },
  },
} as const;

export type NomeFerramenta =
  | "consultar_lotes"
  | "buscar_informacao"
  | "registrar_dados_lead"
  | "ver_horarios_visita"
  | "qualificar_lead"
  | "registrar_recusa"
  | "agendar_visita"
  | "transferir_para_humano"
  | "bloquear_contato"
  | "enviar_midia";

/** Ferramentas que só leem (rodam na hora) — as outras viram ação pendente. */
export const FERRAMENTAS_DE_LEITURA = new Set<string>([
  "consultar_lotes",
  "buscar_informacao",
  "ver_horarios_visita",
]);

/**
 * Ferramentas oferecidas ao modelo em cada nível. Transferir, bloquear,
 * registrar recusa e enviar material valem em todos os níveis.
 */
export function ferramentasDoNivel(nivel: NivelAutonomia, opcoes: { comMidia?: boolean } = {}) {
  return [
    CONSULTAR_LOTES,
    BUSCAR_INFORMACAO,
    ...(permite(nivel, "qualificar") ? [REGISTRAR_DADOS_LEAD, QUALIFICAR_LEAD] : []),
    ...(permite(nivel, "agendar") ? [VER_HORARIOS_VISITA, AGENDAR_VISITA] : []),
    REGISTRAR_RECUSA,
    TRANSFERIR_PARA_HUMANO,
    BLOQUEAR_CONTATO,
    ...(opcoes.comMidia ? [ENVIAR_MIDIA] : []),
  ];
}

/** Instruções de uso das ferramentas e do que o nível permite (vai no prompt). */
export function blocoFerramentas(nivel: NivelAutonomia): string {
  const linhas = [
    "---",
    "SUAS FERRAMENTAS E O QUE VOCÊ PODE FAZER",
    "",
    'Você tem ferramentas. Use-as em vez de travar a conversa ou prometer "vou confirmar com a equipe":',
    "- consultar_lotes: estoque real, com filtro de metragem e quadra. Quando o lead perguntar as opções, CONSULTE e MOSTRE já, mesmo que você ainda não saiba tudo sobre ele.",
    "- buscar_informacao: base oficial do empreendimento, para qualquer dúvida que o conteúdo já recebido não responda.",
  ];
  if (permite(nivel, "qualificar")) {
    linhas.push(
      "- registrar_dados_lead: assim que o lead contar algo novo (nome, cidade, objetivo, tamanho, canal, prazo), registre. O vendedor vê no CRM na hora.",
      "- qualificar_lead: quando souber nome, cidade, objetivo e tamanho — ou quando ele já disse que quer visitar ou comprar em breve.",
    );
  }
  if (permite(nivel, "agendar")) {
    linhas.push(
      "- ver_horarios_visita: horários livres de verdade. Consulte antes de propor dia e hora e ofereça duas ou três opções concretas.",
      "- agendar_visita: quando o lead aceitar dia e hora. Só diga que está agendado depois que ela devolver ok=true, e use na resposta o dia, a hora, o endereço, o link do mapa e o nome do consultor que ela devolveu.",
    );
  }
  linhas.push(
    "- registrar_recusa: o lead recusou a visita ou disse que não quer seguir.",
    "- transferir_para_humano: o lead quer falar com uma pessoa ou aceitou falar com o consultor. A mensagem de transferência é enviada automaticamente.",
    "- bloquear_contato: o lead pediu para não receber mais mensagens. A despedida é enviada automaticamente; não escreva outra.",
  );
  linhas.push("");
  if (!permite(nivel, "qualificar")) {
    linhas.push(
      "NÍVEL DESTA CONTA: só conversa. Entenda o que o lead procura e tire dúvidas; não registra, não qualifica e não marca visita.",
      "Se ele quiser visitar, use transferir_para_humano para o consultor combinar o melhor dia.",
    );
  } else if (!permite(nivel, "agendar")) {
    linhas.push(
      "NÍVEL DESTA CONTA: qualificar e registrar. Não marque visita.",
      "Se ele quiser visitar, use transferir_para_humano para o consultor combinar o melhor dia.",
    );
  } else {
    linhas.push(
      "NÍVEL DESTA CONTA: qualificar, registrar e agendar. Quando o lead aceitar um horário, chame agendar_visita.",
    );
  }
  linhas.push(
    "",
    'Nunca mencione as ferramentas, o CRM ou que está "registrando" algo. Para o lead, é só uma conversa.',
  );
  return linhas.join("\n");
}

// ---------------------------------------------------------------------------
// Lotes

export interface LoteLinha {
  quadra: string | null;
  metragem: number | null;
  tipo: string | null;
}

export interface FiltroLotes {
  metragem_min: number | null;
  metragem_max: number | null;
  quadra: string | null;
}

/** Agrupa por metragem+tipo, com quadras e quantidade. Sem número de lote nem preço. */
export function resumirLotes(lotes: LoteLinha[], filtro?: Partial<FiltroLotes>) {
  const min = filtro?.metragem_min ?? null;
  const max = filtro?.metragem_max ?? null;
  const quadra = filtro?.quadra ? String(filtro.quadra).trim().toLowerCase() : null;
  const grupos = new Map<
    string,
    { metragem: number; tipo: string; quadras: Set<string>; n: number }
  >();
  for (const l of lotes) {
    if (l.metragem == null) continue;
    const m = Number(l.metragem);
    if (min != null && m < min) continue;
    if (max != null && m > max) continue;
    if (
      quadra &&
      String(l.quadra ?? "")
        .trim()
        .toLowerCase() !== quadra
    )
      continue;
    const tipo = l.tipo ?? "residencial";
    const chave = `${m}|${tipo}`;
    const g = grupos.get(chave) ?? { metragem: m, tipo, quadras: new Set<string>(), n: 0 };
    if (l.quadra) g.quadras.add(String(l.quadra));
    g.n += 1;
    grupos.set(chave, g);
  }
  return [...grupos.values()]
    .sort((a, b) => a.metragem - b.metragem || a.tipo.localeCompare(b.tipo))
    .map((g) => ({
      metragem_m2: g.metragem,
      tipo: g.tipo,
      disponiveis: g.n,
      quadras: [...g.quadras].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)),
    }));
}

// ---------------------------------------------------------------------------
// Horários livres

/** Horários livres (início de visita) nos próximos dias, dentro das janelas e sem conflito. */
export function horariosLivres(
  agora: Date,
  janelas: JanelasVisita,
  ocupados: Date[],
  {
    data = null,
    dias = 8,
    maxPorDia = 4,
    maxDias = 5,
  }: {
    data?: string | null;
    dias?: number;
    maxPorDia?: number;
    maxDias?: number;
  } = {},
): Array<{ data: string; dia_semana: string; horarios: string[] }> {
  // Só o fuso de Paraty é suportado na montagem do instante (Brasil sem horário de verão: -03:00).
  const offset = "-03:00";
  const minimoAntecedencia = agora.getTime() + 2 * 3600_000;
  const saida: Array<{ data: string; dia_semana: string; horarios: string[] }> = [];
  for (const d of proximosDias(agora, dias)) {
    if (data && d.iso !== data) continue;
    const horarios: string[] = [];
    for (const janela of janelas.dias) {
      const ini = minutosDoHorario(janela.inicio);
      const fim = minutosDoHorario(janela.fim);
      if (ini === null || fim === null) continue;
      for (let m = ini; m + janelas.duracao_min <= fim; m += janelas.duracao_min) {
        const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        const momento = new Date(`${d.iso}T${hhmm}:00${offset}`);
        if (momento.getTime() < minimoAntecedencia) continue;
        if (!dentroDaJanela(momento, janelas)) continue;
        if (conflitaComAgenda(momento, ocupados, janelas.duracao_min)) continue;
        if (!horarios.includes(hhmm)) horarios.push(hhmm);
      }
    }
    if (horarios.length) {
      saida.push({
        data: d.iso,
        dia_semana: d.diaSemana,
        horarios: horarios.sort().slice(0, maxPorDia),
      });
    }
    if (saida.length >= maxDias) break;
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Registro no CRM

export interface DadosLead {
  nome: string | null;
  cidade: string | null;
  objetivo: "moradia" | "investimento" | "temporada" | null;
  metragem_interesse: string | null;
  canal_origem: string | null;
  observacao: string | null;
}

const OBJETIVOS = new Set(["moradia", "investimento", "temporada"]);

/**
 * Metragem em m² a partir do que o lead disse: "360m²" → 360, "12x30" → 360,
 * "entre 300 e 450" → 300 (o menor da faixa), "1.000 m2" → 1000. Sem número
 * plausível ("menor disponível", "grande") devolve null e nada é gravado.
 */
export function metragemEmNumero(valor: unknown): number | null {
  const texto = String(valor ?? "").toLowerCase();
  if (!texto.trim()) return null;
  const dimensao = texto.match(/(\d+(?:[.,]\d+)?)\s*(?:x|por)\s*(\d+(?:[.,]\d+)?)/);
  if (dimensao) {
    const a = Number(dimensao[1].replace(",", "."));
    const b = Number(dimensao[2].replace(",", "."));
    const area = Math.round(a * b);
    if (area >= 50 && area <= 100000) return area;
  }
  const numeros = [...texto.matchAll(/\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?/g)]
    .map((m) => Number(m[0].replace(/\./g, "").replace(",", ".")))
    .filter((n) => n >= 50 && n <= 100000);
  if (!numeros.length) return null;
  return Math.round(Math.min(...numeros));
}

/**
 * Patch para `leads` a partir do que o modelo pediu para gravar. Nome só
 * preenche quando o lead ainda não tem nome de verdade (não troca o nome do
 * formulário por um apelido); os outros campos acompanham o que ele disse por
 * último.
 */
export function patchDoLead(
  dados: Partial<DadosLead>,
  atual: { nome?: string | null; telefone?: string | null },
): Record<string, string> {
  const limpo = (v: unknown, max = 120) => {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, max) : null;
  };
  const patch: Record<string, string> = {};
  const nomeAtual = String(atual.nome ?? "").trim();
  const semNome =
    !nomeAtual ||
    /^lead de teste/i.test(nomeAtual) ||
    nomeAtual.replace(/\D/g, "") === String(atual.telefone ?? "").replace(/\D/g, "");
  const nome = limpo(dados.nome, 80);
  if (nome && semNome) patch.nome = nome;
  const cidade = limpo(dados.cidade, 80);
  if (cidade) patch.cidade = cidade;
  if (dados.objetivo && OBJETIVOS.has(dados.objetivo)) patch.objetivo = dados.objetivo;
  // leads.metragem_interesse é numérica: texto ("360m²", "menor disponível")
  // derrubava o registro inteiro, levando junto nome e cidade.
  const metragem = metragemEmNumero(dados.metragem_interesse);
  if (metragem !== null) patch.metragem_interesse = String(metragem);
  const canal = limpo(dados.canal_origem, 60);
  if (canal) patch.canal_origem = canal;
  return patch;
}

/** Linha legível do que foi registrado, para o histórico e para o painel de teste. */
export function resumoDoRegistro(patch: Record<string, string>, observacao: string | null): string {
  const rotulos: Record<string, string> = {
    nome: "nome",
    cidade: "cidade",
    objetivo: "objetivo",
    metragem_interesse: "tamanho",
    canal_origem: "canal",
  };
  const partes = Object.entries(patch).map(([k, v]) => `${rotulos[k] ?? k}: ${v}`);
  if (observacao?.trim()) partes.push(`obs.: ${observacao.trim().slice(0, 200)}`);
  return partes.join(" · ");
}
