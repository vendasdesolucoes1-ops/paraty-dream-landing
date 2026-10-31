// Carga inicial manual (admin ou segredo do cron). Parâmetros de query:
//   escopo=ads|instagram   (padrão ads)
//   reiniciar=1            recomeça do zero, ignorando o cursor salvo
//   meses=N                Ads: janela em meses (padrão/máximo 37)
//   dias=N                 Instagram: dias de insights de conta (padrão 30)
// Ads avança o quanto o tempo permite por chamada: repita até
// `detalhes.concluido` ser true (scripts/meta/carga-inicial.sh faz o laço).
import { handlerMeta } from "../_shared/meta-runtime.ts";
import { rodarCargaInicial } from "../_shared/meta-jobs.ts";

const inteiro = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

Deno.serve(
  handlerMeta((deps, _req, url) =>
    rodarCargaInicial(deps, {
      escopo: url.searchParams.get("escopo") === "instagram" ? "instagram" : "ads",
      reiniciar: url.searchParams.get("reiniciar") === "1",
      meses: inteiro(url.searchParams.get("meses")),
      dias: inteiro(url.searchParams.get("dias")),
    })
  ),
);
