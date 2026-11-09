// Aviso por WhatsApp ao vendedor quando um lead é atribuído a ele.
//
// Acionada pelo cron a cada minuto (ver a migration
// 20261109100000_aviso_vendedor_whatsapp.sql), só quando há aviso esperando.
// O gatilho `leads_avisar_vendedor` enfileira em `avisos_vendedor` toda
// atribuição — rodízio, distribuição da espera, Formulário Meta, CRM — e aqui
// o aviso sai pelo número da empresa, como o resumo da qualificação.
//
// O eco desta mensagem (fromMe para o telefone do vendedor) é ignorado pelo
// webhook (ehTelefoneDeVendedor), então não abre takeover nem cria lead.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { exigirChamador } from "../_shared/auth.ts";
import { sendWhatsAppText } from "../_shared/evolution-send.ts";
import { enviarTextoRegistrado } from "../_shared/envio-registrado.ts";
import { montarAviso } from "../_shared/aviso-vendedor.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const LOTE = 20;
const MAX_TENTATIVAS = 3;
const SEM_INSTANCIA_MS = 5 * 60 * 1000;

interface Aviso {
  id: string;
  lead_id: string;
  vendedor_id: string;
  origem: string;
  tentativas: number;
  criado_em: string;
}

interface Instancia {
  id: string;
  api_url: string;
  api_key: string;
  instance_name: string;
}

async function atualizar(id: string, campos: Record<string, unknown>) {
  await supabase
    .from("avisos_vendedor")
    .update({ ...campos, atualizado_em: new Date().toISOString() })
    .eq("id", id);
}

/** Instância caída não é falha do aviso; 4xx da Evolution não melhora com retry. */
function classificar(motivo: string): "instancia" | "permanente" | "transitorio" {
  if (/connection closed|not connected|instance.*(not found|closed)|desconect/i.test(motivo)) {
    return "instancia";
  }
  const status = Number(/error: (\d{3})/.exec(motivo)?.[1] ?? 0);
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return "permanente";
  return "transitorio";
}

async function falhou(a: Aviso, motivo: string, nomeVendedor: string) {
  const classe = classificar(motivo);
  if (classe === "instancia") {
    await atualizar(a.id, {
      status: "pendente",
      erro: motivo.slice(0, 2000),
      agendado_para: new Date(Date.now() + SEM_INSTANCIA_MS).toISOString(),
    });
    return;
  }
  const tentativas = a.tentativas + 1;
  const desistir = classe === "permanente" || tentativas >= MAX_TENTATIVAS;
  await atualizar(a.id, {
    status: desistir ? "erro" : "pendente",
    tentativas,
    erro: `[${classe}] ${motivo}`.slice(0, 2000),
    agendado_para: new Date(Date.now() + 2 * 60_000 * 4 ** (tentativas - 1)).toISOString(),
  });
  if (!desistir) return;

  // Desistir não pode ser silencioso: fica na linha do tempo do lead e no sino da gestão.
  const aviso = `Aviso de lead novo não enviado por WhatsApp para ${nomeVendedor}: ${motivo.slice(0, 200)}`;
  await supabase
    .from("interacoes")
    .insert({ lead_id: a.lead_id, tipo: "sistema", canal: "sistema", conteudo: aviso });
  const { data: gestao } = await supabase
    .from("profiles")
    .select("id")
    .in("role", ["admin", "gestor"])
    .eq("ativo", true)
    .is("deletado_em", null);
  if (gestao?.length) {
    await supabase.from("notifications").insert(
      gestao.map((p) => ({
        user_id: p.id,
        type: "fila_erro",
        title: "Aviso ao vendedor não enviado",
        body: aviso,
        link: `/dashboard/crm?lead=${a.lead_id}`,
      })),
    );
  }
}

