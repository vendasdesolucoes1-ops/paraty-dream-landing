// Como o lead aparece na tela quando os dados vieram sujos do WhatsApp ou do
// formulário: nome que é telefone, e-mail ou usuário vira "Sem nome"; cidade
// que é "sim" ou um e-mail some. Sem imports com alias: roda no `node --test`.

interface LeadNomeado {
  nome: string | null;
}

interface LeadComRespostas {
  prazo_compra?: string | null;
  quer_visitar?: string | null;
  finalidade?: string | null;
}

/** O nome guardado não identifica uma pessoa (telefone, e-mail, @usuário…). */
export function nomeInvalido(nome: string | null | undefined): boolean {
  const n = (nome ?? "").trim();
  if (!n) return true;
  if (n.includes("@")) return true;
  if (/^[\d\s+().-]+$/.test(n)) return true;
  // Usuário de rede social: uma palavra só, minúscula, com dígito, ponto ou _.
  if (/^[a-z0-9._]+$/.test(n) && /[\d._]/.test(n)) return true;
  return false;
}

export function nomeExibicao(lead: LeadNomeado): string {
  return nomeInvalido(lead.nome) ? "Sem nome" : (lead.nome ?? "").trim();
}

const CIDADES_INVALIDAS = new Set(["sim", "não", "nao", "ok", "-", ".", "x", "teste"]);

export function cidadeValida(cidade: string | null | undefined): string | null {
  const c = (cidade ?? "").trim();
  if (!c || c.includes("@") || /^[\d\s]+$/.test(c)) return null;
  if (CIDADES_INVALIDAS.has(c.toLowerCase())) return null;
  return c;
}

/** Resumo curto das respostas do formulário para o cartão (ex.: "Compra em 3 meses · Quer visitar"). */
export function resumoRespostas(lead: LeadComRespostas): string | null {
  const partes: string[] = [];
  const prazo = (lead.prazo_compra ?? "").toLowerCase();
  if (prazo.startsWith("nos próximos 3 meses")) partes.push("Compra em 3 meses");
  else if (prazo.startsWith("em até 1 ano")) partes.push("Compra em até 1 ano");
  else if (prazo.includes("pesquisando")) partes.push("Só pesquisando");
  if ((lead.quer_visitar ?? "").toLowerCase().startsWith("sim")) partes.push("Quer visitar");
  return partes.length ? partes.join(" · ") : null;
}
