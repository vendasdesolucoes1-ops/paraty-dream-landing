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
// O ENVIO NÃO MORA MAIS AQUI. Este módulo só monta o texto e responde se o
// lead pode ser abordado; quem envia é a edge function `processar-fila-mensagens`,
// acionada por pg_cron. A versão anterior esperava dentro de
// EdgeRuntime.waitUntil com setTimeout, e a mensagem morria junto com o isolate
// sem deixar rastro nenhum no log. Ver a migration
// 20260809000000_fila_mensagens_agendadas.sql.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Instantâneo denuncia automação: ninguém responde um formulário em 2 segundos.
// O atraso agora é só uma data no futuro gravada na fila, então o teto não tem
// mais nada a ver com o wall clock da edge function. O que limita é o bom
// senso: passou muito tempo, o lead já esqueceu que preencheu.
//
// Na prática o cron roda de minuto em minuto, então a mensagem sai entre ~20s
// e ~2min do preenchimento.
export const DELAY_MIN_MS = 20_000;
export const DELAY_MAX_MS = 60_000;

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
    ? `Oi, ${nome}! Aqui é a Sophia, do Moradas de Paraty.`
    : "Oi! Aqui é a Sophia, do Moradas de Paraty.";

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

/**
 * Conversa parada há mais que isso conta como contato frio: pode reabordar.
 *
 * Era 7 dias, e isso engolia o caso mais comum: quem já trocou mensagem com a
 * gente nos últimos dias e volta pelo formulário ficava sem nenhuma resposta.
 * Preencher o formulário é um pedido explícito de contato — só faz sentido
 * segurar a abordagem se a conversa está literalmente acontecendo agora.
 */
const JANELA_CONVERSA_ATIVA_MS = 2 * 60 * 60 * 1000;

/**
 * true se este lead não tem conversa ATIVA (mensagem nas últimas 2 horas).
 *
 * A trava de "uma tentativa por lead" hoje é o índice único parcial em
 * mensagens_agendadas — esta checagem serve para outra coisa: não atropelar
 * quem já está conversando. Roda de novo na hora do envio, porque entre o
 * enfileiramento e o disparo o lead pode ter escrito primeiro.
 *
 * Quem falou com a gente semanas atrás e voltou pelo formulário é abordado
 * normalmente: ficar sem resposta é o pior desfecho possível para um lead
 * quente.
 */
export async function podeAbordar(supabase: SupabaseClient, leadId: string): Promise<boolean> {
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
