// "Este contato pediu para não ser mais procurado?"
//
// Existe como módulo compartilhado porque a checagem precisa valer em TODOS os
// caminhos de saída ativa — disparo em massa, fila de mensagens agendadas,
// notificação de qualificação. Um opt-out que vale em três dos quatro caminhos
// não é um opt-out: é uma chance em quatro de mandar mensagem para quem pediu
// para parar, que é exatamente o que vira denúncia e derruba o número.
//
// O bloqueio vale só para envio ATIVO: se a pessoa escrever, a Sophia responde.
// Mas escrever não desfaz o bloqueio — só um desbloqueio manual no painel
// (desbloquearContato). Falha fechada: na dúvida, não envia.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** PostgreSQL: undefined_column. Sinaliza migration 20260815000000 pendente. */
const UNDEFINED_COLUMN = "42703";

function ehColunaInexistente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === UNDEFINED_COLUMN) return true;
  return /does not exist/i.test(error.message ?? "");
}

/**
 * Chave canônica de telefone brasileiro: "55" + DDD + os 8 últimos dígitos.
 *
 * O mesmo celular aparece com e sem o 9 inicial (o WhatsApp ainda devolve JIDs
 * antigos sem ele), com e sem DDI, com e sem máscara. A chave antiga (10
 * últimos dígitos) separava "com 9" de "sem 9" e, nos números com 9, perdia o
 * primeiro dígito do DDD — 11 e 21 colidiam. Esta chave mantém o DDD inteiro e
 * descarta só o 9 de celular, então os dois formatos casam e DDDs diferentes
 * nunca colidem. Mesma regra de public.telefone_chave() no banco.
 *
 * Devolve null quando não é um telefone brasileiro reconhecível.
 */
export function chaveTelefone(bruto: string | null | undefined): string | null {
  let d = String(bruto ?? "").replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  if (d.length !== 10) return null;
  return `55${d}`;
}

/**
 * O telefone pertence a alguém que bloqueou contato ou disse não ter interesse?
 *
 * Na dúvida devolve `true` (NÃO envia). Mandar mensagem ativa a quem pediu
 * para parar é o erro que gera denúncia e banimento do número; um envio
 * adiado por um erro transitório de banco é só um envio adiado.
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
    .or("contato_bloqueado.eq.true,sem_interesse_em.not.is.null")
    .ilike("telefone", `%${chave.slice(-4)}`);

  if (error) {
    if (ehColunaInexistente(error)) {
      console.error("[contato-bloqueado] MIGRATION 20260815000000 PENDENTE — envio barrado");
    } else {
      console.error("[contato-bloqueado] consulta falhou, envio barrado:", error.message);
    }
    return true;
  }

  return (data ?? []).some((l) => chaveTelefone(l.telefone) === chave);
}

/** Mesma pergunta, quando já se tem o id — exato e sem varredura. */
export async function leadBloqueado(supabase: SupabaseClient, leadId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("leads")
    .select("contato_bloqueado, sem_interesse_em")
    .eq("id", leadId)
    .maybeSingle();

  if (error) {
    if (ehColunaInexistente(error)) {
      console.error("[contato-bloqueado] MIGRATION 20260815000000 PENDENTE — envio barrado");
    } else {
      console.error("[contato-bloqueado] consulta falhou, envio barrado:", error.message);
    }
    return true;
  }
  return data?.contato_bloqueado === true || Boolean(data?.sem_interesse_em);
}

/**
 * Desbloqueio MANUAL, por admin/gestor no painel (com registro em interacoes).
 *
 * Não é mais chamado quando o lead escreve: antes, qualquer mensagem do lead
 * apagava o opt-out e ele voltava a receber campanha e fila sem ter pedido.
 * Responder a quem escreveu continua permitido (a Sophia responde), mas isso
 * não reabre o envio ATIVO.
 *
 * `sem_interesse_em` e `recusas_visita` NÃO são limpos: são o histórico de que
 * já houve recusa.
 */
export async function desbloquearContato(supabase: SupabaseClient, leadId: string): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({ contato_bloqueado: false })
    .eq("id", leadId)
    .eq("contato_bloqueado", true);

  if (error && !ehColunaInexistente(error)) {
    console.error("[contato-bloqueado] desbloqueio falhou:", error.message);
  }
}

// Pedidos de parada reconhecidos sem chamar o modelo. Frases curtas e
// inequívocas: a mensagem inteira precisa ser só o pedido (com pontuação),
// para "pode parar de me mandar o preço e manda a planta" não virar opt-out.
const PEDIDOS_DE_PARADA = [
  "pare",
  "parar",
  "pare de me mandar mensagem",
  "para de me mandar mensagem",
  "pare de mandar mensagem",
  "nao quero mais",
  "nao quero mais receber",
  "nao quero receber mensagens",
  "nao me mande mais mensagem",
  "nao me mande mais mensagens",
  "me tira da lista",
  "me tire da lista",
  "sair",
  "sair da lista",
  "descadastrar",
  "stop",
];

/** A mensagem é um pedido explícito de parar de receber contato? */
export function ehPedidoDeParada(texto: string | null | undefined): boolean {
  const normalizado = String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalizado || normalizado.length > 60) return false;
  return PEDIDOS_DE_PARADA.includes(normalizado);
}
