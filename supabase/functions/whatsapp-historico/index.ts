// Supabase Edge Function — histórico da Evolution e configuração do webhook.
//
// Ações (só gestão ou service_role):
//   conversa            — mensagens de UM telefone na Evolution × no banco:
//                         quantas enviadas pelo celular (fromMe) faltam no CRM
//                         e se o contato aparece como @lid.
//   contar              — o que a importação dos últimos N dias (padrão 30)
//                         traria: mensagens novas, enviadas pelo celular, leads
//                         existentes × novos, @lid sem telefone. Não grava nada.
//   importar            — grava o que `contar` mostrou (mesmos filtros).
//   configurar_webhook  — aponta o webhook da Evolution para a whatsapp-webhook
//                         com ?token= do Vault, sem o segredo passar pelo painel.
//   ver_webhook         — mostra a configuração atual (URL sem o token).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { exigirChamador, PAPEIS_GESTAO } from "../_shared/auth.ts";
import { fetchComRetry } from "../_shared/http.ts";
import { chaveTelefone } from "../_shared/contato-bloqueado.ts";
import { extrairTexto } from "../_shared/mensagem-entrada.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Instancia {
  id: string;
  api_url: string;
  api_key: string;
  instance_name: string;
}

// deno-lint-ignore no-explicit-any
type Registro = Record<string, any>;

async function instancia(): Promise<Instancia> {
  const { data } = await supabase
    .from("whatsapp_instances")
    .select("id, api_url, api_key, instance_name, status")
    .order("created_at");
  const lista = (data ?? []) as (Instancia & { status: string })[];
  const escolhida = lista.find((i) => i.status === "open") ?? lista[0];
  if (!escolhida) throw new Error("nenhuma instância cadastrada");
  return { ...escolhida, api_url: escolhida.api_url.replace(/\/$/, "") };
}

async function evolution(i: Instancia, caminho: string, corpo?: unknown, metodo = "POST") {
  const r = await fetchComRetry(
    `${i.api_url}${caminho}`,
    {
      method: metodo,
      headers: { "Content-Type": "application/json", apikey: i.api_key },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    },
    { timeoutMs: 30_000 },
  );
  const texto = await r.text();
  let dados: unknown = null;
  try {
    dados = JSON.parse(texto);
  } catch {
    dados = texto;
  }
  if (!r.ok) throw new Error(`Evolution ${caminho}: HTTP ${r.status} ${texto.slice(0, 200)}`);
  return dados as Registro;
}

/** Uma página de mensagens; a Evolution v2 devolve {messages:{records,pages}}. */
async function pagina(i: Instancia, where: Registro, page: number) {
  const r = await evolution(i, `/chat/findMessages/${encodeURIComponent(i.instance_name)}`, {
    where,
    page,
    offset: 100,
  });
  const bloco = (r.messages ?? r) as Registro;
  const registros = (bloco.records ?? (Array.isArray(r) ? r : [])) as Registro[];
  return { registros, paginas: Number(bloco.pages ?? 1) };
}

function telefoneDo(reg: Registro): { telefone: string | null; lid: boolean } {
  const key = reg.key ?? {};
  const candidatos = [key.remoteJid, key.remoteJidAlt, key.senderPn, reg.remoteJidAlt];
  const lid = String(key.remoteJid ?? "").includes("@lid");
  for (const c of candidatos) {
    const s = String(c ?? "");
    if (s.endsWith("@s.whatsapp.net")) return { telefone: s.split("@")[0].replace(/\D/g, ""), lid };
  }
  return { telefone: null, lid };
}

function instanteDe(reg: Registro): Date {
  const t = Number(reg.messageTimestamp ?? 0);
  return new Date(t > 1e12 ? t : t * 1000);
}

async function leadPorTelefone(telefone: string): Promise<{ id: string } | null> {
  const chave = chaveTelefone(telefone);
  if (!chave) return null;
  const { data } = await supabase
    .from("leads")
    .select("id")
    .eq("telefone_chave", chave)
    .is("deletado_em", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null) ?? null;
}

async function idsNoBanco(ids: string[]): Promise<Set<string>> {
  const existentes = new Set<string>();
  for (let k = 0; k < ids.length; k += 200) {
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("message_id")
      .in("message_id", ids.slice(k, k + 200));
    for (const r of data ?? []) existentes.add(String(r.message_id));
  }
  return existentes;
}

