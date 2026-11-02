// Abas da tela de Marketing. Ficam na URL (?aba=anuncios) para dar para
// compartilhar o link de uma aba e o "voltar" do navegador funcionar.

export const ABAS_MARKETING = [
  "visao-geral",
  "anuncios",
  "instagram",
  "conteudo",
  "marca",
  "integracao",
] as const;

export type AbaMarketing = (typeof ABAS_MARKETING)[number];

export const ABA_PADRAO: AbaMarketing = "visao-geral";

export function ehAbaMarketing(v: unknown): v is AbaMarketing {
  return typeof v === "string" && (ABAS_MARKETING as readonly string[]).includes(v);
}
