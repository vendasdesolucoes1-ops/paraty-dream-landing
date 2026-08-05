// Supabase Edge Function — post-processes a lead just created by the public
// landing-page form (anon client). Runs with service_role, so it can do
// everything the anon visitor must NOT be able to: read the lead back, assign
// a salesperson via round-robin, log the origin interaction, and hand off to
// the WhatsApp AI agent.
//
// The anon client inserts the lead WITHOUT a vendedor and WITHOUT reading it
// back (anon has INSERT but not SELECT on leads — reading would 401), then
// calls this function with the normalized phone. Round-robin only advances
// here, after the lead is confirmed to exist — never speculatively before the
// insert, so a failed insert can't burn a salesperson's turn.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { DELAY_MAX_MS, DELAY_MIN_MS, montarAbertura } from "../_shared/primeiro-contato.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface EnrichBody {
  /** id devolvido pelo upsert_lead_from_form. Fonte primária de verdade. */
  lead_id?: string | null;
  telefone: string; // já normalizado (55DDDNUMERO)
  nome?: string;
  cidade?: string | null;
  metragem?: string | null;
  tipo?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: EnrichBody = await req.json();
    const telefone = body.telefone?.trim();
    if (!telefone) throw new Error("telefone is required");

    // O lead vem por id, devolvido pelo RPC — assim a abordagem só acontece se
    // o registro foi mesmo persistido. A busca por telefone fica como fallback
    // para a janela de deploy em que o frontend ainda não manda lead_id (e
    // para o RPC antigo, que era RETURNS void).
    let lead: {
      id: string;
      nome: string | null;
      telefone: string;
      vendedor_id: string | null;
    } | null = null;

    if (body.lead_id) {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, telefone, vendedor_id")
        .eq("id", body.lead_id)
        .maybeSingle();
      if (error) throw error;
      lead = data;
    }

    if (!lead) {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, telefone, vendedor_id")
        .eq("telefone", telefone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      lead = data;
    }

    // Sem lead persistido não há abordagem: falar com quem não tem registro no
    // CRM deixa a conversa órfã e o vendedor sem contexto nenhum.
    if (!lead) throw new Error("lead not found (lead_id e telefone não resolveram)");

    // Round-robin assignment — only now, after the lead is confirmed to exist,
    // and only if it doesn't already have a salesperson.
    if (!lead.vendedor_id) {
      const { data: vendedorId } = await supabase.rpc("get_next_round_robin_salesperson");
      if (vendedorId) {
        await supabase.from("leads").update({ vendedor_id: vendedorId }).eq("id", lead.id);
      }
    }

    // Origin history entry — shows in the CRM lead's "Histórico" tab.
    const detalhes = [
      body.cidade ? `Cidade: ${body.cidade}` : null,
      body.metragem ? `Metragem: ${body.metragem}` : null,
      body.tipo ? `Tipo: ${body.tipo}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    // Wording works for both a brand-new lead and a returning visitor who
    // re-submitted the form (the upsert may have updated an existing lead).
    await supabase.from("interacoes").insert({
      lead_id: lead.id,
      tipo: "sistema",
      canal: "formulario_site",
      conteudo: `Contato recebido pelo formulário do site (Landing Page).${
        detalhes ? ` ${detalhes}.` : ""
      }`,
    });

    // Abordagem inicial da Sophia: entra na fila, não é enviada aqui.
    //
    // A instância conectada NÃO é mais condição para enfileirar — só para
    // enviar. Antes, instância fora do ar significava mensagem evaporada em
    // silêncio; agora a linha fica pendente esperando ela voltar (com teto de
    // 24h, aplicado no banco).
    const partes = montarAbertura({
      nome: body.nome ?? lead.nome ?? null,
      cidade: body.cidade ?? null,
      metragem: body.metragem ?? null,
      tipo: body.tipo ?? null,
    });

    const espera = DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));

    // Conflito com uma linha pendente/enviando do mesmo lead é o caso normal de
    // reenvio do formulário ou retry desta função — o índice único parcial
    // rejeita, e é exatamente o que queremos. Por isso o erro não é lançado.
    const { error: filaError } = await supabase.from("mensagens_agendadas").insert({
      lead_id: lead.id,
      tipo: "primeiro_contato",
      telefone,
      partes,
      agendado_para: new Date(Date.now() + espera).toISOString(),
    });

    if (filaError) {
      console.warn("[enrich-lead] não enfileirou primeiro contato", {
        leadId: lead.id,
        code: filaError.code,
        message: filaError.message,
      });
    }

    return new Response(JSON.stringify({ ok: true, lead_id: lead.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("enrich-lead error", (error as Error)?.message);
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
