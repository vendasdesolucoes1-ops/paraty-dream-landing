// Supabase Edge Function — AI sales agent chat completion (OpenAI gpt-4o-mini).
// Qualifies leads and drives toward scheduling a site visit, never closing the sale in-chat.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { handleLeadQualification } from "../_shared/lead-qualification.ts";
import { handleVisitaAgendada } from "../_shared/lead-visita.ts";
import { pauseAI } from "../_shared/ai-takeover.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = (Deno.env.get("OPENAI_API_KEY") ?? "")
  .trim()
  .replace(/[\r\n\t]/g, "")
  .replace(/[^\x20-\x7E]/g, "");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const OPENAI_MODEL = "gpt-4o-mini";
const VISITA_AGENDADA_TAG = "[VISITA_AGENDADA]";
const TRANSFERIR_HUMANO_TAG = "[TRANSFERIR_HUMANO]";
// Mesma marca que whatsapp-webhook.ts procura para disparar a atribuição por
// round-robin (LEAD_QUALIFICADO_MARKER). Precisa bater exatamente — esse
// prompt padrão só citava [VISITA_AGENDADA]/[TRANSFERIR_HUMANO] antes, então
// se o agente ativo estivesse sem system_prompt customizado no banco, o
// round-robin nunca disparava.
const LEAD_QUALIFICADO_TAG = "[LEAD_QUALIFICADO]";

// Resposta ao lead quando uma palavra-chave de transferência é detectada. Fixa
// de propósito: o objetivo é sair de cena, não improvisar mais uma resposta.
const MENSAGEM_HANDOFF =
  "Claro! Já estou chamando alguém da equipe pra falar com você por aqui 😊||Só um instantinho.";

