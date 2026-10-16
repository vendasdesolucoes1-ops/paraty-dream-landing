// Preferências de estilo do agente (ai_agents.tom_voz, usar_emojis, ser_breve)
// viradas em instrução para a Sophia (issue #61).
//
// As colunas existiam desde a migração 20260711000000 mas nenhuma função as
// lia: mudar no banco não mudava nada. Agora ai-agent-chat anexa este bloco ao
// prompt, por fora do prompt base, então vale também com system_prompt
// customizado.
//
// Os valores PADRÃO das colunas (profissional, sem emoji, breve) são
// exatamente o estilo em que o prompt padrão da Sophia já está escrito, então
// não geram linha nenhuma: o prompt de quem nunca mexeu nisso fica idêntico ao
// de antes. Só um valor diferente do padrão acrescenta instrução.
//
// Módulo puro, sem Deno: testado em node (estilo-agente.test.ts).

export const TONS_DE_VOZ = ["profissional", "amigavel", "formal", "informal"] as const;
export type TomVoz = (typeof TONS_DE_VOZ)[number];

export interface PreferenciasEstilo {
  tom_voz?: string | null;
  usar_emojis?: boolean | null;
  ser_breve?: boolean | null;
}

/** Padrões das colunas em ai_agents (migração 20260711000000). */
export const ESTILO_PADRAO = {
  tom_voz: "profissional",
  usar_emojis: false,
  ser_breve: true,
} as const satisfies PreferenciasEstilo;

// "profissional" é o tom do prompt padrão: sem linha extra.
const LINHA_TOM: Record<TomVoz, string> = {
  profissional: "",
  amigavel:
    "- Tom de voz: amigável e caloroso. Fale com proximidade, como quem já conhece o lead, sem perder o respeito.",
  formal:
    '- Tom de voz: formal. Frases completas e corteses, sem gírias nem contrações como "pra" e "tá".',
  informal:
    '- Tom de voz: informal e descontraído. Pode usar gírias leves e contrações ("pra", "tá", "beleza"), como numa conversa entre conhecidos.',
};

const LINHA_EMOJIS =
  '- Emojis: a equipe liberou. Isto substitui a regra de "NENHUM emoji": use no máximo um por resposta, só quando combinar com o que o lead disse, e nunca ao falar de preço, recusa ou problema.';

const LINHA_NAO_BREVE =
  "- Tamanho: a equipe prefere respostas mais completas. Quando o lead perguntar algo concreto, explique com mais detalhe — mas continue separando em mensagens curtas com ||.";

function tomValido(valor: unknown): TomVoz {
  return TONS_DE_VOZ.find((t) => t === valor) ?? ESTILO_PADRAO.tom_voz;
}

/**
 * Bloco de estilo para o system prompt. String vazia quando tudo está no
 * padrão (ou com valor inválido/nulo, que é tratado como padrão).
 */
export function blocoEstiloAgente(preferencias: PreferenciasEstilo | null | undefined): string {
  const p = preferencias ?? {};
  const linhas = [
    LINHA_TOM[tomValido(p.tom_voz)],
    p.usar_emojis === true ? LINHA_EMOJIS : "",
    p.ser_breve === false ? LINHA_NAO_BREVE : "",
  ].filter(Boolean);

  if (linhas.length === 0) return "";

  return [
    "═══ PREFERÊNCIAS DE ESTILO DA EQUIPE ═══",
    "Configuradas no painel do agente. Quando conflitarem com as regras de estilo acima, valem estas.",
    ...linhas,
  ].join("\n");
}