async function processar(
  a: Aviso,
  instancia: Instancia,
): Promise<"enviado" | "cancelado" | "falha"> {
  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id, nome, telefone, cidade, objetivo, metragem_interesse, origem, formulario_nome, campanha_nome, vendedor_id, deletado_em, is_teste",
    )
    .eq("id", a.lead_id)
    .maybeSingle();
  if (!lead || lead.deletado_em || lead.is_teste) {
    await atualizar(a.id, { status: "cancelado", erro: "lead excluído ou de teste" });
    return "cancelado";
  }
  if (lead.vendedor_id !== a.vendedor_id) {
    await atualizar(a.id, { status: "cancelado", erro: "lead passou para outro vendedor" });
    return "cancelado";
  }

  const { data: vendedor } = await supabase
    .from("vendedores")
    .select("nome, telefone, ativo")
    .eq("id", a.vendedor_id)
    .maybeSingle();
  const destino = String(vendedor?.telefone ?? "").replace(/\D/g, "");
  if (!vendedor?.ativo || !destino) {
    await atualizar(a.id, { status: "cancelado", erro: "vendedor inativo ou sem telefone" });
    return "cancelado";
  }

  // A Sophia qualificou e mandou o resumo (mais completo) depois da
  // atribuição: este aviso seria repetido.
  const desde = new Date(new Date(a.criado_em).getTime() - 2 * 60_000).toISOString();
  const { data: resumo } = await supabase
    .from("interacoes")
    .select("id")
    .eq("lead_id", a.lead_id)
    .eq("canal", "qualificacao")
    .gte("created_at", desde)
    .limit(1);
  if ((resumo ?? []).length > 0) {
    await atualizar(a.id, { status: "cancelado", erro: "resumo da qualificação já enviado" });
    return "cancelado";
  }

  try {
    await enviarTextoRegistrado(
      supabase,
      (i, tel, txt) => sendWhatsAppText(i.api_url, i.api_key, i.instance_name, tel, txt),
      instancia,
      destino,
      montarAviso(lead, a.origem === "manual"),
      { autor: "sistema" },
    );
  } catch (e) {
    await falhou(a, (e as Error)?.message ?? String(e), vendedor.nome ?? "o vendedor");
    return "falha";
  }

  await atualizar(a.id, { status: "enviado", enviado_em: new Date().toISOString(), erro: null });
  await supabase.from("interacoes").insert({
    lead_id: a.lead_id,
    tipo: "sistema",
    canal: "sistema",
    conteudo: `Aviso do lead enviado por WhatsApp para ${vendedor.nome ?? "o vendedor"} (${destino}).`,
  });
  return "enviado";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const chamador = await exigirChamador(req, { segredos: ["cron_fila_secret"] });
  if (chamador instanceof Response) return chamador;

  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { data, error } = await supabase.rpc("reivindicar_avisos_vendedor", { p_limite: LOTE });
    if (error) throw error;
    const avisos = (data ?? []) as Aviso[];
    if (avisos.length === 0) return json({ ok: true, processados: 0 });

    // Mesma escolha da fila de mensagens: a instância do agente ativo, se
    // conectada; senão a conectada mais antiga.
    const { data: conectadas } = await supabase
      .from("whatsapp_instances")
      .select("id, api_url, api_key, instance_name")
      .in("status", ["connected", "open"])
      .order("created_at", { ascending: true });
    const { data: agentes } = await supabase
      .from("ai_agents")
      .select("instance_id")
      .eq("is_active", true);
    const comAgente = new Set((agentes ?? []).map((a) => a.instance_id));
    const instancia =
      (conectadas ?? []).find((i) => comAgente.has(i.id)) ?? (conectadas ?? [])[0] ?? null;

    if (!instancia) {
      console.warn("[avisar-vendedor] nenhuma instância conectada", { adiados: avisos.length });
      await supabase
        .from("avisos_vendedor")
        .update({
          status: "pendente",
          erro: "nenhuma instância conectada",
          agendado_para: new Date(Date.now() + SEM_INSTANCIA_MS).toISOString(),
          atualizado_em: new Date().toISOString(),
        })
        .in(
          "id",
          avisos.map((a) => a.id),
        );
      return json({ ok: true, processados: 0, sem_instancia: true });
    }

    const resultado = { enviado: 0, cancelado: 0, falha: 0 };
    for (const a of avisos) {
      try {
        resultado[await processar(a, instancia as Instancia)]++;
      } catch (e) {
        console.error("[avisar-vendedor] falhou", { id: a.id, erro: (e as Error)?.message });
        await falhou(a, (e as Error)?.message ?? String(e), "o vendedor");
        resultado.falha++;
      }
    }
    console.log("[avisar-vendedor] lote", resultado);
    return json({ ok: true, processados: avisos.length, ...resultado });
  } catch (e) {
    console.error("[avisar-vendedor] erro:", e);
    return json({ error: (e as Error)?.message ?? String(e) }, 500);
  }
});
