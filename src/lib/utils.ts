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

/** Link direto para a conversa no WhatsApp, ou null se o telefone não serve. */
export function whatsappLink(raw: string | null | undefined): string | null {
  const numero = toWhatsappNumber(raw);
  return numero ? `https://wa.me/${numero}` : null;
}
