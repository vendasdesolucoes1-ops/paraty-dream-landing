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
          description: 'Ex.: "360m²", "entre 300 e 450m²"',
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

export type NomeFerramenta =
  | "consultar_lotes"
  | "buscar_informacao"
  | "registrar_dados_lead"
  | "ver_horarios_visita";

/** Ferramentas oferecidas ao modelo em cada nível. */
export function ferramentasDoNivel(nivel: NivelAutonomia) {
  return [
    CONSULTAR_LOTES,
    BUSCAR_INFORMACAO,
    ...(permite(nivel, "qualificar") ? [REGISTRAR_DADOS_LEAD] : []),
    ...(permite(nivel, "agendar") ? [VER_HORARIOS_VISITA] : []),
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
    );
  }
  if (permite(nivel, "agendar")) {
    linhas.push(
      "- ver_horarios_visita: horários livres de verdade. Consulte antes de propor dia e hora e ofereça duas ou três opções concretas.",
    );
  }
  linhas.push("");
  if (!permite(nivel, "qualificar")) {
    linhas.push(
      "NÍVEL DESTA CONTA: só conversa. Entenda o que o lead procura e tire dúvidas, mas não emita lead_qualificado nem visita_agendada.",
      "Se ele quiser visitar, diga que um consultor vai falar com ele para combinar o melhor dia.",
    );
  } else if (!permite(nivel, "agendar")) {
    linhas.push(
      "NÍVEL DESTA CONTA: qualificar e registrar. Não marque visita nem emita visita_agendada.",
      "Se ele quiser visitar, diga que um consultor vai falar com ele para combinar o melhor dia.",
    );
  } else {
    linhas.push(
      "NÍVEL DESTA CONTA: qualificar, registrar e agendar. Quando o lead aceitar um horário que você ofereceu, confirme e emita visita_agendada.",
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
  const metragem = limpo(dados.metragem_interesse, 60);
  if (metragem) patch.metragem_interesse = metragem;
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
