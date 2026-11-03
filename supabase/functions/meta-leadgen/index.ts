// Leads dos formulários de cadastro da Meta (Lead Ads) → CRM.
//
// Função pública (verify_jwt = false), com três portas de entrada:
//   - GET com hub.mode=subscribe: verificação do webhook pela Meta. O token de
//     verificação é derivado do META_APP_SECRET (tokenVerificacao).
//   - POST com X-Hub-Signature-256: evento "leadgen" da Página. A assinatura é
//     conferida com o META_APP_SECRET; o evento fica registrado em
//     meta_leads_formulario e a resposta 200 sai na hora. O lead é lido da Meta
//     e gravado no CRM em segundo plano.
//   - ?acao=… (admin logado ou segredo cron_meta_secret): status, inscrever,
//     teste, importar e processar (reprocessa os pendentes; roda no cron).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { exigirChamador } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { configDoAmbiente, type MetaConfig, MetaGraphClient } from "../_shared/meta-graph.ts";
import {
  assinaturaValida,
  CAMPOS_LEAD,
  eventosLeadgen,
  type LeadMeta,
  leadParaCrm,
  tokenVerificacao,
} from "../_shared/meta-leadgen.ts";

declare const EdgeRuntime: { waitUntil(promessa: Promise<unknown>): void };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_ID_PADRAO = "1125014300252722";
const MAX_TENTATIVAS = 5;

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const log = (
  evento: string,
  dados: Record<string, unknown> = {},
  nivel: "info" | "error" = "info",
) => {
  const linha = JSON.stringify({ origem: "meta-leadgen", evento, ...dados });
  if (nivel === "error") console.error(linha);
  else console.log(linha);
};

const admin = (): SupabaseClient => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const config = (): MetaConfig => configDoAmbiente((n) => Deno.env.get(n));
const appId = (c: MetaConfig) => c.appId ?? APP_ID_PADRAO;

function pageId(c: MetaConfig): string {
  if (!c.pageId) throw new Error("META_PAGE_ID não configurado.");
  return c.pageId;
}

// Token da Página: lido com o token do usuário do sistema e guardado na
// memória da instância (nunca no banco nem em log).
let tokenPagina: { valor: string; em: number } | null = null;
async function clientePagina(c: MetaConfig): Promise<MetaGraphClient> {
  if (!tokenPagina || Date.now() - tokenPagina.em > 30 * 60_000) {
    const sistema = new MetaGraphClient({ config: c });
    const r = await sistema.get<{ access_token?: string }>(pageId(c), { fields: "access_token" });
    if (!r.access_token)
      throw new Error("A Meta não devolveu o token da Página (falta acesso à Página?).");
    tokenPagina = { valor: r.access_token, em: Date.now() };
  }
  return new MetaGraphClient({ config: { ...c, accessToken: tokenPagina.valor } });
}

const clienteApp = (c: MetaConfig) =>
  new MetaGraphClient({ config: { ...c, accessToken: `${appId(c)}|${c.appSecret}` } });

const nomesFormulario = new Map<string, string | null>();
async function nomeDoFormulario(
  pagina: MetaGraphClient,
  formId: string | null,
): Promise<string | null> {
  if (!formId) return null;
  if (!nomesFormulario.has(formId)) {
    try {
      const r = await pagina.get<{ name?: string }>(formId, { fields: "name" });
      nomesFormulario.set(formId, r.name ?? null);
    } catch {
      nomesFormulario.set(formId, null);
    }
  }
  return nomesFormulario.get(formId) ?? null;
}

interface ResultadoCrm {
  lead_id: string;
  novo: boolean;
  duplicado: boolean;
  repetido?: boolean;
  status_crm: string;
  qualificado: boolean;
  vendedor_id: string | null;
}

/** Grava um lead já lido da Meta. */
async function gravar(
  db: SupabaseClient,
  pagina: MetaGraphClient,
  lead: LeadMeta,
  origem: "webhook" | "importacao" | "teste",
  notificar: boolean,
): Promise<ResultadoCrm> {
  const dados = leadParaCrm(lead, await nomeDoFormulario(pagina, lead.form_id ?? null));
  const { data, error } = await db.rpc("registrar_lead_formulario", {
    p: { ...dados, origem_registro: origem, notificar },
  });
  if (error) throw new Error(`registrar_lead_formulario: ${error.message}`);
  return data as ResultadoCrm;
}

