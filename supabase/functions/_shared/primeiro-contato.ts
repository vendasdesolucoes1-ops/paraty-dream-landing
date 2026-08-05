// Primeira mensagem da Sophia para quem preencheu o formulário do site.
//
// Aqui é a Sophia que inicia — o lead nunca escreveu. Isso muda duas coisas em
// relação ao fluxo normal:
//
// 1. A mensagem é ENVIADA DIRETO pela Evolution e gravada com from_me = true.
//    Antes, `enrich-lead` injetava um `messages.upsert` falso no webhook, como
//    se o lead tivesse escrito "Vim pelo site..." — funcionava, mas deixava no
//    histórico do CRM uma mensagem que a pessoa nunca mandou.
// 2. O texto é montado por template, com o que já veio do formulário. Perguntar
//    de novo o que a pessoa acabou de digitar é o jeito mais rápido de queimar
//    a abertura.
//
// Mensagem não solicitada tem risco de denúncia, e denúncia é o que bane o
// número. Por isso: uma tentativa por lead (garantida pelo banco, não por
// flag em memória) e um atraso de algumas dezenas de segundos, para não
// parecer robô.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWhatsAppText } from "./evolution-send.ts";

// Instantâneo denuncia automação: ninguém responde um formulário em 2 segundos.
//
// O teto é 60s por causa da plataforma, não do bom gosto: a espera acontece
// dentro de EdgeRuntime.waitUntil, e edge functions do Supabase são destruídas
// por volta de 150s de wall clock. Com o intervalo anterior (60-180s) o sorteio
// decidia se a mensagem saía: abaixo de ~150s ela ia, acima disso a função
// morria com o timer pendente e nada era enviado, sem erro nenhum no log.
const DELAY_MIN_MS = 20_000;
const DELAY_MAX_MS = 60_000;

export interface DadosFormulario {
  nome?: string | null;
  cidade?: string | null;
  metragem?: string | null;
  tipo?: string | null;
}

export interface InstanciaEvolution {
  id: string;
  api_url: string;
  api_key: string;
  instance_name: string;
}

/** Primeiro nome, que é como alguém chamaria a pessoa no WhatsApp. */
function primeiroNome(nome: string | null | undefined): string {
  const limpo = String(nome ?? "").trim();
  if (!limpo) return "";
  return limpo.split(/\s+/)[0];
}

/**
 * Abertura montada a partir do que o formulário já trouxe. A última mensagem é
 * sempre a próxima pergunta que FALTA — quem já disse o tamanho não é
 * perguntado de novo sobre tamanho.
 *
 * Devolve as partes já separadas: cada uma vira uma mensagem, como a Sophia faz
 * com o || no resto da conversa.
 */
export function montarAbertura(dados: DadosFormulario): string[] {
  const nome = primeiroNome(dados.nome);
  const saudacao = nome
    ? `Oi, ${nome}! Aqui é a Sophia, do Moradas de Paraty 😊`
    : "Oi! Aqui é a Sophia, do Moradas de Paraty 😊";

  const partes = [saudacao, "Vi que você deixou seu contato no nosso site."];

  // O objetivo (morar/investir) nunca vem do formulário, então é sempre a
  // primeira lacuna — a menos que o tamanho também esteja lá, caso em que vale
  // reconhecer o que a pessoa já disse antes de perguntar.
  const temTamanho = Boolean(String(dados.metragem ?? "").trim());
  const temTipo = Boolean(String(dados.tipo ?? "").trim());

  if (temTamanho && temTipo) {
    partes.push(
      `Você marcou interesse em ${String(dados.metragem).trim()}, ${String(dados.tipo).trim().toLowerCase()}.`,
    );
    partes.push("Me conta: é pra morar, pra investir ou pra usar nas temporadas?");
  } else if (temTamanho) {
    partes.push(`Você marcou interesse em ${String(dados.metragem).trim()}.`);
    partes.push("Me conta: é pra morar, pra investir ou pra usar nas temporadas?");
  } else {
    partes.push("Você tá pensando em morar, investir ou usar nas temporadas?");
  }

  return partes;
}

/** Conversa parada há mais que isso conta como contato frio: pode reabordar. */
const JANELA_CONVERSA_ATIVA_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * true se este lead não tem conversa ATIVA (mensagem nos últimos 7 dias).
 *
 * Continua sendo a trava de "uma tentativa por lead": reenvio do formulário,
 * retry da edge function ou duas abas abertas não geram segunda abordagem, e
 * quem está conversando agora não é atropelado. O que mudou é o caso de quem
 * falou com a gente semanas atrás e voltou pelo formulário — antes ficava sem
 * resposta nenhuma, que é o pior desfecho possível para um lead quente.
 */
async function podeAbordar(supabase: SupabaseClient, leadId: string): Promise<boolean> {
  const desde = new Date(Date.now() - JANELA_CONVERSA_ATIVA_MS).toISOString();

  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("lead_id", leadId)
    .gte("created_at", desde)
    .limit(1);

  // Na dúvida (erro de consulta), NÃO aborda: mandar duas vezes é pior do que
  // não mandar, porque o custo cai sobre a reputação do número.
  if (error) {
    console.error("[primeiro-contato] checagem de mensagens falhou:", error.message);
    return false;
  }
  return (data ?? []).length === 0;
}


/**
 * Envia a abordagem inicial. Feito para rodar dentro de EdgeRuntime.waitUntil:
 * espera antes de enviar, então nunca deve ser aguardado pela requisição HTTP
 * do formulário.
 */
export async function enviarPrimeiroContato(
  supabase: SupabaseClient,
  lead: { id: string; telefone: string },
  instancia: InstanciaEvolution,
  dados: DadosFormulario,
): Promise<void> {
  if (!(await podeAbordar(supabase, lead.id))) return;

  const espera = DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));
  await new Promise((r) => setTimeout(r, espera));

  // Recheca depois da espera: nesse tempo o lead pode ter escrito primeiro,
  // e aí a conversa já está acontecendo — abordar agora atropelaria.
  if (!(await podeAbordar(supabase, lead.id))) return;

  const { data: contato } = await supabase
    .from("whatsapp_contacts")
    .select("id")
    .eq("phone", lead.telefone)
    .maybeSingle();

  const partes = montarAbertura(dados);

  for (const [i, texto] of partes.entries()) {
    // Pausa curta entre as partes, como alguém digitando em blocos.
    if (i > 0) await new Promise((r) => setTimeout(r, 1500));

    const enviado = await sendWhatsAppText(
      instancia.api_url,
      instancia.api_key,
      instancia.instance_name,
      lead.telefone,
      texto,
    );

    await supabase.from("whatsapp_messages").insert({
      instance_id: instancia.id,
      contact_id: contato?.id ?? null,
      lead_id: lead.id,
      remote_jid: `${lead.telefone}@s.whatsapp.net`,
      message_id: enviado?.key?.id ?? crypto.randomUUID(),
      from_me: true,
      message_type: "text",
      content: texto,
      status: "sent",
    });
  }

  await supabase.from("interacoes").insert({
    lead_id: lead.id,
    tipo: "sistema",
    canal: "sistema",
    conteudo: "Sophia iniciou a conversa por WhatsApp após o preenchimento do formulário do site.",
  });
}
