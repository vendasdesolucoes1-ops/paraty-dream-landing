// Pós-qualificação do lead: o que acontece depois que o agente emite
// [LEAD_QUALIFICADO] — status_crm, extração dos dados estruturados, round-robin,
// notificação in-app e resumo por WhatsApp para o vendedor da vez.
//
// Vive aqui, e não dentro da whatsapp-webhook, porque o painel "Testar Agente"
// precisa disparar exatamente a mesma sequência: sem isso, conversar no teste
// não move nada no CRM e não há como conferir a automação antes de soltar para
// leads reais.
//
// Extração literal do que estava na whatsapp-webhook — comportamento idêntico,
// só as dependências (client do Supabase e chave da OpenAI) passaram a ser
// injetadas em vez de capturadas do escopo do módulo.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWhatsAppText } from "./evolution-send.ts";
import { carregarLead } from "./lead-record.ts";

// Extração é tarefa curta e mecânica — o modelo pequeno basta e mantém o custo
// por lead qualificado irrelevante.
const EXTRACTION_MODEL = "gpt-4o-mini";

// Destino do resumo quando o lead é de teste. O round-robin continua rodando
// normalmente (a atribuição no CRM é parte do que se quer observar), mas o
// WhatsApp jamais chega no celular do vendedor real — só neste número.
const TESTE_VENDEDOR_TELEFONE = (Deno.env.get("TESTE_VENDEDOR_TELEFONE") ?? "").replace(/\D/g, "");

/** Campos do lead usados aqui; o resto do registro passa direto. */
export interface LeadRecord {
  id: string;
  nome?: string | null;
  telefone?: string | null;
  cidade?: string | null;
  objetivo?: string | null;
  metragem_interesse?: number | null;
  forma_pagamento?: string | null;
  canal_origem?: string | null;
  status_crm?: string | null;
  vendedor_id?: string | null;
  is_teste?: boolean | null;
}

/** Instância da Evolution por onde o resumo é enviado. */
export interface InstanceRecord {
  api_url: string;
  api_key: string;
  instance_name: string;
}

// Extração estruturada da qualificação (Opção A): uma segunda chamada à
// OpenAI, separada da conversa, em JSON mode — o schema é rígido e a sintaxe é
// garantida pelo response_format, então ajustes futuros no tom do agente de
// vendas não quebram a extração.
//
// NUNCA lança: a extração é complemento. Se falhar (sem chave, timeout, quota,
// resposta estranha), devolve null e o fluxo principal — atribuir + notificar —
// segue com "não informado" nos campos que faltarem.
async function extrairDadosQualificacao(
  supabase: SupabaseClient,
  leadId: string,
  openaiKey: string,
): Promise<Record<string, unknown> | null> {
  try {
    if (!openaiKey) {
      console.warn("=== EXTRACAO IGNORADA === OPENAI_API_KEY ausente no whatsapp-webhook");
      return null;
    }

    const { data: mensagens } = await supabase
      .from("whatsapp_messages")
      .select("from_me, content")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(40);

    const transcricao = (mensagens ?? [])
      .reverse()
      .map(
        (m: Record<string, unknown>) =>
          `${m.from_me ? "Vendedor" : "Lead"}: ${String(m.content ?? "")}`,
      )
      .join("\n")
      .slice(0, 8000);

    if (!transcricao.trim()) return null;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Extraia os dados de qualificação da conversa abaixo. Responda APENAS com um objeto JSON com as chaves: "cidade" (string), "objetivo" (exatamente um de: "moradia", "investimento", "temporada"), "metragem_interesse" (número em m², sem unidade), "forma_pagamento" (string curta, ex: "à vista", "financiado", "FGTS"), "canal_origem" (como o lead conheceu o empreendimento; normalize para um destes quando couber: "Instagram", "Facebook", "Google", "site", "indicação", "tráfego pago", "placa/outdoor"; se não encaixar em nenhum, use a expressão curta do próprio lead). Use null em qualquer campo que o lead não tenha informado de forma clara. Nunca invente ou deduza um valor que o lead não disse.',
          },
          { role: "user", content: transcricao },
        ],
      }),
    });

    if (!response.ok) {
      console.error("=== EXTRACAO FALHOU ===", response.status, await response.text());
      return null;
    }

    const result = await response.json();
    const conteudo = result?.choices?.[0]?.message?.content;
    if (!conteudo) return null;
    return JSON.parse(conteudo);
  } catch (error) {
    console.error("=== EXTRACAO FALHOU ===", (error as Error)?.message);
    return null;
  }
}

