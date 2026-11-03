// Saldo ao vivo da conta de anúncios para a tela de Marketing (aba Visão geral
// e Anúncios). Lê direto da Meta a cada chamada, com um cache de 30 s por
// instância para que várias abas abertas não multipliquem as consultas.
// Só a gestão (admin e gestor) pode chamar, além do segredo de máquina
// cron_meta_secret: o cron meta-saldo-alerta confere o saldo de hora em hora.
// O saldo não é gravado no banco; quando ele (ou o limite) cobre menos de
// 3 dias, a função manda um aviso para o sino da gestão (no máximo um a cada 12 h).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { exigirChamador, PAPEIS_GESTAO } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  configDoAmbiente,
  MetaApiError,
  MetaGraphClient,
  MetaTokenInvalidoError,
} from "../_shared/meta-graph.ts";
import { avaliarAlerta, consultarSaldo, type SaldoConta } from "../_shared/meta-saldo.ts";

const CACHE_MS = 30_000;
let cache: { em: number; saldo: SaldoConta } | null = null;

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/**
 * Saldo acabando (ou conta parada) → aviso no sino da gestão. O banco segura
 * repetições: no máximo um aviso a cada 12 h (alertar_saldo_meta).
 */
async function avisarSeAcabando(saldo: SaldoConta) {
  const alerta = avaliarAlerta(saldo);
  if (!alerta) return;
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error } = await admin.rpc("alertar_saldo_meta", {
      p_titulo: alerta.titulo,
      p_detalhe: alerta.detalhe,
    });
    if (error)
      console.error(
        JSON.stringify({ origem: "meta-saldo", evento: "alerta_falhou", erro: error.message }),
      );
  } catch (e) {
    console.error(
      JSON.stringify({ origem: "meta-saldo", evento: "alerta_falhou", erro: (e as Error).message }),
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const chamador = await exigirChamador(req, {
    segredos: ["cron_meta_secret"],
    papeis: PAPEIS_GESTAO,
  });
  if (chamador instanceof Response) return chamador;

  if (cache && Date.now() - cache.em < CACHE_MS) return json({ ok: true, saldo: cache.saldo });

  try {
    const cliente = new MetaGraphClient({
      config: configDoAmbiente((n) => Deno.env.get(n)),
      maxTentativas: 2,
      timeoutMs: 15_000,
    });
    const saldo = await consultarSaldo(cliente);
    cache = { em: Date.now(), saldo };
    await avisarSeAcabando(saldo);
    return json({ ok: true, saldo });
  } catch (e) {
    const erro = e as Error;
    console.error(JSON.stringify({ origem: "meta-saldo", erro: erro.message }));
    return json(
      {
        ok: false,
        erro: erro.message,
        tokenInvalido: e instanceof MetaTokenInvalidoError,
        codigoErro: e instanceof MetaApiError ? e.code : null,
      },
      502,
    );
  }
});
