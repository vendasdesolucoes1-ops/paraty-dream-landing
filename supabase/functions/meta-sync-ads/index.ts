// Sync diário de Meta Ads: estrutura (campanhas, conjuntos, anúncios) + métricas
// dos últimos 28 dias. Acionado por pg_cron (ver 20261030000300_meta_agendamento.sql);
// `?forcar=1` ignora a guarda de "já rodou hoje". Detalhes em docs/meta-integracao.md.
import { handlerMeta } from "../_shared/meta-runtime.ts";
import { rodarSyncAds } from "../_shared/meta-jobs.ts";

Deno.serve(handlerMeta((deps, _req, url) => rodarSyncAds(deps, { forcar: url.searchParams.get("forcar") === "1" })));
