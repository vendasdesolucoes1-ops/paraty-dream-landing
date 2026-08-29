/**
 * Agrupa os lotes da planta em "casas": a maioria ocupa 1 lote, algumas
 * ocupam 2 ou 3 lotes vizinhos da mesma fileira. Determinístico (mesma
 * planta em todo reload).
 */
import { LAYOUT_LOTS, STREETS, type LayoutLot } from "./loteamento";

export type HouseStyle = "terrea" | "sobrado" | "moderna";

export interface HousePlot {
  /** números dos lotes ocupados */
  lots: number[];
  quadra: number;
  /** centro do terreno da casa */
  x: number;
  z: number;
  width: number;
  depth: number;
  /** rotação em Y: 0 = frente para +Z */
  rotationY: number;
  style: HouseStyle;
  /** semente para variações (cores, janelas, árvores) */
  seed: number;
  hasPool: boolean;
}

function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** rua horizontal mais próxima define para onde a casa "olha" */
function facingRotation(z: number): number {
  const horizontals = STREETS.filter((s) => s.width >= s.depth);
  let best = horizontals[0];
  let bestD = Infinity;
  for (const s of horizontals) {
    const cz = s.z + s.depth / 2;
    const d = Math.abs(cz - z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  const cz = best.z + best.depth / 2;
  return cz < z ? Math.PI : 0;
}

export function buildHousePlots(): HousePlot[] {
  // agrupa por quadra + fileira (mesmo z de centro)
  const rows = new Map<string, LayoutLot[]>();
  for (const l of LAYOUT_LOTS) {
    const key = `${l.quadra}|${l.z.toFixed(2)}`;
    const arr = rows.get(key) ?? [];
    arr.push(l);
    rows.set(key, arr);
  }

  const plots: HousePlot[] = [];
  const styles: HouseStyle[] = ["terrea", "sobrado", "moderna"];

  for (const [key, lotsRaw] of rows) {
    const lots = [...lotsRaw].sort((a, b) => a.x - b.x);
    const rand = rng(
      key.split("").reduce((s, c) => (s * 31 + c.charCodeAt(0)) | 0, 7) + lots[0].number * 977,
    );

    let i = 0;
    while (i < lots.length) {
      const r = rand();
      // 70% 1 lote, 22% 2 lotes, 8% 3 lotes
      let span = r < 0.7 ? 1 : r < 0.92 ? 2 : 3;
      span = Math.min(span, lots.length - i);
      const group = lots.slice(i, i + span);

      const minX = Math.min(...group.map((l) => l.x - l.width / 2));
      const maxX = Math.max(...group.map((l) => l.x + l.width / 2));
      const depth = Math.max(...group.map((l) => l.depth));
      const z = group[0].z;
      const seed = group[0].number * 131 + group.length;

      plots.push({
        lots: group.map((l) => l.number),
        quadra: group[0].quadra,
        x: (minX + maxX) / 2,
        z,
        width: maxX - minX,
        depth,
        rotationY: facingRotation(z),
        style: styles[Math.floor(rand() * styles.length)],
        seed,
        hasPool: span >= 2 && rand() < 0.55,
      });

      i += span;
    }
  }

  return plots;
}

export const HOUSE_PLOTS = buildHousePlots();

/** mapa número do lote -> casa que o ocupa */
export const HOUSE_BY_LOT = new Map<number, HousePlot>(
  HOUSE_PLOTS.flatMap((h) => h.lots.map((n) => [n, h] as [number, HousePlot])),
);
