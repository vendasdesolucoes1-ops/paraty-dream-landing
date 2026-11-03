// Leads dos formulários de cadastro da Meta (Lead Ads) → CRM.
//
// Funções puras, sem rede: conferir a assinatura do webhook, derivar o token
// de verificação, ler os eventos "leadgen" e traduzir as respostas do
// formulário "[MORADAS] Form Visita" para os campos do lead.

/** Campos pedidos à Meta ao ler um lead. */
export const CAMPOS_LEAD =
  "id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,is_organic";

export interface CampoFormulario {
  name?: string;
  values?: unknown[];
}

export interface LeadMeta {
  id?: string;
  created_time?: string;
  field_data?: CampoFormulario[];
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  platform?: string;
  is_organic?: boolean;
}

/** O que vai para public.registrar_lead_formulario. */
export interface LeadParaCrm {
  leadgen_id: string;
  form_id: string | null;
  form_nome: string | null;
  criado_em: string | null;
  nome: string;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  finalidade: string | null;
  prazo_compra: string | null;
  forma_pagamento: string | null;
  quer_visitar: string | null;
  objetivo: "moradia" | "investimento" | "temporada" | null;
  qualificado: boolean;
  is_teste: boolean;
  ad_id: string | null;
  ad_nome: string | null;
  conjunto_nome: string | null;
  campanha_id: string | null;
  campanha_nome: string | null;
  plataforma: string | null;
  bruto: LeadMeta;
}

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hmac(segredo: string, mensagem: string | Uint8Array): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const dados = typeof mensagem === "string" ? new TextEncoder().encode(mensagem) : mensagem;
  return hex(await crypto.subtle.sign("HMAC", chave, dados));
}

function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Confere o X-Hub-Signature-256 ("sha256=<hex>") contra o corpo cru. */
export async function assinaturaValida(
  corpo: Uint8Array | string,
  cabecalho: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!cabecalho || !appSecret) return false;
  const recebida = cabecalho.trim().toLowerCase().replace(/^sha256=/, "");
  if (!/^[0-9a-f]{64}$/.test(recebida)) return false;
  return iguais(await hmac(appSecret, corpo), recebida);
}

/**
 * Token de verificação do webhook, derivado do app secret: assim não existe um
 * segredo a mais para guardar, e só quem tem o app secret o conhece.
 */
export async function tokenVerificacao(appSecret: string): Promise<string> {
  return (await hmac(appSecret, "moradas-meta-leadgen-verify")).slice(0, 40);
}

export interface EventoLeadgen {
  leadgen_id: string;
  form_id: string | null;
  ad_id: string | null;
  page_id: string | null;
  created_time: number | null;
}

/** Tira os eventos "leadgen" do corpo do webhook da Página. */
export function eventosLeadgen(payload: unknown): EventoLeadgen[] {
  const p = payload as { object?: string; entry?: unknown[] } | null;
  if (!p || p.object !== "page" || !Array.isArray(p.entry)) return [];
  const saida: EventoLeadgen[] = [];
  for (const entrada of p.entry) {
    const changes = (entrada as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const c of changes) {
      const ch = c as { field?: string; value?: Record<string, unknown> };
      if (ch?.field !== "leadgen" || !ch.value) continue;
      const v = ch.value;
      const id = v.leadgen_id != null ? String(v.leadgen_id) : "";
      if (!id) continue;
      saida.push({
        leadgen_id: id,
        form_id: v.form_id != null ? String(v.form_id) : null,
        ad_id: v.ad_id != null ? String(v.ad_id) : null,
        page_id: v.page_id != null ? String(v.page_id) : null,
        created_time: typeof v.created_time === "number" ? v.created_time : null,
      });
    }
  }
  return saida;
}