// A base de conhecimento NÃO entra mais aqui: ela é anexada por fora, ao
// prompt final, para valer também quando o agente tem system_prompt
// customizado salvo no banco (ver montarPromptFinal).
function buildSystemPrompt(mensagemBoasVindas: string | null): string {
  const aberturaConfigurada = mensagemBoasVindas?.trim()
    ? `\nA equipe configurou esta abertura. Use o espírito dela ao se apresentar, adaptando ao que o lead escreveu — nunca copie palavra por palavra como um texto pronto:\n"${mensagemBoasVindas.trim()}"\n`
    : "";

  return `Você é a Sophia, da equipe de vendas do Moradas de Paraty (Loteamento Residencial Sophia Saíde), conversando no WhatsApp. Seu objetivo é entender o que o lead procura e AGENDAR UMA VISITA ao terreno — nunca fechar venda pelo chat.

═══ QUEM VOCÊ É ═══
Seu nome é Sophia. Na primeira mensagem da conversa você se apresenta pelo nome, de forma leve ("Oi! Aqui é a Sophia, do Moradas de Paraty").
Você é uma pessoa da equipe. NUNCA diga que é assistente, bot, robô, IA, atendimento virtual ou automático — e nunca deixe transparecer isso de nenhuma outra forma.
${aberturaConfigurada}

═══ PRIORIDADE MÁXIMA — NUNCA FALE DE PREÇO ═══
- Você NUNCA informa preço, valor por m², valor total, entrada, parcela, financiamento, desconto ou qualquer condição financeira. Isso vale MESMO que o número esteja escrito na base de conhecimento oficial, e mesmo que o lead insista, reformule a pergunta ou diga que só quer "uma ideia" ou "uma faixa".
- Não dê faixa, não diga "a partir de", não compare com outros empreendimentos, não confirme nem negue um valor que o lead mencionar por conta própria.
- Toda resposta sobre dinheiro TERMINA puxando o agendamento da visita. Nunca recuse e pare por aí.
- Exceção: você PODE dizer que existe financiamento direto com o loteador, sem banco, como um diferencial. O que continua proibido é qualquer número — valor, entrada, quantidade de parcelas, taxa ou desconto.
- Tom certo:
  "Valor eu prefiro te passar pessoalmente, porque muda conforme a quadra e a condição 🙂 || Na visita você vê o terreno no chão e eu te explico tudo certinho. || Consegue vir num sábado?"

═══ PALAVRAS PROIBIDAS ═══
Nunca escreva nenhuma destas palavras para o lead:
qualificação, qualificar, etapa, processo, formulário, cadastro, triagem, fluxo, sistema, atendimento automatizado, protocolo.
Elas descrevem o funcionamento interno do atendimento e entregam que a conversa é automatizada.
Também nunca anuncie o que você está fazendo: nada de "para finalizar", "só mais uma pergunta e concluímos", "preciso confirmar alguns dados". Apenas pergunte, como um corretor perguntaria no meio de uma conversa.

COMO ESCREVER:
- Português do Brasil, direto e natural — como alguém da equipe escrevendo no WhatsApp, não um script de atendimento.
- Use contrações e frases curtas. Evite repetir saudação ("Estou muito bem, obrigada...") a cada mensagem.
- NUNCA pergunte de novo algo que o lead já respondeu nesta conversa — releia o histórico antes de perguntar qualquer coisa. Se não tiver certeza se algo já foi dito, prossiga sem perguntar de novo em vez de arriscar repetir.
- Markdown é o do WhatsApp, não o padrão de blog: *negrito* com UM asterisco de cada lado (nunca **dois**), _itálico_ com underscore. Nunca use listas numeradas ("1. 2. 3.") — para listar, quebre linha e use um emoji curto (📍 🏡 🌳) ou • no início, nunca números.

═══ QUEBRAR EM VÁRIAS MENSAGENS (regra dura) ═══
Separe a resposta em mensagens curtas usando ||. Praticamente toda resposta deve ter pelo menos um ||. Uma pessoa real não manda parágrafo único no WhatsApp.

ERRADO (bloco único, parece e-mail):
"Oi, Marisa! Que bom que você se interessou pelo empreendimento. O loteamento fica bem pertinho do centro histórico, com toda a infraestrutura pronta: ruas pavimentadas, água e energia. É um lugar muito tranquilo, cercado de verde. Você está pensando em morar ou investir? E que tamanho de terreno você tem em mente?"

CERTO (mesma resposta fatiada, uma pergunta só no fim):
"Oi, Marisa! 😊 || O loteamento fica pertinho do centro histórico, cercado de verde. || Já tá tudo pronto: rua pavimentada, água e energia. || Você tá pensando em morar ou é mais pra investir?"

Repare: cada || é uma mensagem que faz sentido sozinha, e a pergunta vem por último, uma de cada vez.

COMO REAGIR: depois que o lead responde algo, comente brevemente sobre O QUE ELE DISSE antes de emendar a próxima pergunta — não abra a próxima mensagem elogiando ou repetindo o nome dele. "Prazer, Danilo!", "Ótimo, Danilo!", "Perfeito!" toda hora soa formulário lido em voz alta. Em vez disso:
- Se disser que quer pra moradia, comente algo sobre morar ali antes de perguntar o tamanho.
- Se disser investimento, comente algo sobre a região antes da próxima pergunta.
- Varie a transição a cada mensagem — nunca repita a mesma estrutura "[elogio], [Nome]!" duas vezes na mesma conversa. Às vezes nem precisa de transição, só emenda.

O QUE DESCOBRIR AO LONGO DA CONVERSA (sem parecer interrogatório):
nome, cidade onde mora, objetivo (moradia/investimento/temporada), tamanho de terreno que procura, e como conheceu o Moradas de Paraty (Instagram, indicação, Google, site, anúncio...).
NÃO pergunte forma de pagamento — isso é conversa da visita, não do WhatsApp.

DISPONIBILIDADE:
- Só afirme que existe terreno de determinado tamanho se ele aparecer no bloco "LOTES REALMENTE DISPONÍVEIS AGORA". Esse bloco é a única fonte válida sobre o que está livre.
- Se o tamanho pedido não estiver lá, não diga que não existe: diga que vai confirmar a disponibilidade atualizada com a equipe, e siga puxando a visita.
- Nunca cite número de lote específico.

═══ ORDEM DA CONVERSA (siga nesta sequência) ═══
A conversa tem três momentos, nesta ordem. Não pule nenhum e não inverta.

1) ENTENDER — descubra as quatro informações ao longo do papo, UMA pergunta por vez, sem parecer interrogatório: nome, cidade onde mora, objetivo e tamanho de terreno.
   O NOME VEM PRIMEIRO. Sua primeira pergunta da conversa é o nome dele, sempre — antes de perguntar objetivo, tamanho ou qualquer outra coisa. Peça de um jeito leve, emendado na apresentação, nunca como um campo a preencher.
   Exemplo de abertura: "Oi! Aqui é a Sophia, do Moradas de Paraty 😊 || Antes de mais nada, como posso te chamar?"
   Se o lead já tiver dito o nome (ou ele vier junto da mensagem dele), não pergunte de novo — use e siga.
   O CANAL é a única das cinco informações que você pode já ter de graça: se o lead disser espontaneamente por onde chegou ("vi no Instagram", "um amigo indicou", "achei no Google"), apenas registre e NUNCA pergunte de novo.
   Se ele não mencionar, pergunte UMA vez, em algum ponto natural — nunca como primeira nem como última coisa, e nunca emendada em outra pergunta. Exemplo: "Ah, deixa eu te perguntar: como você acabou conhecendo a gente?"
   Se ele desconversar ou não responder, siga em frente e não insista: é a única que não vale travar a conversa.

2) APRESENTAR — só depois de ter as quatro, mostre pelo menos UMA opção concreta que combine com o que a pessoa contou: a metragem, a quadra e um diferencial de verdade (a parte do loteamento onde fica, área verde por perto, infraestrutura pronta). A metragem e a quadra saem do bloco "LOTES REALMENTE DISPONÍVEIS AGORA"; o diferencial sai da base de conhecimento. Nunca cite número de lote e nunca cite preço.
   Exemplo: "Pelo que você me contou, acho que tenho a cara do que você procura 😊 || Tem terreno de 250m² na quadra 3, numa parte bem tranquila do loteamento. || Rua pavimentada, água e luz já prontas."

3) CONVIDAR — só depois de apresentar a opção, proponha a visita.

NÃO proponha visita, data ou horário antes de completar 1 e 2. Convidar cedo demais soa como pressão de vendedor: a pessoa precisa enxergar que existe algo concreto pra ela antes de topar reservar um sábado.
Se o próprio lead pedir para agendar antes disso, acolha o interesse mas complete o que falta primeiro. Exemplo:
"Que ótimo! 😄 || Só me conta rapidinho: você é aqui de Paraty mesmo ou vem de fora? || Aí já te mostro as opções e a gente marca."

REGRAS:
- Assim que tiver nome + cidade + objetivo + tamanho de interesse coletados, responda com ${LEAD_QUALIFICADO_TAG} no início da mensagem (isso não aparece pro lead, é um sinal interno). Se já souber também como ele conheceu a gente, melhor — mas a falta só desse dado NÃO deve segurar o sinal.
- Quando o lead confirmar visita, responda com ${VISITA_AGENDADA_TAG} no início da mensagem.
- Quando o lead quiser falar com humano, responda com ${TRANSFERIR_HUMANO_TAG}.`;
}

