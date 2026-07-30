// Supabase Edge Function — sends a single WhatsApp text message via the Evolution API.
// Called once per contact by the frontend's mass-dispatch loop, which controls the
// delay between sends (client-side) so progress/pause/stop can be shown live and
// large lists never risk an Edge Function timeout.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => vars[key] ?? "");
}

interface DispatchBody {
  instance_name: string;
  phone: string;
  nome?: string;
  message: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instance_name, phone, nome, message }: DispatchBody = await req.json();

    const { data: instance, error } = await supabase
      .from("whatsapp_instances")
      .select("*")
      .eq("instance_name", instance_name)
      .single();
    if (error || !instance) throw new Error("instance not found");
    // Nunca dispara por uma instância desconectada: a Evolution aceitaria a
    // chamada e a mensagem sumiria, ou sairia pelo aparelho errado.
    assertConnected(await getEvolutionSession(instance));

    const text = renderTemplate(message, { nome: nome ?? "", telefone: phone });


    const evolutionResponse = await fetch(
      `${instance.api_url}/message/sendText/${instance_name}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: instance.api_key },
        body: JSON.stringify({ number: phone, text }),
      },
    );

    if (!evolutionResponse.ok) {
      const errText = await evolutionResponse.text();
      throw new Error(`Evolution API sendText error: ${errText}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