/** Lê da Meta e grava os leads pendentes (ou só os informados). */
async function processarPendentes(ids?: string[]) {
  const db = admin();
  let consulta = db
    .from("meta_leads_formulario")
    .select("leadgen_id, origem, tentativas")
    .in("status", ["pendente", "erro"])
    .lt("tentativas", MAX_TENTATIVAS)
    .order("recebido_em")
    .limit(50);
  if (ids?.length) consulta = consulta.in("leadgen_id", ids);
  const { data: fila, error } = await consulta;
  if (error) throw new Error(error.message);
  const resumo = { processados: 0, gravados: 0, erros: 0 };
  if (!fila?.length) return resumo;

  const pagina = await clientePagina(config());
  for (const item of fila) {
    resumo.processados++;
    try {
      const lead = await pagina.get<LeadMeta>(item.leadgen_id, { fields: CAMPOS_LEAD });
      const r = await gravar(db, pagina, lead, item.origem === "teste" ? "teste" : "webhook", true);
      resumo.gravados++;
      log("lead_gravado", { leadgen_id: item.leadgen_id, novo: r.novo, status: r.status_crm });
    } catch (e) {
      resumo.erros++;
      const msg = (e as Error)?.message ?? String(e);
      await db
        .from("meta_leads_formulario")
        .update({ status: "erro", erro: msg.slice(0, 500), tentativas: (item.tentativas ?? 0) + 1 })
        .eq("leadgen_id", item.leadgen_id);
      log("lead_falhou", { leadgen_id: item.leadgen_id, erro: msg.slice(0, 300) }, "error");
    }
  }
  return resumo;
}

// ---------------------------------------------------------------------------
// Ações de administração
// ---------------------------------------------------------------------------

async function status() {
  const c = config();
  const sistema = new MetaGraphClient({ config: c });
  const saida: Record<string, unknown> = {
    secrets: {
      META_APP_ID: !!c.appId,
      META_PAGE_ID: !!c.pageId,
      META_AD_ACCOUNT_ID: !!c.adAccountId,
    },
    callback_url: `${SUPABASE_URL}/functions/v1/meta-leadgen`,
  };
  try {
    const d = await clienteApp(c).get<{ data?: Record<string, unknown> }>("debug_token", {
      input_token: c.accessToken,
    });
    const t = d.data ?? {};
    saida.token = {
      is_valid: t.is_valid,
      type: t.type,
      app_id: t.app_id,
      expires_at: t.expires_at,
      data_access_expires_at: t.data_access_expires_at,
      scopes: t.scopes,
    };
  } catch (e) {
    saida.token_erro = (e as Error).message;
  }
  try {
    const p = await sistema.get<Record<string, unknown>>(pageId(c), { fields: "id,name,tasks" });
    saida.pagina = { id: p.id, nome: p.name };
  } catch (e) {
    saida.pagina_erro = (e as Error).message;
  }
  try {
    const pagina = await clientePagina(c);
    saida.pagina_token = true;
    saida.pagina_apps = await pagina.get(`${pageId(c)}/subscribed_apps`);
    saida.formularios = await pagina.listarTudo(`${pageId(c)}/leadgen_forms`, {
      fields: "id,name,status,leads_count,created_time",
      limit: 100,
    });
  } catch (e) {
    saida.pagina_token_erro = (e as Error).message;
  }
  try {
    saida.app_inscricoes = await clienteApp(c).get(`${appId(c)}/subscriptions`);
  } catch (e) {
    saida.app_inscricoes_erro = (e as Error).message;
  }
  try {
    const app = await clienteApp(c).get<Record<string, unknown>>(appId(c), { fields: "id,name" });
    saida.app = app;
  } catch (e) {
    saida.app_erro = (e as Error).message;
  }
  return saida;
}