async function conversa(i: Instancia, telefoneBruto: string) {
  const telefone = telefoneBruto.replace(/\D/g, "");
  const jid = `${telefone}@s.whatsapp.net`;
  const coletar = async (where: Registro) => {
    const todos: Registro[] = [];
    for (let p = 1; p <= 10; p++) {
      const { registros, paginas } = await pagina(i, where, p);
      todos.push(...registros);
      if (p >= paginas || registros.length === 0) break;
    }
    return todos;
  };
  const porJid = await coletar({ key: { remoteJid: jid } });
  // Contato que virou @lid: procura pelo telefone alternativo também.
  const porAlt = await coletar({ key: { remoteJidAlt: jid } }).catch(() => [] as Registro[]);
  const mapa = new Map<string, Registro>();
  for (const r of [...porJid, ...porAlt]) mapa.set(String(r.key?.id), r);
  const registros = [...mapa.values()];
  const noBanco = await idsNoBanco(registros.map((r) => String(r.key?.id)));
  const lids = new Set(
    registros.map((r) => String(r.key?.remoteJid ?? "")).filter((j) => j.includes("@lid")),
  );
  const faltando = registros.filter((r) => !noBanco.has(String(r.key?.id)));
  return {
    telefone,
    na_evolution: registros.length,
    enviadas_pelo_numero: registros.filter((r) => r.key?.fromMe).length,
    recebidas: registros.filter((r) => !r.key?.fromMe).length,
    faltando_no_crm: faltando.length,
    enviadas_faltando: faltando.filter((r) => r.key?.fromMe).length,
    contato_como_lid: lids.size > 0,
    exemplos_faltando: faltando.slice(0, 5).map((r) => ({
      quando: instanteDe(r).toISOString(),
      de_nos: Boolean(r.key?.fromMe),
      jid_tipo: String(r.key?.remoteJid ?? "").split("@")[1] ?? null,
      tipo: r.messageType ?? null,
    })),
  };
}

interface Plano {
  dias: number;
  lidas: number;
  novas: Registro[];
  ja_no_crm: number;
  sem_telefone_lid: number;
  grupos: number;
}

async function planejar(i: Instancia, dias: number): Promise<Plano> {
  const limite = Date.now() - dias * 86_400_000;
  const todas: Registro[] = [];
  for (let p = 1; p <= 200; p++) {
    const { registros, paginas } = await pagina(i, {}, p);
    if (!registros.length) break;
    todas.push(...registros);
    const maisAntiga = Math.min(...registros.map((r) => instanteDe(r).getTime()));
    if (maisAntiga < limite || p >= paginas) break;
  }
  const doPeriodo = todas.filter((r) => instanteDe(r).getTime() >= limite);
  const grupos = doPeriodo.filter((r) => String(r.key?.remoteJid ?? "").endsWith("@g.us")).length;
  const individuais = doPeriodo.filter((r) => !String(r.key?.remoteJid ?? "").endsWith("@g.us"));
  const noBanco = await idsNoBanco(individuais.map((r) => String(r.key?.id)));
  const novas = individuais.filter((r) => !noBanco.has(String(r.key?.id)));
  return {
    dias,
    lidas: doPeriodo.length,
    novas,
    ja_no_crm: individuais.length - novas.length,
    sem_telefone_lid: novas.filter((r) => !telefoneDo(r).telefone).length,
    grupos,
  };
}

async function resumoDoPlano(plano: Plano) {
  const telefones = new Map<string, boolean>();
  for (const r of plano.novas) {
    const { telefone } = telefoneDo(r);
    if (telefone && !telefones.has(telefone))
      telefones.set(telefone, Boolean(await leadPorTelefone(telefone)));
  }
  const comTelefone = plano.novas.filter((r) => telefoneDo(r).telefone);
  return {
    dias: plano.dias,
    mensagens_no_periodo: plano.lidas,
    ja_no_crm: plano.ja_no_crm,
    novas: plano.novas.length,
    novas_enviadas_pelo_numero: comTelefone.filter((r) => r.key?.fromMe).length,
    novas_recebidas: comTelefone.filter((r) => !r.key?.fromMe).length,
    contatos: telefones.size,
    contatos_com_lead: [...telefones.values()].filter(Boolean).length,
    contatos_sem_lead: [...telefones.values()].filter((v) => !v).length,
    lid_sem_telefone_ignoradas: plano.sem_telefone_lid,
    grupos_ignorados: plano.grupos,
  };
}

