/**
 * Dados reais do loteamento extraídos do Quadro de Áreas (PDF).
 *
 * Loteamento: 81.699,42 m² (100%)
 *  - Quadras (1-10):      50.653,50 m² (62,00%) — 163 lotes
 *  - Áreas verdes (1-5):   8.399,64 m² (10,28%)
 *  - Ruas:                16.110,33 m² (19,72%)
 *  - Área institucional:   6.535,95 m² ( 8,00%)
 *  - Residencial: 41.917,23 m² (142 lotes) | Comercial: 8.736,27 m² (21 lotes)
 *
 * A planta abaixo é esquemática (o PDF traz áreas, não geometria): cada lote
 * usa sua área real com profundidade padrão por fileira, e as quadras são
 * posicionadas num arruamento inspirado nas fotos aéreas do empreendimento.
 * Escala: 1 unidade = 1 metro.
 */

export type LotTipo = "residencial" | "comercial";

export interface LayoutLot {
  number: number;
  quadra: number;
  tipo: LotTipo;
  area: number;
  /** centro do lote (m) */
  x: number;
  z: number;
  /** frente (m) */
  width: number;
  /** profundidade (m) */
  depth: number;
}

interface RowDef {
  /** profundidade padrão dos lotes da fileira (m) */
  depth: number;
  /** áreas reais (m²), em ordem de numeração */
  areas: number[];
}

interface QuadraDef {
  quadra: number;
  /** canto noroeste da quadra */
  x: number;
  z: number;
  /** fileiras de norte para sul; lotes correm de oeste para leste */
  rows: RowDef[];
  /** números de lote comerciais (default: residencial) */
  comercial?: number[];
  /** primeiro número de lote da quadra */
  firstLot: number;
}

const R250 = 250.0;
const R150 = 150.0;
const R360 = 360.0;

/**
 * Numeração é sequencial dentro da quadra, percorrendo as fileiras na ordem.
 * Somas conferidas contra os subtotais do PDF (Q1 3.678,70 … Q10 2.622,15).
 */
const QUADRA_DEFS: QuadraDef[] = [
  // ——— Frente do loteamento (junto à rodovia) — quadras comerciais ———
  {
    quadra: 1,
    firstLot: 1,
    x: 10,
    z: 302,
    rows: [
      {
        depth: 30,
        areas: [533.71, 492.51, 417.32, R360, R360, R360, 360.16, 397.5, 397.5],
      },
    ],
    comercial: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  },
  {
    quadra: 2,
    firstLot: 10,
    x: 155,
    z: 302,
    rows: [
      {
        depth: 30,
        areas: [360.02, 360.07, 360.03, 360.36, 360.73, 360.85, 360.21, 360.08, R360, 360.14],
      },
    ],
    comercial: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  },
  // ——— Faixa 3 ———
  {
    quadra: 3,
    firstLot: 20,
    x: 3,
    z: 235,
    rows: [
      {
        depth: 25,
        areas: [284.07, 284.07, ...Array(10).fill(R250), 255.86],
      },
      {
        depth: 25,
        areas: [360.13, 452.15, ...Array(10).fill(R250)],
      },
    ],
  },
  {
    quadra: 7,
    firstLot: 98,
    x: 155,
    z: 235,
    rows: [
      {
        depth: 25,
        areas: [250.07, 250.07, ...Array(11).fill(R250), 364.77],
      },
      {
        depth: 25,
        areas: [364.25, 256.8, ...Array(11).fill(R250)],
      },
    ],
  },
  // ——— Faixa 2 ———
  {
    quadra: 4,
    firstLot: 45,
    x: 3,
    z: 164,
    rows: [
      { depth: 20, areas: [169.07, 169.07, ...Array(11).fill(R150)] },
      { depth: 20, areas: [169.07, 169.07, ...Array(11).fill(R150)] },
    ],
  },
  {
    quadra: 5,
    firstLot: 71,
    x: 155,
    z: 160,
    rows: [
      {
        depth: 30,
        areas: [169.22, 363.77, 363.8, 363.8, 363.8, 363.8, 363.97, 364.33],
      },
      {
        depth: 20,
        areas: [450.02, 450.0, 153.15, 153.15, 153.15, 153.15, 153.15, 153.15],
      },
    ],
  },
  // ——— Faixa 1 ———
  {
    quadra: 6,
    firstLot: 87,
    x: 3,
    z: 74,
    rows: [
      { depth: 34, areas: [811.11, 643.97, 623.51, 625.2, 629.47] },
      { depth: 34, areas: [618.2, 638.7, 643.3, 635.64, 629.99, 643.91] },
    ],
    comercial: [87, 88],
  },
  {
    quadra: 8,
    firstLot: 125,
    x: 155,
    z: 77,
    rows: [
      {
        depth: 30,
        areas: [360.17, 360.17, ...Array(7).fill(R360), 291.15],
      },
      {
        depth: 30,
        areas: [291.25, 360.22, 360.03, ...Array(7).fill(R360)],
      },
    ],
  },
  // ——— Faixa 0 (fundos) ———
  {
    quadra: 9,
    firstLot: 145,
    x: 3,
    z: 0,
    rows: [
      { depth: 30, areas: [450.24, ...Array(5).fill(R360)] },
      { depth: 30, areas: Array(6).fill(R360) },
    ],
  },
  {
    quadra: 10,
    firstLot: 157,
    x: 155,
    z: 30,
    rows: [{ depth: 30, areas: [...Array(6).fill(R360), 462.15] }],
  },
];