async function inscrever() {
  const c = config();
  const saida: Record<string, unknown> = {};
  saida.app = await clienteApp(c).post(`${appId(c)}/subscriptions`, {
    object: "page",
    callback_url: `${SUPABASE_URL}/functions/v1/meta-leadgen`,
    fields: "leadgen",
    verify_token: await tokenVerificacao(c.appSecret),
    include_values: true,
  });
  const pagina = await clientePagina(c);
  // Mantém os campos que o app já recebia nesta Página e acrescenta leadgen.
  const atuais = await pagina.get<{ data?: { id?: string; subscribed_fields?: string[] }[] }>(
    `${pageId(c)}/subscribed_apps`,
  );
  const deste = (atuais.data ?? []).find((a) => String(a.id) === appId(c));
  const campos = new Set([...(deste?.subscribed_fields ?? []), "leadgen"]);
  saida.pagina = await pagina.post(`${pageId(c)}/subscribed_apps`, {
    subscribed_fields: [...campos].join(","),
  });
  saida.pagina_apps = await pagina.get(`${pageId(c)}/subscribed_apps`);
  return saida;
}

/** Cria um lead de teste no formulário (substitui o anterior, se houver). */
async function teste(url: URL) {
  const c = config();
  const pagina = await clientePagina(c);
  const formId = url.searchParams.get("form_id");
  if (!formId) throw new Error("Informe form_id.");
  const form = await pagina.get<{
    questions?: { key?: string; type?: string; options?: { key?: string }[] }[];
  }>(formId, { fields: "name,questions" });
  const antigos = await pagina.get<{ data?: { id: string }[] }>(`${formId}/test_leads`);
  for (const t of antigos.data ?? []) await pagina.post(t.id, { method: "delete" });

  const valores: Record<string, string> = {
    FULL_NAME: "Teste Integração Formulário",
    PHONE: "+55 12 90000-0001",
    EMAIL: "teste.formulario@moradas.invalid",
    CITY: "Taubaté",
  };
  const field_data = (form.questions ?? []).map((q) => {
    const tipo = String(q.type ?? "").toUpperCase();
    let valor = valores[tipo];
    if (!valor && q.options?.length) {
      // Primeira opção, salvo "quer visitar"/"prazo": escolhe a que qualifica.
      const chaves = q.options.map((o) => String(o.key ?? ""));
      valor = chaves.find((k) => /^sim|3_meses/i.test(k)) ?? chaves[0];
    }
    return { name: q.key, values: [valor ?? "teste"] };
  });
  const criado = await pagina.post<{ id?: string }>(`${formId}/test_leads`, {
    field_data: JSON.stringify(field_data),
  });
  return { test_lead_id: criado.id ?? null, perguntas: field_data.map((f) => f.name) };
}

