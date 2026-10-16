import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Telefone no formato que o wa.me e a Evolution API esperam: só dígitos, com
 * DDI. Mesma regra do normalizePhone da landing e das edge functions — sem o
 * 55 na frente, o wa.me interpreta o número como internacional e abre uma
 * conversa vazia com um número inexistente.
 */
export function toWhatsappNumber(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
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
export function chaveTelefone(raw: string | null | undefined): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  if (d.length !== 10) return null;
  return `55${d}`;
}

/**
 * Lê a mensagem de erro real do corpo da resposta de uma edge function.
 * Sem isto, o supabase-js entrega só "non-2xx status code" e a causa (que a
 * função devolve em `error` no JSON) se perde antes de chegar na tela.
 */
export async function readFunctionError(error: {
  context?: Response;
  message: string;
}): Promise<string> {
  const detalhe = error.context?.json ? await error.context.json().catch(() => null) : null;
  return detalhe?.error ?? error.message;
}

/** Link direto para a conversa no WhatsApp, ou null se o telefone não serve. */
export function whatsappLink(raw: string | null | undefined): string | null {
  const numero = toWhatsappNumber(raw);
  return numero ? `https://wa.me/${numero}` : null;
}
