// Sync diário do Instagram: conta, insights por dia, demografia e posts dos
// últimos 30 dias. Acionado por pg_cron; `?forcar=1` ignora a guarda diária.
import { handlerMeta } from "../_shared/meta-runtime.ts";
import { rodarSyncInstagram } from "../_shared/meta-jobs.ts";

Deno.serve(
  handlerMeta((deps, _req, url) => rodarSyncInstagram(deps, { forcar: url.searchParams.get("forcar") === "1" })),
);