function buildLots(): LayoutLot[] {
  const lots: LayoutLot[] = [];
  for (const q of QUADRA_DEFS) {
    let n = q.firstLot;
    let rowTop = q.z;
    for (const row of q.rows) {
      let cursor = q.x;
      for (const area of row.areas) {
        const width = area / row.depth;
        lots.push({
          number: n,
          quadra: q.quadra,
          tipo: q.comercial?.includes(n) ? "comercial" : "residencial",
          area,
          x: cursor + width / 2,
          z: rowTop + row.depth / 2,
          width,
          depth: row.depth,
        });
        cursor += width;
        n += 1;
      }
      rowTop += row.depth;
    }
  }
  return lots;
}

export const LAYOUT_LOTS: LayoutLot[] = buildLots();

export const LOTS_BY_NUMBER = new Map(LAYOUT_LOTS.map((l) => [l.number, l]));

export interface Rect {
  x: number;
  z: number;
  width: number;
  depth: number;
  label?: string;
}

/** Ruas — 16.110,33 m² (19,72%) */
export const STREETS: Rect[] = [
  // Avenida principal (entrada, sentido norte-sul)
  { x: 138, z: 0, width: 12, depth: 340 },
  // Ruas transversais (leste-oeste)
  { x: 0, z: 60, width: 300, depth: 12 },
  { x: 0, z: 142, width: 300, depth: 12 },
  { x: 0, z: 218, width: 300, depth: 12 },
  { x: 0, z: 290, width: 300, depth: 12 },
];

/** Áreas verdes — 8.399,64 m² (10,28%) */
export const GREEN_AREAS: Rect[] = [
  { x: 80, z: 0, width: 58, depth: 60, label: "Área Verde 04" },
  { x: 105, z: 154, width: 33, depth: 64, label: "Área Verde 03" },
  { x: 274, z: 154, width: 26, depth: 64, label: "Área Verde 05" },
  { x: 276, z: 77, width: 24, depth: 60, label: "Área Verde 01" },
  { x: 278, z: 302, width: 22, depth: 30, label: "Área Verde 02" },
  { x: 155, z: 0, width: 87, depth: 27, label: "" },
];

/** Área institucional — 6.535,95 m² (8,00%) */
export const INSTITUTIONAL: Rect = {
  x: 245,
  z: 0,
  width: 55,
  depth: 57,
  label: "Área Institucional",
};

export const QUADRA_LABELS: { quadra: number; x: number; z: number }[] = QUADRA_DEFS.map((q) => {
  const depth = q.rows.reduce((s, r) => s + r.depth, 0);
  const width = Math.max(...q.rows.map((r) => r.areas.reduce((s, a) => s + a / r.depth, 0)));
  return { quadra: q.quadra, x: q.x + width / 2, z: q.z + depth / 2 };
});

/** Limites do terreno (para chão, câmera e cerca viva) */
export const SITE = { minX: 0, maxX: 300, minZ: 0, maxZ: 332 };

export const AREA_SUMMARY = {
  totalM2: 81699.42,
  quadrasM2: 50653.5,
  areasVerdesM2: 8399.64,
  ruasM2: 16110.33,
  institucionalM2: 6535.95,
  residencialM2: 41917.23,
  comercialM2: 8736.27,
  totalLotes: 163,
  lotesResidenciais: 142,
  lotesComerciais: 21,
};