/** Importa os leads do(s) formulário(s) criados a partir de `desde`. */
async function importar(url: URL) {
  const c = config();
  const db = admin();
  const pagina = await clientePagina(c);
  const desde = url.searchParams.get("desde") ?? "2026-10-27";
  const desdeEpoch = Math.floor(new Date(`${desde}T00:00:00-03:00`).getTime() / 1000);
  let formIds = url.searchParams.get("form_id")?.split(",").filter(Boolean) ?? [];
  if (!formIds.length) {
    const forms = await pagina.listarTudo<{ id: string }>(`${pageId(c)}/leadgen_forms`, {
      fields: "id",
      limit: 100,
    });
    formIds = forms.map((f) => f.id);
  }

  const resumo = {
    formularios: formIds.length,
    lidos: 0,
    novos: 0,
    duplicados: 0,
    repetidos: 0,
    qualificados: 0,
    testes_ignorados: 0,
    erros: [] as string[],
  };
  const porVendedor = new Map<string, number>();
  for (const formId of formIds) {
    const filtro = JSON.stringify([
      { field: "time_created", operator: "GREATER_THAN", value: desdeEpoch - 1 },
    ]);
    for await (const lote of pagina.paginar<LeadMeta>(`${formId}/leads`, {
      fields: CAMPOS_LEAD,
      filtering: filtro,
      limit: 100,
    })) {
      for (const lead of lote) {
        resumo.lidos++;
        try {
          if (leadParaCrm(lead).is_teste) {
            resumo.testes_ignorados++;
            continue;
          }
          const r = await gravar(
            db,
            pagina,
            { ...lead, form_id: lead.form_id ?? formId },
            "importacao",
            false,
          );
          if (r.repetido) resumo.repetidos++;
          else if (r.novo) resumo.novos++;
          else resumo.duplicados++;
          if (r.qualificado) resumo.qualificados++;
          if (!r.repetido && r.vendedor_id) {
            porVendedor.set(r.vendedor_id, (porVendedor.get(r.vendedor_id) ?? 0) + 1);
          }
        } catch (e) {
          resumo.erros.push(`${lead.id}: ${(e as Error).message}`.slice(0, 300));
        }
      }
    }
  }
  // Um aviso por vendedor em vez de um por lead antigo.
  for (const [vendedorId, n] of porVendedor) {
    const { error } = await db.rpc("avisar_vendedor_formulario", {
      p_vendedor_id: vendedorId,
      p_quantidade: n,
    });
    if (error) log("aviso_falhou", { erro: error.message }, "error");
  }
  // Rodízio desligado: um aviso só, para a gestão.
  const gravados = resumo.novos + resumo.duplicados;
  if (!porVendedor.size && gravados > 0) {
    const { error } = await db.rpc("notificar_gestao", {
      p_tipo: "lead_formulario",
      p_titulo: "Leads antigos do formulário importados",
      p_corpo: `${gravados} leads do Formulário Meta entraram no CRM (${resumo.qualificados} qualificados), sem vendedor atribuído.`,
      p_link: "/dashboard/crm",
    });
    if (error) log("aviso_falhou", { erro: error.message }, "error");
  }
  return resumo;
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);

  // 1) Verificação do webhook.
  if (req.method === "GET" && url.searchParams.get("hub.mode")) {
    const appSecret = Deno.env.get("META_APP_SECRET") ?? "";
    const esperado = appSecret ? await tokenVerificacao(appSecret) : "";
    const recebido = url.searchParams.get("hub.verify_token") ?? "";
    if (url.searchParams.get("hub.mode") === "subscribe" && esperado && recebido === esperado) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    log("verificacao_recusada", {}, "error");
    return new Response("Forbidden", { status: 403 });
  }

  // 2) Evento da Meta.
  const assinatura = req.headers.get("x-hub-signature-256");
  if (req.method === "POST" && assinatura) {
    const corpo = new Uint8Array(await req.arrayBuffer());
    if (!(await assinaturaValida(corpo, assinatura, Deno.env.get("META_APP_SECRET") ?? ""))) {
      log("assinatura_invalida", {}, "error");
      return new Response("Forbidden", { status: 403 });
    }
    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(corpo));
    } catch {
      return new Response("ok", { status: 200 });
    }
    const eventos = eventosLeadgen(payload);
    if (!eventos.length) return new Response("ok", { status: 200 });
    const db = admin();
    const { error } = await db.from("meta_leads_formulario").upsert(
      eventos.map((e) => ({
        leadgen_id: e.leadgen_id,
        form_id: e.form_id,
        ad_id: e.ad_id,
        page_id: e.page_id,
        criado_meta_em: e.created_time ? new Date(e.created_time * 1000).toISOString() : null,
        evento: e,
      })),
      { onConflict: "leadgen_id", ignoreDuplicates: true },
    );
    if (error) {
      log("evento_nao_gravado", { erro: error.message }, "error");
      // 500 faz a Meta reenviar mais tarde.
      return new Response("erro", { status: 500 });
    }
    log("eventos_recebidos", { quantidade: eventos.length });
    const ids = eventos.map((e) => e.leadgen_id);
    EdgeRuntime.waitUntil(
      processarPendentes(ids).catch((e) =>
        log("processamento_falhou", { erro: String(e?.message ?? e) }, "error"),
      ),
    );
    return new Response("ok", { status: 200 });
  }

  // 3) Ações de administração.
  const chamador = await exigirChamador(req, { segredos: ["cron_meta_secret"], papeis: ["admin"] });
  if (chamador instanceof Response) return chamador;
  const acao = url.searchParams.get("acao") ?? "processar";
  try {
    switch (acao) {
      case "status":
        return json({ ok: true, ...(await status()) });
      case "inscrever":
        return json({ ok: true, ...(await inscrever()) });
      case "teste":
        return json({ ok: true, ...(await teste(url)) });
      case "importar":
        return json({ ok: true, ...(await importar(url)) });
      case "processar":
        return json({ ok: true, ...(await processarPendentes()) });
      default:
        return json({ ok: false, erro: "ação desconhecida" }, 400);
    }
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    log("acao_falhou", { acao, erro: msg.slice(0, 300) }, "error");
    return json({ ok: false, erro: msg }, 500);
  }
});