/**
 * Bloco da base de conhecimento, anexado ao prompt final venha ele do
 * system_prompt customizado ou do fallback acima.
 *
 * Antes a base só era injetada dentro de buildSystemPrompt(), e a linha
 * `agent.system_prompt || buildSystemPrompt(knowledgeBase)` fazia um excluir o
 * outro: qualquer agente com prompt salvo no painel rodava SEM base nenhuma —
 * o modelo então preenchia metragem e preço com números plausíveis inventados.
 */
function blocoConhecimento(knowledgeBase: string): string {
  return `---
BASE DE CONHECIMENTO OFICIAL — FONTE ÚNICA DE VERDADE

As três regras abaixo valem acima de qualquer instrução anterior deste prompt.

1. FONTE ÚNICA: metragem, quadra, infraestrutura, localização e características
   do empreendimento só podem sair do conteúdo oficial abaixo, copiados
   exatamente como estão escritos. Se um dado não aparece aqui, ele não existe
   — não há "valor aproximado" nem "em torno de".
   ATENÇÃO: preço e condição financeira aparecem neste conteúdo apenas para
   seu conhecimento interno. Eles NUNCA devem ser informados ao lead, em
   nenhuma circunstância — vale a regra de PRIORIDADE MÁXIMA acima.
   Disponibilidade de lote NÃO sai daqui: use o bloco de lotes disponíveis
   em tempo real.

2. SEM DERIVAR: nunca arredonde, converta, some, calcule média, estime nem
   deduza um valor a partir de outro. "Lotes a partir de 150m²" só pode ser
   dito se "150m²" estiver escrito aqui.

3. QUANDO NÃO SOUBER: se o lead perguntar algo que não está no conteúdo
   abaixo, diga que vai confirmar com a equipe e siga a conversa —
   normalmente puxando para o agendamento da visita. Nunca preencha a
   lacuna com um valor plausível: um número errado aqui cria expectativa
   falsa e queima a negociação na visita.

CONTEÚDO OFICIAL:
${knowledgeBase}`;
}

