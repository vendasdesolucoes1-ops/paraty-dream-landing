import { useMemo } from "react";
import type { HousePlot } from "@/lib/loteamento-3d/houses";
import { G, mat, rng } from "@/lib/loteamento-3d/three-assets";
import { roofTexture } from "@/lib/loteamento-3d/procedural-textures";
import { Car, ContactShadow, HOUSE_EXTRA_M, P } from "@/components/loteamento-3d/Props3D";

const WALL_COLORS = ["#f3ece1", "#e9e2d4", "#f6f1ea", "#ded6c8", "#eae4dd", "#f0e6d8"];
const ACCENT_COLORS = ["#b0765a", "#7d8b74", "#8c7f6b", "#4c5b63", "#a8542f"];
const ROOF_COLORS = ["#8d4a33", "#a3512f", "#6b4030", "#4e5459", "#7a4a3a"];

const M = {
  wall: WALL_COLORS.map((c) => mat(c, { roughness: 0.92 })),
  accent: ACCENT_COLORS.map((c) => mat(c, { roughness: 0.85 })),
  roof: ROOF_COLORS.map((c) => mat(c, { roughness: 0.88 })),
  glass: mat("#2b4a5e", { roughness: 0.08, metalness: 0.8, emissive: "#0d1b24" }),
  frame: mat("#ffffff", { roughness: 0.55 }),
  door: mat("#5a3a24", { roughness: 0.5 }),
  garage: mat("#cfd3d6", { roughness: 0.45, metalness: 0.25 }),
  slab: mat("#c9c5bc", { roughness: 1 }),
  drive: mat("#b0ada5", { roughness: 1 }),
  hedge: mat("#3f6f34", { roughness: 1 }),
  water: mat("#3fa9d6", { roughness: 0.05, metalness: 0.35 }),
  trunk: mat("#6b4a2f", { roughness: 1 }),
  canopy: mat("#3d7032", { roughness: 0.95 }),
  canopy2: mat("#4c8a3a", { roughness: 0.95 }),
  fence: mat("#e6e1d8", { roughness: 0.9 }),
  deck: mat("#a5794c", { roughness: 0.9 }),
};

// `document` só existe no cliente — os materiais acima são módulo-level e
// evolutivamente compartilhados por todas as casas, então a textura entra
// uma única vez aqui em vez de em cada instância. O componente inteiro só
// chega a renderizar dentro do <ClientOnly> em Loteamento3DView, mas o
// guard evita qualquer risco de o módulo ser avaliado durante o SSR.
if (typeof document !== "undefined") {
  const roofMap = roofTexture(2.2);
  for (const roofMat of M.roof) {
    roofMat.map = roofMap;
    roofMat.needsUpdate = true;
  }
}

/** casa simplificada usada à distância (2 meshes) */
export function HouseLOD({ plot }: { plot: HousePlot }) {
  const { bw, bd, bz, h, roofM, wallM, flat } = useMemo(() => {
    const rand = rng(plot.seed);
    const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
    const marginX = Math.min(2.2, plot.width * 0.12);
    const marginZ = Math.min(3, plot.depth * 0.12);
    const bw = Math.max(5, plot.width - marginX * 2);
    const bd = Math.max(6, Math.min(plot.depth * 0.55, plot.depth - marginZ * 2 - 4));
    const twoFloors = plot.style === "sobrado" || (plot.style === "moderna" && rand() < 0.5);
    const h = twoFloors ? 6.2 : 3.1;
    return {
      bw,
      bd,
      bz: plot.depth / 2 - marginZ - bd / 2 - 3.5,
      h,
      wallM: pick(M.wall),
      roofM: pick(M.roof),
      flat: plot.style === "moderna",
    };
  }, [plot]);

  return (
    <group position={[plot.x, 0, plot.z]} rotation={[0, plot.rotationY, 0]}>
      <P p={[0, 0.44 + h / 2, bz]} s={[bw, h, bd]} m={wallM} g={G.box} />
      {flat ? (
        <P p={[0, 0.44 + h + 0.2, bz]} s={[bw + 0.6, 0.4, bd + 0.6]} m={roofM} g={G.box} />
      ) : (
        <P
          p={[0, 0.44 + h + (bd * 0.34) / 2, bz]}
          s={[bw + 1.1, bd * 0.34, bd + 1.1]}
          m={roofM}
          g={G.prism}
        />
      )}
    </group>
  );
}

