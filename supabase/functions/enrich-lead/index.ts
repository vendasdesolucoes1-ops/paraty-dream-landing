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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface EnrichBody {
  telefone: string; // já normalizado (55DDDNUMERO)
  nome?: string;
  cidade?: string | null;
  metragem?: string | null;
  tipo?: string | null;
}

async function triggerAiAgent(telefone: string, nome: string) {
  const { data: instance } = await supabase
    .from("whatsapp_instances")
    .select("instance_name")
    .in("status", ["connected", "open"])
    .limit(1)
    .maybeSingle();

  // No connected WhatsApp instance — nothing to hand off to, that's fine.
  if (!instance) return;

  const timestamp = Date.now();

  await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      event: "messages.upsert",
      instance: instance.instance_name,
      data: {
        key: {
          remoteJid: `${telefone}@s.whatsapp.net`,
          fromMe: false,
          id: `LP_${timestamp}_${telefone}`,
        },
        message: {
          conversation:
            "Olá! Vim pelo site do Moradas de Paraty e gostaria de mais informações sobre os lotes.",
        },
        pushName: nome,
        messageTimestamp: Math.floor(timestamp / 1000),
      },
    }),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: EnrichBody = await req.json();
    const telefone = body.telefone?.trim();
    if (!telefone) throw new Error("telefone is required");

    // Locate the lead the anon client just inserted (telefone has a unique index).
    const { data: lead, error: findError } = await supabase
      .from("leads")
      .select("id, nome, vendedor_id")
      .eq("telefone", telefone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findError) throw findError;
    if (!lead) throw new Error("lead not found for telefone");

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

    await supabase.from("interacoes").insert({
      lead_id: lead.id,
      tipo: "sistema",
      canal: "formulario_site",
      conteudo: `Lead criado pelo formulário do site (Landing Page).${
        detalhes ? ` ${detalhes}.` : ""
      }`,
    });

    // Fire-and-forget WhatsApp AI handoff.
    await triggerAiAgent(telefone, body.nome ?? lead.nome ?? "");

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