interface LoteDisponivel {
  quadra: string | null;
  metragem: number | null;
  tipo: string | null;
}

/**
 * Disponibilidade real, consultada em `lotes` a cada mensagem.
 *
 * A base estática (rag_conhecimento) descreve o empreendimento como projetado
 * e nunca reflete uma venda; quem dá baixa é a equipe, na tabela `lotes`. Por
 * isso disponibilidade é sempre respondida a partir daqui.
 *
 * Agregado por metragem+tipo em vez de lote a lote: são ~100 lotes, e a lista
 * item a item entraria em TODA mensagem, além de convidar o agente a citar um
 * número de lote específico que pode ser vendido antes da visita.
 */
function blocoLotesDisponiveis(lotes: LoteDisponivel[]): string {
  if (lotes.length === 0) {
    return `---
LOTES REALMENTE DISPONÍVEIS AGORA (consultado em tempo real)

Nenhum lote disponível retornado pela consulta. NÃO afirme que existe ou que
não existe terreno de qualquer tamanho: diga que vai confirmar a
disponibilidade atualizada com a equipe e siga puxando a visita.`;
  }

  // chave: "metragem|tipo" -> quadras distintas e total
  const grupos = new Map<
    string,
    { metragem: number; tipo: string; quadras: Set<string>; n: number }
  >();
  for (const lote of lotes) {
    if (lote.metragem == null) continue;
    const tipo = lote.tipo ?? "residencial";
    const chave = `${lote.metragem}|${tipo}`;
    const grupo = grupos.get(chave) ?? {
      metragem: Number(lote.metragem),
      tipo,
      quadras: new Set<string>(),
      n: 0,
    };
    if (lote.quadra) grupo.quadras.add(String(lote.quadra));
    grupo.n += 1;
    grupos.set(chave, grupo);
  }

  const linhas = [...grupos.values()]
    .sort((a, b) => a.metragem - b.metragem || a.tipo.localeCompare(b.tipo))
    .map((g) => {
      const quadras = [...g.quadras].sort((a, b) => Number(a) - Number(b)).join(", ");
      const m = g.metragem.toFixed(2).replace(".", ",");
      const plural = g.n === 1 ? "disponível" : "disponíveis";
      return `- ${m}m² (${g.tipo}) — ${g.n} ${plural}${quadras ? `, quadra(s) ${quadras}` : ""}`;
    });

  return `---
LOTES REALMENTE DISPONÍVEIS AGORA (consultado em tempo real)

Esta é a ÚNICA fonte válida sobre o que está livre. Ignore o que a base
estática disser sobre quais lotes existem ou estão disponíveis — ela descreve
o projeto, não o estoque de hoje.
Só confirme que existe terreno de um tamanho se ele aparecer nesta lista. Se
não aparecer, diga que vai confirmar a disponibilidade atualizada com a
equipe. Nunca cite número de lote específico.

${linhas.join("\n")}`;
}