// Só grava o que veio preenchido e ainda não existe no lead — a extração nunca
// sobrescreve dado já confirmado (ex: cidade corrigida à mão no CRM).
function camposParaAtualizar(
  lead: LeadRecord,
  extraido: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!extraido) return {};
  const updates: Record<string, unknown> = {};

  const cidade = typeof extraido.cidade === "string" ? extraido.cidade.trim() : "";
  if (cidade && !lead.cidade) updates.cidade = cidade;

  const objetivo = typeof extraido.objetivo === "string" ? extraido.objetivo.trim() : "";
  // A coluna tem CHECK constraint: um valor fora da lista derrubaria o UPDATE
  // inteiro e levaria junto os outros campos válidos.
  if (["moradia", "investimento", "temporada"].includes(objetivo) && !lead.objetivo) {
    updates.objetivo = objetivo;
  }

  const metragem = Number(extraido.metragem_interesse);
  if (Number.isFinite(metragem) && metragem > 0 && !lead.metragem_interesse) {
    updates.metragem_interesse = metragem;
  }

  const pagamento =
    typeof extraido.forma_pagamento === "string" ? extraido.forma_pagamento.trim() : "";
  if (pagamento && !lead.forma_pagamento) updates.forma_pagamento = pagamento;

  const canal = typeof extraido.canal_origem === "string" ? extraido.canal_origem.trim() : "";
  if (canal && !lead.canal_origem) updates.canal_origem = canal;

  return updates;
}

// Resumo por TEMPLATE puro: monta a partir das colunas do lead, nunca de texto
// livre devolvido pela IA. Campo ausente vira "não informado" em vez de sumir,
// pra o vendedor saber o que ainda falta perguntar.
function montarResumoQualificacao(lead: Record<string, unknown>): string {
  const ou = (valor: unknown) => {
    const texto = valor === null || valor === undefined ? "" : String(valor).trim();
    return texto.length > 0 ? texto : "não informado";
  };
  const metragem = lead.metragem_interesse
    ? `${String(lead.metragem_interesse)} m²`
    : "não informado";

  return [
    "*Novo lead qualificado* 🎯",
    "",
    `*Nome:* ${ou(lead.nome)}`,
    `*Telefone:* ${ou(lead.telefone)}`,
    `*Cidade:* ${ou(lead.cidade)}`,
    `*Objetivo:* ${ou(lead.objetivo)}`,
    `*Metragem de interesse:* ${metragem}`,
    `*Forma de pagamento:* ${ou(lead.forma_pagamento)}`,
    `*Conheceu por:* ${ou(lead.canal_origem)}`,
    "",
    "Lead atribuído a você pela fila de rodízio. O histórico completo está no CRM.",
  ].join("\n");
}

// Triggered when the AI agent's response contains the [LEAD_QUALIFICADO]
// marker. Marca o lead como qualificado, garante a atribuição por round-robin
// e manda o resumo por WhatsApp pro vendedor da vez. Uma tabela de vendedores
// vazia é esperada e não é erro — o lead só fica sem dono.

/** Marca durável de "este lead já foi qualificado e o vendedor já foi avisado". */
const CANAL_QUALIFICACAO = "qualificacao";

/**
 * true se a qualificação deste lead já foi registrada alguma vez.
 *
 * Casa por duas vias de propósito: o canal novo, e o texto da interação que
 * esta função sempre gravou ("... via round-robin."). Sem a segunda, todo lead
 * qualificado ANTES desta mudança seria lido como não-notificado e receberia um
 * resumo repetido no primeiro contato novo — uma enxurrada no WhatsApp dos
 * vendedores por causa de um deploy.
 */
