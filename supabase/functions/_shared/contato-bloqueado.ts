// "Este contato pediu para não ser mais procurado?"
//
// Existe como módulo compartilhado porque a checagem precisa valer em TODOS os
// caminhos de saída ativa — disparo em massa, fila de mensagens agendadas,
// notificação de qualificação. Um opt-out que vale em três dos quatro caminhos
// não é um opt-out: é uma chance em quatro de mandar mensagem para quem pediu
// para parar, que é exatamente o que vira denúncia e derruba o número.
//
// O bloqueio vale só para envio ATIVO. Se a pessoa escrever primeiro, a
// conversa volta (ver desbloquearContato, chamado pela whatsapp-webhook).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** PostgreSQL: undefined_column. Sinaliza migration 20260815000000 pendente. */
const UNDEFINED_COLUMN = "42703";

function ehColunaInexistente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === UNDEFINED_COLUMN) return true;
  return /does not exist/i.test(error.message ?? "");
}

/**
 * Últimos 10 dígitos — DDD + número, sem o 55 do país e sem o nono dígito
 * quando ele varia. É a mesma chave que o frontend usa em chaveTelefone(),
 * pelo mesmo motivo: o CRM guarda "(12) 99151-9515", a Evolution devolve
 * "5512991519515", e comparar as duas formas cruas nunca casa.
 */
export function chaveTelefone(bruto: string | null | undefined): string | null {
  const digitos = String(bruto ?? "").replace(/\D/g, "");
  return digitos.length >= 10 ? digitos.slice(-10) : null;
}

/**
 * O telefone pertence a alguém que bloqueou contato?
 *
 * Na dúvida devolve `false` (deixa enviar). É a escolha menos ruim das duas:
 * um erro transitório de banco não pode paralisar uma campanha inteira, e o
 * bloqueio ainda é checado no momento da seleção dos leads na interface. O
 * contrário — barrar tudo quando o banco pisca — pararia o disparo sem que
 * ninguém entendesse por quê.
 */
export async function telefoneBloqueado(
  supabase: SupabaseClient,
  telefone: string,
): Promise<boolean> {
  const chave = chaveTelefone(telefone);
  if (!chave) return false;

  // Filtra pelos 4 últimos dígitos no banco antes de comparar em código. Eles
  // são contíguos em qualquer formatação brasileira ("(12) 99151-9515" termina
  // em "9515"), diferente dos 10 dígitos inteiros, que a máscara quebra com
  // espaço, parêntese e hífen — um ilike com os 10 não casaria com o que o CRM
  // guarda. Sem esse filtro, cada contato de uma campanha varreria a tabela
  // inteira de bloqueados.
  const { data, error } = await supabase
    .from("leads")
    .select("telefone")
    .eq("contato_bloqueado", true)
    .ilike("telefone", `%${chave.slice(-4)}`);

  if (error) {
    if (ehColunaInexistente(error)) {
      console.error("[contato-bloqueado] MIGRATION 20260815000000 PENDENTE — envio liberado");
    } else {
      console.error("[contato-bloqueado] consulta falhou, envio liberado:", error.message);
    }
    return false;
  }

  return (data ?? []).some((l) => chaveTelefone(l.telefone) === chave);
}

/** Mesma pergunta, quando já se tem o id — exato e sem varredura. */
export async function leadBloqueado(supabase: SupabaseClient, leadId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("leads")
    .select("contato_bloqueado")
    .eq("id", leadId)
    .maybeSingle();

  if (error) {
    if (ehColunaInexistente(error)) {
      console.error("[contato-bloqueado] MIGRATION 20260815000000 PENDENTE — envio liberado");
    } else {
      console.error("[contato-bloqueado] consulta falhou, envio liberado:", error.message);
    }
    return false;
  }
  return data?.contato_bloqueado === true;
}

/**
 * A pessoa escreveu de novo: o bloqueio de envio ativo cai.
 *
 * `sem_interesse_em` e `recusas_visita` NÃO são limpos de propósito. Eles são o
 * histórico de que já houve recusa, e é o que faz blocoRecusaAnterior() seguir
 * proibindo o convite de visita — voltar a conversar não é voltar a insistir.
 */
export async function desbloquearContato(
  supabase: SupabaseClient,
  leadId: string,
): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({ contato_bloqueado: false })
    .eq("id", leadId)
    .eq("contato_bloqueado", true);

  if (error && !ehColunaInexistente(error)) {
    console.error("[contato-bloqueado] desbloqueio falhou:", error.message);
  }
}