async function importar(i: Instancia, plano: Plano, criarLeads: boolean) {
  let gravadas = 0;
  let leadsCriados = 0;
  const cache = new Map<string, string | null>();
  for (const r of plano.novas) {
    const { telefone } = telefoneDo(r);
    if (!telefone) continue;
    let leadId = cache.get(telefone);
    if (leadId === undefined) {
      leadId = (await leadPorTelefone(telefone))?.id ?? null;
      if (!leadId && criarLeads) {
        const { data } = await supabase
          .from("leads")
          .insert({
            nome: r.key?.fromMe ? telefone : (r.pushName ?? telefone),
            telefone,
            origem: "whatsapp",
            status_crm: "novo",
          })
          .select("id")
          .single();
        leadId = (data?.id as string | undefined) ?? null;
        if (leadId) leadsCriados++;
      }
      cache.set(telefone, leadId);
    }
    if (!leadId) continue;
    const { error } = await supabase.from("whatsapp_messages").insert({
      instance_id: i.id,
      lead_id: leadId,
      remote_jid: `${telefone}@s.whatsapp.net`,
      message_id: String(r.key?.id),
      from_me: Boolean(r.key?.fromMe),
      // Importado: o que saiu do nosso número e não estava no CRM foi digitado
      // no celular (o que a Sophia/fila envia já é gravado antes do envio).
      autor: r.key?.fromMe ? "equipe_celular" : "lead",
      message_type: r.messageType ?? "text",
      content: extrairTexto(r.message),
      status: r.key?.fromMe ? "sent" : "received",
      created_at: instanteDe(r).toISOString(),
    });
    if (!error) gravadas++;
  }
  return { gravadas, leads_criados: leadsCriados };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const chamador = await exigirChamador(req, { papeis: PAPEIS_GESTAO });
  if (chamador instanceof Response) return chamador;

  try {
    const body = await req.json().catch(() => ({}));
    const acao = String(body.acao ?? "");
    const i = await instancia();

    if (acao === "conversa") {
      const telefones = ((body.telefones ?? [body.telefone]) as string[]).filter(Boolean);
      const resultados: Awaited<ReturnType<typeof conversa>>[] = [];
      for (const t of telefones.slice(0, 10)) resultados.push(await conversa(i, String(t)));
      return json({ ok: true, instancia: i.instance_name, resultados });
    }

    if (acao === "contar" || acao === "importar") {
      const dias = Math.min(Math.max(Number(body.dias ?? 30), 1), 90);
      const plano = await planejar(i, dias);
      const resumo = await resumoDoPlano(plano);
      if (acao === "contar") return json({ ok: true, ...resumo });
      const r = await importar(i, plano, body.criar_leads === true);
      return json({ ok: true, ...resumo, ...r });
    }

    if (acao === "ver_webhook") {
      const atual = await evolution(
        i,
        `/webhook/find/${encodeURIComponent(i.instance_name)}`,
        undefined,
        "GET",
      );
      const url = String((atual.webhook ?? atual).url ?? "");
      return json({
        ok: true,
        url_sem_token: url.replace(/([?&]token=)[^&]+/, "$1***"),
        tem_token: /[?&]token=/.test(url),
        eventos: (atual.webhook ?? atual).events ?? null,
        ativo: (atual.webhook ?? atual).enabled ?? null,
      });
    }

    if (acao === "configurar_webhook") {
      const { data: segredo } = await supabase.rpc("segredo_webhook_evolution");
      if (!segredo)
        return json({ error: "segredo evolution_webhook_secret ausente no Vault" }, 400);
      const url = `${SUPABASE_URL}/functions/v1/whatsapp-webhook?token=${encodeURIComponent(String(segredo))}`;
      const eventos = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED"];
      const caminho = `/webhook/set/${encodeURIComponent(i.instance_name)}`;
      try {
        await evolution(i, caminho, {
          webhook: { enabled: true, url, byEvents: false, base64: true, events: eventos },
        });
      } catch {
        // Evolution v1: corpo sem o envelope "webhook".
        await evolution(i, caminho, {
          enabled: true,
          url,
          webhook_by_events: false,
          webhook_base64: true,
          events: eventos,
        });
      }
      return json({ ok: true, url_sem_token: url.replace(/(token=)[^&]+/, "$1***") });
    }

    return json({ error: "ação desconhecida" }, 400);
  } catch (e) {
    console.error("[whatsapp-historico]", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