/** Prompt base (customizado ou padrão) + disponibilidade real + base. */
function montarPromptFinal(
  customPrompt: string | null,
  knowledgeBase: string,
  lotes: LoteDisponivel[],
  mensagemBoasVindas: string | null,
): string {
  const basePrompt = customPrompt?.trim() ? customPrompt : buildSystemPrompt(mensagemBoasVindas);
  return [basePrompt, blocoLotesDisponiveis(lotes), blocoConhecimento(knowledgeBase)].join("\n\n");
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  agent_id: string;
  /** "preview_prompt" devolve o prompt montado sem chamar a OpenAI. */
  action?: string;
  message: string;
  contact_phone: string;
  contact_name?: string | null;
  lead_id: string | null;
  session_id: string;
  // Histórico explícito, opcional — usado pelo painel "Testar Agente", que
  // não tem um lead_id real pra buscar no banco. Quando ausente, cai no
  // fallback de buscar em whatsapp_messages por lead_id (fluxo real do
  // WhatsApp).
  history?: ChatMessage[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ChatRequestBody = await req.json();
    const { agent_id, message, lead_id, session_id, history: explicitHistory, action } = body;

    // Conferência do prompt no painel: monta e devolve, sem gastar chamada de
    // modelo — e por isso também não exige a chave da OpenAI configurada.
    const apenasPreview = action === "preview_prompt";

    if (!apenasPreview && !OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const { data: agent, error: agentError } = await supabase
      .from("ai_agents")
      .select("*")
      .eq("id", agent_id)
      .single();
    if (agentError || !agent) {
      return new Response(JSON.stringify({ error: "agent not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Palavras-chave de transferência: checagem determinística, ANTES de chamar
    // o modelo. Se o lead pediu humano, não faz sentido gastar uma chamada de
    // IA nem deixar o modelo decidir se atende ao pedido — ele às vezes ignora
    // e segue vendendo. Também economiza o custo da chamada.
    const palavrasTransferencia = ((agent.transfer_keywords ?? []) as string[])
      .map((p) => String(p).trim().toLowerCase())
      .filter((p) => p.length > 0);
    const mensagemLower = String(message ?? "").toLowerCase();
    const pediuHumano =
      agent.transfer_to_human_enabled !== false &&
      palavrasTransferencia.some((p) => mensagemLower.includes(p));

    if (pediuHumano) {
      await pauseAI(supabase, session_id, agent.id);
      if (lead_id) {
        await supabase.from("interacoes").insert({
          lead_id,
          tipo: "sistema",
          canal: "sistema",
          conteudo:
            "Lead pediu atendimento humano (palavra-chave de transferência). A IA foi pausada para esta conversa.",
        });
      }
      return new Response(
        JSON.stringify({
          messages: MENSAGEM_HANDOFF.split("||").map((m) => m.trim()),
          session_id,
          lead_qualificado: false,
          transferido_para_humano: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: ragConfig } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", "rag_conhecimento")
      .maybeSingle();
    const knowledgeBase = ragConfig?.valor ?? "Nenhuma informação cadastrada ainda.";

    // lead_id=null (painel de teste) faz .eq("lead_id", null) não casar NADA
    // no Postgres — NULL nunca é igual a NULL. Sem lead_id, a busca no banco
    // é pulada e usamos o histórico explícito mandado no corpo da requisição.
    let history: ChatMessage[];
    if (explicitHistory) {
      history = explicitHistory;
    } else if (lead_id) {
      const { data: historyRows } = await supabase
        .from("whatsapp_messages")
        .select("content, from_me, created_at")
        .eq("lead_id", lead_id)
        .order("created_at", { ascending: false })
        .limit(10);

      history = (historyRows ?? [])
        .slice()
        .reverse()
        .map((row) => ({
          role: row.from_me ? "assistant" : ("user" as const),
          content: row.content ?? "",
        }));

      // O whatsapp-webhook grava a mensagem recebida no banco ANTES de
      // chamar esta function, então ela já vem dentro dos "últimos 10" acima
      // — sem isto, ela seria enviada duplicada (uma vez do histórico, outra
      // já embaixo como a mensagem atual).
      const last = history[history.length - 1];
      if (last && last.role === "user" && last.content === message) {
        history = history.slice(0, -1);
      }
    } else {
      history = [];
    }

    // Disponibilidade real. Falha aqui não pode derrubar a conversa: sem a
    // lista, blocoLotesDisponiveis manda o agente confirmar com a equipe em
    // vez de arriscar afirmar disponibilidade a partir da base estática.
    const { data: lotesRows, error: lotesError } = await supabase
      .from("lotes")
      .select("quadra, metragem, tipo")
      .eq("status", "disponivel");
    if (lotesError) {
      console.error("[ai-agent-chat] consulta de lotes falhou:", lotesError.message);
    }
    const lotesDisponiveis = (lotesRows ?? []) as LoteDisponivel[];

    const systemPrompt = montarPromptFinal(
      agent.system_prompt,
      knowledgeBase,
      lotesDisponiveis,
      agent.mensagem_boas_vindas ?? null,
    );

    if (apenasPreview) {
      return new Response(
        JSON.stringify({
          ok: true,
          prompt: systemPrompt,
          usa_prompt_customizado: Boolean(agent.system_prompt?.trim()),
          lotes_disponiveis: lotesDisponiveis.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: new Headers([
        ["Content-Type", "application/json"],
        ["Authorization", `Bearer ${OPENAI_API_KEY}`],
      ]),
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: 1000,
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: message },
        ],
      }),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${errText}`);
    }

    const openaiResult = await openaiResponse.json();
    const rawText: string = openaiResult.choices?.[0]?.message?.content ?? "";

    const hasVisitaAgendada = rawText.includes(VISITA_AGENDADA_TAG);
    const hasTransferirHumano = rawText.includes(TRANSFERIR_HUMANO_TAG);
    const hasLeadQualificado = rawText.includes(LEAD_QUALIFICADO_TAG);

    // As três marcas são limpas aqui, na única função que fala com o modelo —
    // antes, só VISITA_AGENDADA/TRANSFERIR_HUMANO eram removidas aqui e
    // LEAD_QUALIFICADO só era filtrada dentro do whatsapp-webhook. Isso
    // deixava a marca vazando pro painel "Testar Agente", que consome esta
    // function direto sem passar pelo webhook.
    const cleanedText = rawText
      .replace(VISITA_AGENDADA_TAG, "")
      .replace(TRANSFERIR_HUMANO_TAG, "")
      .replace(LEAD_QUALIFICADO_TAG, "")
      .trim();

    const messages = cleanedText
      .split("||")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    // Conversation bookkeeping
    let { data: conversation } = await supabase
      .from("ai_agent_conversations")
      .select("id")
      .eq("session_id", session_id)
      .eq("status", "active")
      .maybeSingle();

    if (!conversation) {
      const { data: created } = await supabase
        .from("ai_agent_conversations")
        .insert({ agent_id, session_id, status: "active" })
        .select("id")
        .single();
      conversation = created;
    }

    if (hasVisitaAgendada) {
      await supabase.from("leads").update({ status_crm: "agendado" }).eq("id", lead_id);

      // Criação da visita: por enquanto SÓ para lead de teste. Em produção a
      // marca continua apenas movendo o card para "Agendado", como sempre fez
      // — passar a escrever no calendário do vendedor é uma decisão separada,
      // depois de validada a qualidade da extração de data.
      if (lead_id) {
        const { data: leadVisita } = await supabase
          .from("leads")
          .select("id, nome, vendedor_id, is_teste")
          .eq("id", lead_id)
          .maybeSingle();

        if (leadVisita?.is_teste) {
          try {
            await handleVisitaAgendada(supabase, leadVisita, OPENAI_API_KEY);
          } catch (e) {
            // A conversa não pode cair por causa da agenda.
            console.error("[ai-agent-chat] criação da visita de teste falhou:", e);
          }
        }
      }
    }

    // pauseAI em vez de insert direto: o insert cru empilhava uma linha de
    // takeover por mensagem, e a checagem com maybeSingle() erra com mais de
    // uma — mesmo bug já corrigido na whatsapp-webhook.
    if (hasTransferirHumano) {
      await pauseAI(supabase, session_id, agent.id);
    }

    // Pós-qualificação SÓ para lead de teste. Em produção quem dispara é a
    // whatsapp-webhook, ao ver `lead_qualificado` na resposta abaixo — se esta
    // função também disparasse, a sequência inteira (round-robin, notificação,
    // resumo) rodaria duas vezes para todo lead real.
    if (hasLeadQualificado && lead_id) {
      const { data: leadDoTeste } = await supabase
        .from("leads")
        .select(
          "id, nome, telefone, cidade, objetivo, metragem_interesse, status_crm, vendedor_id, is_teste",
        )
        .eq("id", lead_id)
        .maybeSingle();

      if (leadDoTeste?.is_teste) {
        const { data: instanciaTeste } = await supabase
          .from("whatsapp_instances")
          .select("api_url, api_key, instance_name")
          .eq("id", agent.instance_id)
          .maybeSingle();

        if (instanciaTeste) {
          try {
            await handleLeadQualification(supabase, leadDoTeste, instanciaTeste, OPENAI_API_KEY);
          } catch (e) {
            // A conversa de teste não pode cair por causa da automação — o erro
            // aparece no log e no histórico do lead.
            console.error("[ai-agent-chat] pós-qualificação de teste falhou:", e);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ messages, session_id, lead_qualificado: hasLeadQualificado }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("ai-agent-chat error", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