/**
 * Casa procedural detalhada. Origem no centro do terreno, frente para +Z.
 */
export function House({ plot }: { plot: HousePlot }) {
  const parts = useMemo(() => {
    const rand = rng(plot.seed);
    const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

    const lotW = plot.width;
    const lotD = plot.depth;
    const marginX = Math.min(2.2, lotW * 0.12);
    const marginZ = Math.min(3, lotD * 0.12);

    const bw = Math.max(5, lotW - marginX * 2);
    const bd = Math.max(6, Math.min(lotD * 0.55, lotD - marginZ * 2 - 4));
    const twoFloors = plot.style === "sobrado" || (plot.style === "moderna" && rand() < 0.5);
    const floorH = 3.1;
    const h = twoFloors ? floorH * 2 : floorH;
    const bz = lotD / 2 - marginZ - bd / 2 - 3.5;

    const winCount = Math.max(2, Math.min(4, Math.round(bw / 4)));

    return {
      lotW,
      lotD,
      bw,
      bd,
      bz,
      h,
      twoFloors,
      floorH,
      wallM: pick(M.wall),
      accentM: pick(M.accent),
      roofM: pick(M.roof),
      flatRoof: plot.style === "moderna",
      winCount,
      winStep: bw / (winCount + 1),
      frontZ: bz + bd / 2 + 0.06,
      backZ: bz - bd / 2 - 0.06,
      garageW: Math.min(5.6, bw * 0.38),
      porch: rand() < 0.6,
      chimney: plot.style !== "moderna" && rand() < 0.5,
      carColor: Math.floor(rand() * 7),
      carSuv: rand() < 0.4,
      hasSecondCar: plot.lots.length > 1 && rand() < 0.6,
      carColor2: Math.floor(rand() * 7),
      trees: Array.from({ length: 1 + Math.floor(rand() * 3) }, () => ({
        x: (rand() - 0.5) * (lotW - 3),
        z: lotD / 2 - 1.6 - rand() * 4,
        s: 0.7 + rand() * 0.7,
        alt: rand() < 0.5,
      })),
      bushes: Array.from({ length: 3 + Math.floor(rand() * 3) }, () => ({
        x: (rand() - 0.5) * (lotW - 4),
        z: lotD / 2 - 5 - rand() * 3,
        s: 0.6 + rand() * 0.6,
      })),
    };
  }, [plot]);

  const {
    bw,
    bd,
    bz,
    h,
    twoFloors,
    floorH,
    wallM,
    accentM,
    roofM,
    flatRoof,
    winCount,
    winStep,
    frontZ,
    backZ,
    garageW,
    porch,
    chimney,
    trees,
    bushes,
    lotW,
    lotD,
    carColor,
    carColor2,
    carSuv,
    hasSecondCar,
  } = parts;

  const halfW = bw / 2;
  const doorX = -halfW + garageW + 1.6;
  const driveX = -bw / 2 + garageW / 2;
  const driveDepth = lotD / 2 - (bz + bd / 2);

  return (
    <group position={[plot.x, 0, plot.z]} rotation={[0, plot.rotationY, 0]}>
      {/* entrada de carro + calçada */}
      <P
        p={[driveX, 0.17, lotD / 2 - driveDepth / 2]}
        s={[garageW, 0.06, driveDepth]}
        m={M.drive}
        g={G.box}
      />
      <P p={[doorX, 0.17, bz + bd / 2 + 1.8]} s={[1.6, 0.06, 3.6]} m={M.slab} g={G.box} />

      {/* sombra de contato da construção */}
      <ContactShadow p={[0, 0.09, bz + 0.6]} s={[bw + 2.4, bd + 2.6]} />

      {/* base / laje */}
      <P p={[0, 0.22, bz]} s={[bw + 0.6, 0.44, bd + 0.6]} m={M.slab} />

      {/* corpo principal */}
      <P p={[0, 0.44 + h / 2, bz]} s={[bw, h, bd]} m={wallM} />

      {/* faixa de acabamento entre pavimentos */}
      {twoFloors && <P p={[0, 0.44 + floorH, bz]} s={[bw + 0.3, 0.3, bd + 0.3]} m={accentM} />}

      {/* garagem / ala lateral */}
      <P
        p={[driveX, 0.44 + floorH * 0.85, bz + bd / 2 - 0.6]}
        s={[garageW, floorH * 1.7, 4.2]}
        m={accentM}
      />
      <P
        p={[driveX, 0.44 + 1.35, bz + bd / 2 + 1.55]}
        s={[garageW - 0.9, 2.7, 0.16]}
        m={M.garage}
      />
      {/* frisos na porta da garagem */}
      {[-0.9, 0, 0.9].map((dy) => (
        <P
          key={dy}
          p={[driveX, 0.44 + 1.35 + dy, bz + bd / 2 + 1.64]}
          s={[garageW - 1.05, 0.08, 0.04]}
          m={accentM}
          g={G.box}
        />
      ))}

      {/* carro na garagem */}
      <Car
        position={[driveX, 0.2, bz + bd / 2 + 3.6]}
        rotation={0}
        colorIndex={carColor}
        suv={carSuv}
      />
      {hasSecondCar && (
        <Car
          position={[driveX, 0.2, lotD / 2 - 3.2]}
          rotation={Math.PI}
          colorIndex={carColor2}
          suv={!carSuv}
        />
      )}

      {/* telhado */}
      {flatRoof ? (
        <>
          <P p={[0, 0.44 + h + 0.16, bz]} s={[bw + 0.9, 0.32, bd + 0.9]} m={accentM} />
          <P p={[0, 0.44 + h + 0.6, bz]} s={[bw + 0.5, 0.5, bd + 0.5]} m={M.frame} />
          <P p={[0, 0.44 + h + 0.52, bz]} s={[bw - 0.4, 0.4, bd - 0.4]} m={roofM} g={G.box} />
        </>
      ) : (
        <>
          <P
            p={[0, 0.44 + h + (bd * 0.36) / 2, bz]}
            s={[bw + 1.4, bd * 0.36, bd + 1.4]}
            m={roofM}
            g={G.prism}
          />
          {/* cumeeira */}
          <P p={[0, 0.44 + h + bd * 0.36, bz]} s={[bw + 1.5, 0.18, 0.5]} m={accentM} g={G.softS} />
          {/* beirais */}
          {[-1, 1].map((sg) => (
            <P
              key={sg}
              p={[0, 0.44 + h + 0.06, bz + sg * (bd / 2 + 0.6)]}
              s={[bw + 1.5, 0.16, 0.36]}
              m={M.frame}
              g={G.softS}
            />
          ))}
        </>
      )}

      {chimney && (
        <>
          <P p={[halfW - 1.4, 0.44 + h + bd * 0.3, bz - 1]} s={[0.9, 2.6, 0.9]} m={accentM} />
          <P p={[halfW - 1.4, 0.44 + h + bd * 0.3 + 1.5, bz - 1]} s={[1.2, 0.22, 1.2]} m={M.slab} />
        </>
      )}

      {/* porta de entrada + degraus */}
      <P p={[doorX, 0.44 + 1.15, frontZ]} s={[1.25, 2.3, 0.14]} m={M.door} />
      <P p={[doorX, 0.44 + 2.35, frontZ]} s={[1.6, 0.14, 0.24]} m={M.frame} g={G.softS} />
      <mesh
        geometry={G.sphere}
        material={M.garage}
        position={[doorX + 0.45, 0.44 + 1.15, frontZ + 0.12]}
        scale={0.12}
      />
      <P p={[doorX, 0.16, frontZ + 0.55]} s={[2.1, 0.32, 1.1]} m={M.slab} />

      {/* varanda com colunas */}
      {porch && (
        <>
          <P p={[doorX + 0.6, 0.44 + 3.05, frontZ + 1.2]} s={[4.6, 0.22, 2.6]} m={M.frame} />
          {[-1.6, 1.6].map((dx) => (
            <mesh
              key={dx}
              geometry={G.cyl}
              material={M.frame}
              position={[doorX + 0.6 + dx, 0.44 + 1.5, frontZ + 2.2]}
              scale={[0.24, 3, 0.24]}
            />
          ))}
        </>
      )}

      {/* sacada do sobrado */}
      {twoFloors && !flatRoof && (
        <>
          <P p={[halfW - 2.2, 0.44 + floorH + 0.2, frontZ + 0.7]} s={[3.4, 0.2, 1.5]} m={M.frame} />
          <P
            p={[halfW - 2.2, 0.44 + floorH + 0.75, frontZ + 1.4]}
            s={[3.4, 0.9, 0.1]}
            m={M.glass}
          />
        </>
      )}

      {/* janelas — frente (térreo) */}
      {Array.from({ length: winCount }).map((_, i) => {
        const x = -halfW + winStep * (i + 1);
        if (Math.abs(x - doorX) < 1.6 || x < -halfW + garageW + 0.4) return null;
        return (
          <group key={`fw${i}`}>
            <P p={[x, 0.44 + 1.75, frontZ]} s={[1.9, 1.55, 0.1]} m={M.frame} g={G.softS} />
            <P p={[x, 0.44 + 1.75, frontZ + 0.05]} s={[1.6, 1.25, 0.08]} m={M.glass} g={G.box} />
            <P p={[x, 0.44 + 1.75, frontZ + 0.07]} s={[0.07, 1.25, 0.05]} m={M.frame} g={G.box} />
            <P p={[x, 0.44 + 0.96, frontZ + 0.12]} s={[2.1, 0.14, 0.36]} m={M.slab} g={G.softS} />
            {/* jardineira na janela */}
            <P
              p={[x, 0.44 + 1.12, frontZ + 0.28]}
              s={[1.5, 0.28, 0.3]}
              m={HOUSE_EXTRA_M.planter}
              g={G.softS}
            />
            <mesh
              geometry={G.blob}
              material={HOUSE_EXTRA_M.flower}
              position={[x, 0.44 + 1.34, frontZ + 0.28]}
              scale={[1.3, 0.35, 0.28]}
            />
          </group>
        );
      })}

      {/* janelas — 2º pavimento */}
      {twoFloors &&
        Array.from({ length: winCount }).map((_, i) => {
          const x = -halfW + winStep * (i + 1);
          return (
            <group key={`fw2${i}`}>
              <P
                p={[x, 0.44 + floorH + 1.6, frontZ]}
                s={[1.65, 1.45, 0.1]}
                m={M.frame}
                g={G.softS}
              />
              <P
                p={[x, 0.44 + floorH + 1.6, frontZ + 0.05]}
                s={[1.35, 1.15, 0.08]}
                m={M.glass}
                g={G.box}
              />
            </group>
          );
        })}

      {/* fundos */}
      <P p={[0, 0.44 + 1.55, backZ]} s={[3.3, 2.5, 0.1]} m={M.frame} g={G.softS} />
      <P p={[0, 0.44 + 1.55, backZ - 0.05]} s={[2.9, 2.15, 0.08]} m={M.glass} g={G.box} />
      {twoFloors && (
        <>
          <P
            p={[-bw * 0.25, 0.44 + floorH + 1.6, backZ]}
            s={[1.5, 1.3, 0.1]}
            m={M.glass}
            g={G.box}
          />
          <P
            p={[bw * 0.25, 0.44 + floorH + 1.6, backZ]}
            s={[1.5, 1.3, 0.1]}
            m={M.glass}
            g={G.box}
          />
        </>
      )}
      <P p={[0, 0.2, bz - bd / 2 - 1.8]} s={[Math.min(bw, 7), 0.2, 3]} m={M.deck} g={G.box} />

      {/* janelas laterais */}
      {[-1, 1].map((sgn) => (
        <group key={sgn}>
          <P
            p={[sgn * (halfW + 0.05), 0.44 + 1.75, bz]}
            s={[0.1, 1.4, 1.5]}
            m={M.glass}
            g={G.box}
          />
          {twoFloors && (
            <P
              p={[sgn * (halfW + 0.05), 0.44 + floorH + 1.6, bz - 1.5]}
              s={[0.1, 1.2, 1.3]}
              m={M.glass}
              g={G.box}
            />
          )}
        </group>
      ))}

      {/* muro frontal + portão */}
      <P p={[0, 0.55, lotD / 2 - 0.6]} s={[lotW - 0.8, 1.1, 0.3]} m={M.fence} />
      <P
        p={[-lotW / 2 + garageW / 2 + 0.4, 0.7, lotD / 2 - 0.6]}
        s={[garageW, 1.4, 0.16]}
        m={M.garage}
      />
      {/* pilaretes do muro */}
      {[-1, 1].map((sg) => (
        <P
          key={`pl${sg}`}
          p={[sg * (lotW / 2 - 0.5), 0.75, lotD / 2 - 0.6]}
          s={[0.55, 1.5, 0.55]}
          m={accentM}
        />
      ))}

      {/* caixa de correio */}
      <group position={[lotW / 2 - 2, 0, lotD / 2 - 1.4]}>
        <mesh
          geometry={G.cyl8}
          material={HOUSE_EXTRA_M.lampPost}
          position={[0, 0.55, 0]}
          scale={[0.12, 1.1, 0.12]}
        />
        <mesh
          geometry={G.softS}
          material={HOUSE_EXTRA_M.mailbox}
          position={[0, 1.2, 0]}
          scale={[0.4, 0.3, 0.55]}
        />
      </group>

      {/* luminárias de jardim */}
      {[-1, 1].map((sg) => (
        <group key={`gl${sg}`} position={[doorX + sg * 1.4, 0, frontZ + 2.6]}>
          <mesh
            geometry={G.cyl8}
            material={HOUSE_EXTRA_M.lampPost}
            position={[0, 0.5, 0]}
            scale={[0.09, 1, 0.09]}
          />
          <mesh geometry={G.sphere} material={M.frame} position={[0, 1.08, 0]} scale={0.26} />
        </group>
      ))}

      {/* cerca viva lateral */}
      {[-1, 1].map((sgn) => (
        <P
          key={`h${sgn}`}
          p={[sgn * (lotW / 2 - 0.5), 0.5, 0]}
          s={[0.6, 1, lotD - 1.6]}
          m={M.hedge}
        />
      ))}

      {/* piscina */}
      {plot.hasPool && (
        <group position={[bw / 2 - 2.5, 0, bz - bd / 2 - 4.5]}>
          <P p={[0, 0.18, 0]} s={[5.6, 0.2, 3.6]} m={M.slab} />
          <P p={[0, 0.24, 0]} s={[4.6, 0.16, 2.6]} m={M.water} g={G.box} />
          <mesh
            geometry={G.cyl8}
            material={M.frame}
            position={[-2.9, 0.6, 1.4]}
            scale={[0.12, 1.2, 0.12]}
          />
          <mesh
            geometry={G.cone}
            material={HOUSE_EXTRA_M.flower}
            position={[-2.9, 1.35, 1.4]}
            scale={[1.8, 0.5, 1.8]}
          />
        </group>
      )}

      {/* arbustos */}
      {bushes.map((b, i) => (
        <mesh
          key={`b${i}`}
          geometry={G.blob}
          material={HOUSE_EXTRA_M.bush}
          position={[b.x, 0.35 * b.s, b.z]}
          scale={[b.s, b.s * 0.8, b.s]}
        />
      ))}

      {/* árvores */}
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} scale={t.s}>
          <mesh
            geometry={G.cyl8}
            material={M.trunk}
            position={[0, 0.95, 0]}
            scale={[0.32, 1.9, 0.32]}
          />
          <mesh
            geometry={G.blob}
            material={t.alt ? M.canopy2 : M.canopy}
            position={[0, 2.5, 0]}
            scale={[2.5, 2.2, 2.5]}
          />
          <mesh
            geometry={G.blob}
            material={t.alt ? M.canopy : M.canopy2}
            position={[0.5, 3.2, -0.3]}
            scale={[1.5, 1.4, 1.5]}
          />
          <ContactShadow p={[0, 0.08, 0]} s={[2.8, 2.8]} />
        </group>
      ))}
    </group>
  );
}
