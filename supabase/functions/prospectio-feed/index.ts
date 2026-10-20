// Agenda do Prospectio — lê, só leitura, os posts que a agência agendou no
// Prospectio para o Instagram do Moradas (datas, legendas, imagens, status e
// métricas) e devolve para a aba Marketing → Agenda.
//
// O token do Prospectio fica em configuracoes.prospectio_feed_token (chave
// sensível: só a gestão lê, ver chave_configuracao_sensivel) e nunca vai para
// o navegador — o painel chama esta função e ela fala com o Prospectio.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { exigirChamador, PAPEIS_GESTAO } from "../_shared/auth.ts";
import { fetchComRetry } from "../_shared/http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const URL_PADRAO = "https://prospectio.com.br/api/integracoes/marketing/posts";

// Erros de configuração/integração voltam 200 com { error } para o painel
// mostrar a mensagem (o invoke do supabase-js esconde o corpo de um não-2xx).
function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const chamador = await exigirChamador(req, { papeis: PAPEIS_GESTAO });
  if (chamador instanceof Response) return chamador;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: config, error: erroConfig } = await admin
    .from("configuracoes")
    .select("chave, valor")
    .in("chave", ["prospectio_feed_token", "prospectio_feed_url"]);
  if (erroConfig) return responder({ error: "Não foi possível ler a configuração." });
  const cfg = Object.fromEntries((config ?? []).map((c) => [c.chave, (c.valor ?? "").trim()]));

  const token = cfg.prospectio_feed_token;
  if (!token) {
    return responder({
      error: "Integração com o Prospectio não configurada. Cole o token em Marketing → Agenda.",
      configurado: false,
    });
  }
  const url = cfg.prospectio_feed_url || URL_PADRAO;

  try {
    const resposta = await fetchComRetry(
      url,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
      { timeoutMs: 25_000, retries: 1 },
    );
    if (resposta.status === 401) {
      await resposta.body?.cancel();
      return responder({
        error: "O Prospectio recusou o token (revogado ou trocado). Gere um novo e cole aqui.",
      });
    }
    const corpo = await resposta.json().catch(() => null);
    if (!resposta.ok || !corpo?.ok) {
      console.error("[prospectio-feed] resposta inesperada", resposta.status, corpo);
      return responder({
        error: corpo?.error ?? `O Prospectio não respondeu (HTTP ${resposta.status}).`,
      });
    }
    return responder(corpo);
  } catch (e) {
    console.error("[prospectio-feed] falha ao consultar o Prospectio", e);
    return responder({ error: "Não foi possível falar com o Prospectio agora." });
  }
});