/** minúsculas, sem acento, só letras/números separados por "_". */
export function normalizarChave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** A Meta devolve a chave da opção ("nos_próximos_3_meses"); vira texto legível. */
function legivel(valor: string): string {
  const t = valor.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/**
 * Telefone no formato do CRM: 55 + DDD + número, só dígitos. Devolve null quando
 * não dá para ter certeza de que é um telefone brasileiro.
 */
export function normalizarTelefone(bruto: string | null | undefined): string | null {
  const texto = String(bruto ?? "").trim();
  // Número internacional explícito de outro país.
  if (texto.startsWith("+") && !/^\+\s*55/.test(texto)) return null;
  let d = texto.replace(/\D/g, "");
  if (!d) return null;
  d = d.replace(/^0+/, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return null;
}

const ehDadoDeTeste = (v: string) => /test lead|dummy data/i.test(v);

type Pergunta = "finalidade" | "prazo_compra" | "forma_pagamento" | "quer_visitar";

/** Qual pergunta do formulário é essa, pelo nome do campo. */
export function perguntaDoCampo(nome: string): Pergunta | null {
  const k = normalizarChave(nome);
  if (k.includes("usar_o_lote") || k.includes("lote_para") || k.includes("finalidade")) return "finalidade";
  if (k.includes("pretende_comprar") || k.includes("quando_pretende") || k.includes("prazo")) return "prazo_compra";
  if (k.includes("prefere_pagar") || k.includes("forma_de_pagamento") || k.includes("pagamento")) return "forma_pagamento";
  if (k.includes("agendar") || k.includes("visita")) return "quer_visitar";
  return null;
}

export function objetivoDaFinalidade(finalidade: string | null): LeadParaCrm["objetivo"] {
  if (!finalidade) return null;
  const k = normalizarChave(finalidade);
  if (/(morar|moradia|residir|residencia|casa_propria)/.test(k)) return "moradia";
  if (/(invest|revend|valoriz)/.test(k)) return "investimento";
  if (/(temporada|veraneio|lazer|fim_de_semana|ferias|aluguel_de_temporada)/.test(k)) return "temporada";
  return null;
}

/** Regra combinada: compra nos próximos 3 meses ou quer visitar → Qualificado. */
export function ehQualificado(prazo: string | null, querVisitar: string | null): boolean {
  const p = normalizarChave(prazo ?? "");
  const v = normalizarChave(querVisitar ?? "");
  const prazoCurto = /proxim\w*_3_meses/.test(p) || p === "3_meses" || /ate_3_meses/.test(p);
  const visita = v.startsWith("sim");
  return prazoCurto || visita;
}

/** Converte o lead da Meta no registro do CRM. */
export function leadParaCrm(lead: LeadMeta, formNome: string | null = null): LeadParaCrm {
  const respostas: Record<string, string> = {};
  const perguntas: Partial<Record<Pergunta, string>> = {};
  let teste = false;
  for (const campo of lead.field_data ?? []) {
    const nome = String(campo?.name ?? "");
    const valor = (campo?.values ?? []).map((v) => String(v ?? "")).filter(Boolean).join(", ");
    if (!nome || !valor) continue;
    if (ehDadoDeTeste(valor)) teste = true;
    respostas[normalizarChave(nome)] = valor;
    const pergunta = perguntaDoCampo(nome);
    if (pergunta && !perguntas[pergunta]) perguntas[pergunta] = legivel(valor);
  }
  const pega = (...chaves: string[]) => {
    for (const k of chaves) if (respostas[k]) return respostas[k];
    return null;
  };
  const primeiro = pega("first_name");
  const ultimo = pega("last_name");
  const nomeCompleto = pega("full_name", "nome_completo", "nome") ??
    ([primeiro, ultimo].filter(Boolean).join(" ") || null);
  const telefone = normalizarTelefone(pega("phone_number", "telefone", "whatsapp", "celular"));
  const finalidade = perguntas.finalidade ?? null;
  const prazo = perguntas.prazo_compra ?? null;
  const visitar = perguntas.quer_visitar ?? null;
  const texto = (v: string | undefined) => (v ? String(v) : null);
  return {
    leadgen_id: String(lead.id ?? ""),
    form_id: texto(lead.form_id),
    form_nome: formNome,
    criado_em: texto(lead.created_time),
    nome: (nomeCompleto ?? "").trim() || telefone || "Lead do formulário",
    telefone,
    email: pega("email", "e_mail")?.trim().toLowerCase() ?? null,
    cidade: pega("city", "cidade"),
    finalidade,
    prazo_compra: prazo,
    forma_pagamento: perguntas.forma_pagamento ?? null,
    quer_visitar: visitar,
    objetivo: objetivoDaFinalidade(finalidade),
    qualificado: ehQualificado(prazo, visitar),
    is_teste: teste,
    ad_id: texto(lead.ad_id),
    ad_nome: texto(lead.ad_name),
    conjunto_nome: texto(lead.adset_name),
    campanha_id: texto(lead.campaign_id),
    campanha_nome: texto(lead.campaign_name),
    plataforma: texto(lead.platform),
    bruto: lead,
  };
}
