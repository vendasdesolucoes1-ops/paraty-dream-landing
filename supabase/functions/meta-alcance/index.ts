// Alcance e frequência do período para a aba Anúncios, lidos ao vivo na Meta
// (o alcance não se soma entre dias, então não sai do banco). Parâmetros na
// URL: inicio, fim (AAAA-MM-DD) e nivel (campanha | conjunto | anuncio).
// Cache de 5 min por pedido e instância. Só a gestão, ou o segredo de máquina.
import { exigirChamador, PAPEIS_GESTAO } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  configDoAmbiente,
  MetaApiError,
  MetaGraphClient,
  MetaTokenInvalidoError,
} from "../_shared/meta-graph.ts";
import { type AlcancePeriodo, consultarAlcance, validarPedido } from "../_shared/meta-alcance.ts";

const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { em: number; dados: AlcancePeriodo }>();

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const chamador = await exigirChamador(req, {
    segredos: ["cron_meta_secret"],
    papeis: PAPEIS_GESTAO,
  });
  if (chamador instanceof Response) return chamador;

  const url = new URL(req.url);
  const pedido = validarPedido(
    url.searchParams.get("inicio"),
    url.searchParams.get("fim"),
    url.searchParams.get("nivel"),
  );
  if (typeof pedido === "string") return json({ ok: false, erro: pedido }, 400);

  const chave = `${pedido.inicio}|${pedido.fim}|${pedido.nivel}`;
  const guardado = cache.get(chave);
  if (guardado && Date.now() - guardado.em < CACHE_MS) return json({ ok: true, ...guardado.dados });

  try {
    const cliente = new MetaGraphClient({
      config: configDoAmbiente((n) => Deno.env.get(n)),
      maxTentativas: 2,
      timeoutMs: 20_000,
    });
    const dados = await consultarAlcance(cliente, pedido);
    if (cache.size > 50) cache.clear();
    cache.set(chave, { em: Date.now(), dados });
    return json({ ok: true, ...dados });
  } catch (e) {
    const erro = e as Error;
    console.error(JSON.stringify({ origem: "meta-alcance", erro: erro.message }));
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
