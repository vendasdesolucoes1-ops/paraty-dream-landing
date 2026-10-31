// Casca das Edge Functions meta-*: autenticação, ambiente e resposta HTTP.
//
// Quem pode chamar:
//   - o cron (pg_cron → net.http_post) com o segredo `cron_meta_secret` no
//     header x-internal-secret (conferido pelo banco, ver _shared/auth.ts);
//   - um admin logado ou a service_role, para execuções manuais.
// As credenciais da Meta vêm só de variáveis de ambiente (secrets do Supabase):
// META_ACCESS_TOKEN, META_APP_SECRET, META_APP_ID, META_AD_ACCOUNT_ID, META_PAGE_ID.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { exigirChamador } from "./auth.ts";
import { corsHeaders } from "./cors.ts";
import { armazemSupabase } from "./meta-armazem.ts";
import { configDoAmbiente, MetaGraphClient, verificarConexao } from "./meta-graph.ts";
import type { DepsJob, ResultadoHttp } from "./meta-jobs.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Verificação de boot: roda na primeira chamada de cada instância da função,
// identifica o ID do Instagram pela Página e loga as contas acessíveis.
let bootFeito = false;
async function boot(cliente: MetaGraphClient): Promise<void> {
  if (bootFeito) return;
  if (!cliente.config.pageId) {
    console.warn(JSON.stringify({ origem: "meta-runtime", evento: "boot_sem_page_id" }));
    bootFeito = true;
    return;
  }
  await verificarConexao(cliente);
  bootFeito = true;
}

export function handlerMeta(
  executar: (deps: DepsJob, req: Request, url: URL) => Promise<ResultadoHttp>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const chamador = await exigirChamador(req, { segredos: ["cron_meta_secret"], papeis: ["admin"] });
    if (chamador instanceof Response) return chamador;

    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const deps: DepsJob = {
        armazem: armazemSupabase(supabase),
        criarCliente: () => new MetaGraphClient({ config: configDoAmbiente((n) => Deno.env.get(n)) }),
        boot,
      };
      const r = await executar(deps, req, new URL(req.url));
      return new Response(JSON.stringify(r.corpo), {
        status: r.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      // Chega aqui só se nem o registro da execução abriu (banco fora do ar).
      console.error("[meta] falha fora do job:", (e as Error)?.message);
      return new Response(JSON.stringify({ ok: false, erro: (e as Error)?.message ?? String(e) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  };
}
