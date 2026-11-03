// Alcance e frequência de um período, lidos ao vivo na Meta.
//
// Alcance (pessoas únicas) não se soma entre dias nem entre anúncios: a mesma
// pessoa contaria de novo. Por isso não sai das linhas diárias do banco; a
// função meta-alcance pede à Meta o número do período inteiro, por nível
// (campanha, conjunto ou anúncio) e da conta, e a tela cruza pelo id.
import { inteiroDe, numeroOuNulo } from "./meta-actions.ts";
import { exigirAtivo, type MetaGraphClient } from "./meta-graph.ts";

export type NivelAlcance = "campanha" | "conjunto" | "anuncio";

const NIVEL_META: Record<NivelAlcance, { level: string; campo: string }> = {
  campanha: { level: "campaign", campo: "campaign_id" },
  conjunto: { level: "adset", campo: "adset_id" },
  anuncio: { level: "ad", campo: "ad_id" },
};

export type AlcanceItem = { alcance: number | null; frequencia: number | null };

export type AlcancePeriodo = {
  inicio: string;
  fim: string;
  nivel: NivelAlcance;
  conta: AlcanceItem;
  itens: Record<string, AlcanceItem>;
};

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Confere o pedido da tela: datas válidas, início ≤ fim, até 37 meses (limite da Meta). */
export function validarPedido(
  inicio: string | null,
  fim: string | null,
  nivel: string | null,
): { inicio: string; fim: string; nivel: NivelAlcance } | string {
  if (!inicio || !fim || !DIA.test(inicio) || !DIA.test(fim)) return "Datas no formato AAAA-MM-DD.";
  if (inicio > fim) return "O início vem depois do fim.";
  const dias = (Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000;
  if (!Number.isFinite(dias) || dias > 37 * 31) return "Período maior que 37 meses.";
  const n = (nivel ?? "campanha") as NivelAlcance;
  if (!(n in NIVEL_META)) return "Nível deve ser campanha, conjunto ou anuncio.";
  return { inicio, fim, nivel: n };
}

const item = (l: Record<string, unknown>): AlcanceItem => ({
  alcance: inteiroDe(l.reach),
  frequencia: numeroOuNulo(l.frequency),
});

export async function consultarAlcance(
  cliente: MetaGraphClient,
  pedido: { inicio: string; fim: string; nivel: NivelAlcance },
): Promise<AlcancePeriodo> {
  const contaId = exigirAtivo(cliente.config, "adAccountId");
  const { level, campo } = NIVEL_META[pedido.nivel];
  const time_range = JSON.stringify({ since: pedido.inicio, until: pedido.fim });
  const [conta, linhas] = await Promise.all([
    cliente.get<{ data?: Record<string, unknown>[] }>(`${contaId}/insights`, {
      level: "account",
      fields: "reach,frequency",
      time_range,
    }),
    cliente.listarTudo<Record<string, unknown>>(`${contaId}/insights`, {
      level,
      fields: `${campo},reach,frequency`,
      time_range,
      limit: 500,
    }),
  ]);
  const itens: Record<string, AlcanceItem> = {};
  for (const l of linhas) {
    const id = l[campo];
    if (typeof id === "string") itens[id] = item(l);
  }
  return {
    ...pedido,
    conta: conta.data?.[0] ? item(conta.data[0]) : { alcance: 0, frequencia: null },
    itens,
  };
}
