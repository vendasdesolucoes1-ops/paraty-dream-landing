// Helpers compartilhados do Imagery Engine — Moradas de Paraty.
// O bucket "imagery" é privado, então todo arquivo é servido por URL assinada
// de longa duração (1 ano) — funciona tanto no painel quanto na Graph API do
// Instagram, que precisa buscar a imagem por HTTP.

export const IMAGERY_BUCKET = "imagery";
export const SIGNED_URL_TTL = 60 * 60 * 24 * 365;

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export async function uploadSigned(
  admin: SupabaseLike,
  path: string,
  body: Blob | Uint8Array,
  contentType: string,
): Promise<string> {
  const { error } = await admin.storage.from(IMAGERY_BUCKET).upload(path, body, {
    contentType,
    upsert: true,
  });
  if (error) throw error;

  const { data, error: signErr } = await admin.storage
    .from(IMAGERY_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signErr) throw signErr;

  return data.signedUrl as string;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:image\/[a-z+]+;base64,/, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
