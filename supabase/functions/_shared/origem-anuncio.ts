// Origem "Anúncio WhatsApp": quando a pessoa chega por um anúncio de clique para
// o WhatsApp, a primeira mensagem traz os dados do anúncio em
// contextInfo.externalAdReply (sourceId = ID do anúncio, sourceUrl, title e, nas
// versões novas, ctwaClid). A Evolution põe o contextInfo em lugares diferentes
// conforme o tipo de mensagem, por isso a busca percorre o payload.
//
// Gravar é responsabilidade do banco (registrar_origem_anuncio): ele só marca
// contato novo, busca nome do anúncio e da campanha nos dados da Meta e nunca
// sobrescreve uma origem já registrada. Falha aqui nunca derruba o webhook.

/* eslint-disable @typescript-eslint/no-explicit-any -- payload da Evolution sem tipo. */

export interface OrigemAnuncio {
  anuncioId: string | null;
  ctwaClid: string | null;
  titulo: string | null;
  url: string | null;
}

const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/** Procura `externalAdReply` no payload da mensagem (até 4 níveis). */
function acharAdReply(no: unknown, profundidade = 0): Record<string, any> | null {
  if (!no || typeof no !== "object" || profundidade > 4) return null;
  const obj = no as Record<string, any>;
  if (obj.externalAdReply && typeof obj.externalAdReply === "object") return obj.externalAdReply;
  for (const v of Object.values(obj)) {
    const achado = acharAdReply(v, profundidade + 1);
    if (achado) return achado;
  }
  return null;
}

/** Dados do anúncio da mensagem, ou null quando ela não veio de anúncio. */
export function extrairOrigemAnuncio(
  data: Record<string, any> | null | undefined,
): OrigemAnuncio | null {
  if (!data) return null;
  const ad = acharAdReply(data.contextInfo) ?? acharAdReply(data.message) ?? acharAdReply(data);
  if (!ad) return null;
  const origem: OrigemAnuncio = {
    anuncioId: texto(ad.sourceId) ?? texto(ad.source_id),
    ctwaClid: texto(ad.ctwaClid) ?? texto(ad.ctwa_clid),
    titulo: texto(ad.title),
    url: texto(ad.sourceUrl) ?? texto(ad.source_url),
  };
  // Um link compartilhado (sourceType "url") não é anúncio.
  const tipo = texto(ad.sourceType)?.toLowerCase();
  if (tipo && tipo !== "ad") return null;
  return origem.anuncioId || origem.ctwaClid ? origem : null;
}

/** Registra a origem no lead (no banco); nunca lança. */
export async function registrarOrigemAnuncio(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }> },
  leadId: string,
  data: Record<string, any> | null | undefined,
): Promise<boolean> {
  try {
    const origem = extrairOrigemAnuncio(data);
    if (!origem) return false;
    const { error } = await supabase.rpc("registrar_origem_anuncio", {
      p_lead_id: leadId,
      p_anuncio_id: origem.anuncioId,
      p_ctwa_clid: origem.ctwaClid,
      p_titulo: origem.titulo,
      p_url: origem.url,
    });
    if (error) {
      console.error("[origem-anuncio] registrar falhou:", (error as { message?: string })?.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[origem-anuncio] erro:", (e as Error)?.message);
    return false;
  }
}
