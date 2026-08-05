// Identidade visual do chat de WhatsApp, compartilhada entre o modal de
// Conversas do CRM e a aba "Testar Agente" do painel do Agente IA.
//
// Vive num módulo só porque as duas telas precisam ser indistinguíveis: se cada
// uma tivesse a própria cópia das cores e do fundo, a primeira alteração numa
// delas já faria as duas divergirem.
// Textura do fundo do chat: o padrão do WhatsApp é uma arte proprietária, e
// embutir o asset original seria cópia. Esta é uma aproximação em CSS puro —
// mesma leitura visual (bege claro levemente pontilhado) sem depender de
// imagem externa, que a CSP do app bloquearia de qualquer forma.
export const CHAT_BG =
  "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.045) 1px, transparent 0) 0 0 / 22px 22px, " +
  "linear-gradient(#EFE7DE, #EFE7DE)";

export const BOLHA_NOSSA = "#DCF8C6";
export const BOLHA_LEAD = "#FFFFFF";

/** Iniciais para o avatar quando não há foto de perfil. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * Ticks do WhatsApp: um risco = enviado ao servidor, dois = entregue,
 * dois azuis = lido. Só aparecem nas mensagens que saíram daqui.
 */