async function qualificacaoJaRegistrada(
  supabase: SupabaseClient,
  leadId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("interacoes")
    .select("id")
    .eq("lead_id", leadId)
    .or(`canal.eq.${CANAL_QUALIFICACAO},conteudo.ilike.%via round-robin%`)
    .limit(1);

  // Na dúvida, considera que JÁ notificou: repetir resumo no WhatsApp do
  // vendedor é pior do que deixar de repetir, e o lead aparece no CRM de
  // qualquer forma.
  if (error) {
    console.error("=== CHECAGEM DE QUALIFICACAO FALHOU ===", error.message);
    return true;
  }
  return (data ?? []).length > 0;
}

export async function handleLeadQualification(
  supabase: SupabaseClient,
  lead: LeadRecord,
  instance: InstanceRecord,
  openaiKey: string,
): Promise<void> {
  // A guarda de "já notifiquei" é o registro em interacoes, não o status_crm.
  //
  // Era `status_crm === 'novo'`, e isso quebrou quando o upsert do formulário
  // passou a criar o lead já como 'qualificado': a condição nascia falsa e o
  // vendedor NUNCA era avisado do lead que mais interessa — o que preencheu a
  // ficha inteira. Status é estado atual e pode ser mexido por qualquer lado
  // (formulário, Kanban, outra automação); a interação é fato consumado e não
  // volta atrás.
  const jaNotificado = await qualificacaoJaRegistrada(supabase, lead.id);

  // Promove só quem está no começo do funil — mesma regra do upsert do
  // formulário. Sem isso, uma segunda passagem por aqui puxaria um lead
  // 'agendado' de volta para 'qualificado', apagando progresso real.
  const statusAtual = lead.status_crm ?? "novo";
  if (statusAtual === "novo" || statusAtual === "perdido") {
    const { error: statusError } = await supabase
      .from("leads")
      .update({ status_crm: "qualificado" })
      .eq("id", lead.id);
    if (statusError) throw statusError;
  }

  if (jaNotificado) return;

  // Best-effort: falha aqui não pode impedir atribuição nem notificação.
  const extraido = await extrairDadosQualificacao(supabase, lead.id, openaiKey);
  const updates = camposParaAtualizar(lead, extraido);
  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await supabase.from("leads").update(updates).eq("id", lead.id);
    if (updateError) {
      console.error("=== EXTRACAO NAO GRAVADA ===", updateError.message);
    }
  }

  // Reaproveita a MESMA rotação usada para atribuir o lead: se ele já tem dono,
  // quem recebe o resumo é o dono, não o próximo da fila.
  let vendedorId = lead.vendedor_id ?? null;
  if (!vendedorId) {
    const { data: proximo } = await supabase.rpc("get_next_round_robin_salesperson");
    vendedorId = proximo ?? null;
    if (vendedorId) {
      const { error: assignError } = await supabase
        .from("leads")
        .update({ vendedor_id: vendedorId })
        .eq("id", lead.id);
      if (assignError) throw assignError;
    }
  }

  if (!vendedorId) {
    console.warn("=== SEM VENDEDOR NA FILA ===", { leadId: lead.id });
    return;
  }

  const { data: vendedor } = await supabase
    .from("vendedores")
    .select("nome, telefone, profile_id")
    .eq("id", vendedorId)
    .maybeSingle();

  if (vendedor?.profile_id) {
    await supabase.from("notifications").insert({
      user_id: vendedor.profile_id,
      type: "lead_atribuido",
      title: "Novo lead atribuído",
      body: `O lead ${lead.nome} foi qualificado e atribuído a você via round-robin.`,
      link: `/dashboard/crm?lead=${lead.id}`,
    });
  }

  // canal = CANAL_QUALIFICACAO: é esta linha que qualificacaoJaRegistrada()
  // procura depois para não notificar duas vezes. O texto continua igual,
  // porque leads antigos são reconhecidos por ele.
  await supabase.from("interacoes").insert({
    lead_id: lead.id,
    tipo: "sistema",
    canal: CANAL_QUALIFICACAO,
    conteudo: `Lead atribuído automaticamente a ${vendedor?.nome ?? "vendedor"} via round-robin.`,
  });

  // O resumo sai das colunas do lead já atualizadas, não do objeto em memória.
  const leadAtual = (await carregarLead(supabase, lead.id)) as LeadRecord | null;

  const ehTeste = lead.is_teste === true;
  const resumo = ehTeste
    ? `🧪 *LEAD DE TESTE* — gerado pelo painel, não é um cliente real.\n\n${montarResumoQualificacao(leadAtual ?? { ...lead, ...updates })}`
    : montarResumoQualificacao(leadAtual ?? { ...lead, ...updates });

  // Em lead de teste o destinatário é fixo, independente de quem o round-robin
  // escolheu — o vendedor real não pode receber resumo de cliente fictício.
  const destino = ehTeste ? TESTE_VENDEDOR_TELEFONE : (vendedor?.telefone ?? "");

  if (ehTeste && !destino) {
    const aviso =
      "Lead de teste qualificado, mas TESTE_VENDEDOR_TELEFONE não está configurado nos secrets — resumo não enviado. A atribuição no CRM foi feita normalmente.";
    console.error("=== TESTE SEM TELEFONE CONFIGURADO ===", { leadId: lead.id });
    await supabase.from("interacoes").insert({
      lead_id: lead.id,
      tipo: "sistema",
      canal: "sistema",
      conteudo: aviso,
    });
    return;
  }

  // Vendedor sem telefone não pode falhar em silêncio: fica registrado no log,
  // na timeline do lead e como alerta in-app pra quem administra o painel.
  if (!ehTeste && !destino) {
    const aviso = `Lead qualificado, mas o vendedor ${vendedor?.nome ?? "da vez"} não tem telefone cadastrado — resumo não enviado por WhatsApp. Cadastre o telefone em Configurações → Equipe.`;
    console.error("=== VENDEDOR SEM TELEFONE ===", { leadId: lead.id, vendedorId });

    await supabase.from("interacoes").insert({
      lead_id: lead.id,
      tipo: "sistema",
      canal: "sistema",
      conteudo: aviso,
    });

    const { data: admins } = await supabase
      .from("profiles")
      .select("id")
      .in("role", ["admin", "gestor"])
      .is("deletado_em", null);

    for (const admin of admins ?? []) {
      await supabase.from("notifications").insert({
        user_id: admin.id,
        type: "vendedor_sem_telefone",
        title: "Resumo do lead não enviado",
        body: aviso,
        link: `/dashboard/crm?lead=${lead.id}`,
      });
    }
    return;
  }

  try {
    await sendWhatsAppText(
      instance.api_url,
      instance.api_key,
      instance.instance_name,
      destino,
      resumo,
    );
    await supabase.from("interacoes").insert({
      lead_id: lead.id,
      tipo: "sistema",
      canal: "sistema",
      conteudo: ehTeste
        ? `Resumo de TESTE enviado por WhatsApp para o número de teste (${destino}). O round-robin escolheu ${vendedor?.nome ?? "um vendedor"}, que não foi notificado.`
        : `Resumo da qualificação enviado por WhatsApp para ${vendedor?.nome ?? "o vendedor"} (${destino}).`,
    });
  } catch (error) {
    // Envio falhou (instância caiu, número inválido): registra visível em vez
    // de perder a informação — a atribuição no CRM já está feita de todo jeito.
    const msg = (error as Error)?.message ?? String(error);
    console.error("=== FALHA AO ENVIAR RESUMO ===", msg);
    await supabase.from("interacoes").insert({
      lead_id: lead.id,
      tipo: "sistema",
      canal: "sistema",
      conteudo: `Falha ao enviar o resumo da qualificação por WhatsApp para ${vendedor?.nome ?? "o vendedor"}: ${msg.slice(0, 300)}`,
    });
  }
}
