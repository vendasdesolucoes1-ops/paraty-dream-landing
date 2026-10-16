// Sugestão da IA para uma etapa de follow-up que aguarda aprovação humana
// (piloto da issue #52).
//
// A IA reescreve a mensagem DENTRO do template aprovado, com o contexto da
// conversa. A sugestão não sai sozinha: volta para o painel, onde um gestor
// edita, aprova ou rejeita. Guardrails: sem valores (R$, parcelas, %), sem
// mais mensagens que o template, sem marcas. Recusada pelo filtro, devolve o
// próprio template. O motivo da IA e a versão do prompt ficam no item da fila.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { exigirChamador, PAPEIS_GESTAO } from "../_shared/auth.ts";
import { fetchComRetry } from "../_shared/http.ts";
import { registrarChamadaIA } from "../_shared/telemetria.ts";
import { MODELOS } from "../_shared/modelos.ts";
import {
  FORMATO_REDACAO,
  lerRedacao,
  promptRedator,
  recusaDaRedacao,
  VERSAO_REDATOR,
} from "../_shared/intencao-followup.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MODELO = MODELOS.followUpRedator.id;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const chamador = await exigirChamador(req, { papeis: PAPEIS_GESTAO, serviceRole: false });
  if (chamador instanceof Response) return chamador;

  try {
    const { mensagem_id } = (await req.json().catch(() => ({}))) as { mensagem_id?: string };
    if (!mensagem_id) return json({ error: "mensagem_id obrigatório" }, 400);

    const { data: item } = await supabase
      .from("mensagens_agendadas")
      .select("id, lead_id, status, partes, inscricao_id, etapa_ordem")
      .eq("id", mensagem_id)
      .maybeSingle();
    if (!item || item.status !== "aguardando_aprovacao") {
      return json({ error: "Envio não está aguardando aprovação." }, 409);
    }

    // O texto renderizado do template (já com nome e datas) é o teto.
    const template = (Array.isArray(item.partes) ? item.partes : []) as string[];

    const { data: historico } = await supabase
      .from("whatsapp_messages")
      .select("from_me, content, created_at")
      .eq("lead_id", item.lead_id)
      .neq("content", "")
      .order("created_at", { ascending: false })
      .limit(8);
    const conversa = (historico ?? [])
      .reverse()
      .map((m) => `${m.from_me ? "Nós" : "Lead"}: ${String(m.content).slice(0, 400)}`)
      .join("\n");

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ partes: template, motivo: "IA indisponível: mantido o template." });

    const inicio = Date.now();
    let erro: string | null = null;
    let usage: { prompt_tokens?: number; completion_tokens?: number } | null = null;
    let conteudo = "";
    try {
      const resposta = await fetchComRetry(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODELO,
            temperature: MODELOS.followUpRedator.temperatura,
            max_tokens: 400,
            response_format: FORMATO_REDACAO,
            messages: [
              { role: "system", content: promptRedator() },
              {
                role: "user",
                content: `TEMPLATE APROVADO (JSON):\n${JSON.stringify(template)}\n\nHISTÓRICO RECENTE:\n${conversa || "(sem conversa)"}`,
              },
            ],
          }),
        },
        { timeoutMs: 20_000, retries: 1 },
      );
      if (resposta.ok) {
        const dados = await resposta.json();
        usage = dados.usage ?? null;
        conteudo = dados.choices?.[0]?.message?.content ?? "";
      } else {
        erro = `HTTP ${resposta.status}`;
        await resposta.body?.cancel();
      }
    } catch (e) {
      erro = (e as Error).message;
    }
    await registrarChamadaIA(supabase, {
      funcao: "followup-redator",
      modelo: MODELO,
      leadId: item.lead_id,
      usage,
      latenciaMs: Date.now() - inicio,
      erro,
      versaoPrompt: VERSAO_REDATOR,
    });

    const redacao = lerRedacao(conteudo);
    const recusa = redacao ? recusaDaRedacao(redacao, template) : "resposta inválida da IA";
    const final =
      recusa || !redacao
        ? { partes: template, motivo: `Sugestão descartada (${recusa}); mantido o template.` }
        : redacao;

    await supabase
      .from("mensagens_agendadas")
      .update({ ia_motivo: final.motivo, ia_prompt_versao: VERSAO_REDATOR })
      .eq("id", item.id)
      .eq("status", "aguardando_aprovacao");

    return json({ partes: final.partes, motivo: final.motivo, filtrada: Boolean(recusa) });
  } catch (e) {
    console.error("[followup-redigir] erro:", (e as Error).message);
    return json({ error: "Falha ao gerar sugestão." }, 500);
  }
});
