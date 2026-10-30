// Sync horário de stories do Instagram (só ficam no ar por 24 h). Acionado por pg_cron.
import { handlerMeta } from "../_shared/meta-runtime.ts";
import { rodarSyncStories } from "../_shared/meta-jobs.ts";

Deno.serve(handlerMeta((deps) => rodarSyncStories(deps)));
