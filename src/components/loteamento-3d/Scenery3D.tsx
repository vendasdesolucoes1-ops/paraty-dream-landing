import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { G, mat, rng } from "@/lib/loteamento-3d/three-assets";
import { P } from "@/components/loteamento-3d/Props3D";
import { SITE } from "@/lib/loteamento-3d/loteamento";

/* ============ materiais do entorno (paleta das fotos reais) ============ */
const S = {
  ridgeFar: mat("#7d99b4", { roughness: 1 }),
  ridgeMid: mat("#5f8478", { roughness: 1 }),
  ridgeNear: mat("#3f6b4a", { roughness: 1 }),
  forest: mat("#2f5d31", { roughness: 1 }),
  forest2: mat("#3a7038", { roughness: 1 }),
  forestDark: mat("#24471f", { roughness: 1 }),
  trunk: mat("#5d4630", { roughness: 1 }),
  palmTrunk: mat("#9b8f74", { roughness: 1 }),
  palmLeaf: mat("#3c7a35", { roughness: 0.95 }),
  clay: mat("#b3673c", { roughness: 1 }),
  pasture: mat("#7ba653", { roughness: 1 }),
  concrete: mat("#cfd0cb", { roughness: 1 }),
  woodPole: mat("#a89a86", { roughness: 1 }),
  wire: new THREE.LineBasicMaterial({ color: "#2c2f33", transparent: true, opacity: 0.55 }),
  kioskWall: mat("#f2f4f5", { roughness: 0.75 }),
  kioskBlue: mat("#1e5f9e", { roughness: 0.6 }),
  kioskRoof: mat("#b9bfc4", { roughness: 0.7 }),
  boardFrame: mat("#e0a521", { roughness: 0.7 }),
  boardFace: mat("#2b6ea8", { roughness: 0.6 }),
  boardStrip: mat("#f2c531", { roughness: 0.6 }),
  playRed: mat("#d33f2a", { roughness: 0.6 }),
  playBlue: mat("#2f7fc4", { roughness: 0.6 }),
  playYellow: mat("#e8b423", { roughness: 0.6 }),
  playMetal: mat("#8d949a", { roughness: 0.45, metalness: 0.5 }),
  playWood: mat("#8b6135", { roughness: 0.9 }),
};

/* ============ serra ao fundo (Serra do Mar) ============ */
function Mountains() {
  const peaks = useMemo(() => {
    const rand = rng(1337);
    const out: { p: [number, number, number]; s: [number, number, number]; m: THREE.Material }[] =
      [];
    const cx = (SITE.minX + SITE.maxX) / 2;
    const cz = (SITE.minZ + SITE.maxZ) / 2;
    const rings = [
      { r: 2300, h: [300, 520], m: S.ridgeFar, n: 30 },
      { r: 1750, h: [200, 380], m: S.ridgeMid, n: 26 },
      { r: 1350, h: [130, 240], m: S.ridgeNear, n: 22 },
    ];
    for (const ring of rings) {
      for (let i = 0; i < ring.n; i++) {
        const a = (i / ring.n) * Math.PI * 2 + rand() * 0.22;
        const rr = ring.r * (0.85 + rand() * 0.3);
        const h = ring.h[0] + rand() * (ring.h[1] - ring.h[0]);
        const w = h * (2.2 + rand() * 1.6);
        out.push({
          p: [cx + Math.cos(a) * rr, h / 2 - 20, cz + Math.sin(a) * rr],
          s: [w, h, w],
          m: ring.m,
        });
      }
    }
    return out;
  }, []);

  return (
    <group>
      {peaks.map((k, i) => (
        <mesh key={i} geometry={G.cone} material={k.m} position={k.p} scale={k.s} />
      ))}
    </group>
  );
}

/* ============ mata nativa no entorno ============ */
interface ForestTree {
  x: number;
  z: number;
  s: number;
  m: THREE.Material;
  tall: boolean;
}

/**
 * A mata tinha 620 × 2 = 1240 meshes individuais (um par tronco+copa por
 * árvore) — pesado sem necessidade, já que são todas geometria/material
 * repetidos. InstancedMesh desenha o mesmo par de malhas em 1 draw call por
 * combinação (tronco baixo/alto × copa baixa/alta/3 cores), caindo pra 8
 * draw calls no total em vez de 1240.
 */
function TreeTrunks({ trees, tall }: { trees: ForestTree[]; tall: boolean }) {
  const list = useMemo(() => trees.filter((t) => t.tall === tall), [trees, tall]);
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(0, tall ? 5 : 2.2, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(0.5, tall ? 10 : 4.4, 0.5),
    );
    const group = new THREE.Matrix4();
    const world = new THREE.Matrix4();
    list.forEach((t, i) => {
      group.compose(
        new THREE.Vector3(t.x, 0, t.z),
        new THREE.Quaternion(),
        new THREE.Vector3(t.s, t.s, t.s),
      );
      world.multiplyMatrices(group, local);
      mesh.setMatrixAt(i, world);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [list, tall]);

  if (list.length === 0) return null;
  return <instancedMesh ref={ref} args={[G.cyl8, S.trunk, list.length]} castShadow />;
}

function TreeCanopies({
  trees,
  tall,
  material,
}: {
  trees: ForestTree[];
  tall: boolean;
  material: THREE.Material;
}) {
  const list = useMemo(
    () => trees.filter((t) => t.tall === tall && t.m === material),
    [trees, tall, material],
  );
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(0, tall ? 11.5 : 5.6, 0),
      new THREE.Quaternion(),
      tall ? new THREE.Vector3(5, 4, 5) : new THREE.Vector3(6.4, 5.2, 6.4),
    );
    const group = new THREE.Matrix4();
    const world = new THREE.Matrix4();
    list.forEach((t, i) => {
      group.compose(
        new THREE.Vector3(t.x, 0, t.z),
        new THREE.Quaternion(),
        new THREE.Vector3(t.s, t.s, t.s),
      );
      world.multiplyMatrices(group, local);
      mesh.setMatrixAt(i, world);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [list, tall, material]);

  if (list.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[G.blob, material, list.length]} castShadow receiveShadow />
  );
}

function Forest() {
  const trees = useMemo(() => {
    const rand = rng(4242);
    const out: ForestTree[] = [];
    const pad = 40;
    for (let i = 0; i < 620; i++) {
      // anel ao redor do loteamento
      const side = Math.floor(rand() * 4);
      let x = 0;
      let z = 0;
      const off = pad + rand() * 320;
      if (side === 0) {
        x = SITE.minX - off;
        z = SITE.minZ - 120 + rand() * (SITE.maxZ - SITE.minZ + 240);
      } else if (side === 1) {
        x = SITE.maxX + off;
        z = SITE.minZ - 120 + rand() * (SITE.maxZ - SITE.minZ + 240);
      } else if (side === 2) {
        z = SITE.minZ - off;
        x = SITE.minX - 200 + rand() * (SITE.maxX - SITE.minX + 400);
      } else {
        z = SITE.maxZ + off + 60;
        x = SITE.minX - 200 + rand() * (SITE.maxX - SITE.minX + 400);
      }
      const s = 0.9 + rand() * 1.5;
      out.push({
        x,
        z,
        s,
        m: rand() < 0.4 ? S.forestDark : rand() < 0.6 ? S.forest2 : S.forest,
        tall: rand() < 0.25,
      });
    }
    return out;
  }, []);

  return (
    <group>
      <TreeTrunks trees={trees} tall={false} />
      <TreeTrunks trees={trees} tall={true} />
      {[S.forestDark, S.forest2, S.forest].map((material) => (
        <group key={material.uuid}>
          <TreeCanopies trees={trees} tall={false} material={material} />
          <TreeCanopies trees={trees} tall={true} material={material} />
        </group>
      ))}
    </group>
  );
}

/* ============ palmeira (canteiro da avenida da frente) ============ */
export function Palm({
  position,
  scale = 1,
  seed = 1,
}: {
  position: [number, number, number];
  scale?: number;
  seed?: number;
}) {
  const fronds = useMemo(() => {
    const rand = rng(seed * 97 + 5);
    return Array.from({ length: 8 }, (_, i) => ({
      a: (i / 8) * Math.PI * 2 + rand() * 0.3,
      tilt: 0.55 + rand() * 0.35,
      len: 2.6 + rand() * 1.1,
    }));
  }, [seed]);

  return (
    <group position={position} scale={scale}>
      <mesh
        geometry={G.cyl8}
        material={S.palmTrunk}
        position={[0, 3.4, 0]}
        scale={[0.42, 6.8, 0.42]}
      />
      <mesh geometry={G.sphere} material={S.palmLeaf} position={[0, 6.9, 0]} scale={0.7} />
      {fronds.map((f, i) => (
        <mesh
          key={i}
          geometry={G.cone}
          material={S.palmLeaf}
          position={[Math.cos(f.a) * f.len * 0.5, 6.9 - f.tilt * 0.7, Math.sin(f.a) * f.len * 0.5]}
          rotation={[Math.PI / 2 - f.tilt, 0, -f.a]}
          scale={[1.1, f.len * 1.6, 0.28]}
        />
      ))}
    </group>
  );
}

/** aleia de palmeiras junto à rodovia (frente do loteamento) */
function PalmAvenue() {
  const palms = useMemo(() => {
    const out: { x: number; z: number; s: number }[] = [];
    for (let x = SITE.minX + 6; x <= SITE.maxX - 6; x += 11) {
      out.push({ x, z: SITE.maxZ + 16, s: 0.9 + ((x * 7919) % 30) / 100 });
    }
    return out;
  }, []);
  return (
    <group>
      {/* canteiro gramado + calçada da rodovia */}
      <mesh
        geometry={G.plane}
        material={S.pasture}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[(SITE.minX + SITE.maxX) / 2, 0.03, SITE.maxZ + 16]}
        scale={[SITE.maxX - SITE.minX + 40, 22, 1]}
      />
      <mesh
        geometry={G.plane}
        material={mat("#3b3f45", { roughness: 1 })}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[(SITE.minX + SITE.maxX) / 2, 0.02, SITE.maxZ + 42]}
        scale={[SITE.maxX - SITE.minX + 240, 22, 1]}
      />
      {palms.map((p, i) => (
        <Palm key={i} position={[p.x, 0, p.z]} scale={p.s} seed={i + 1} />
      ))}
    </group>
  );
}

/* ============ poste de madeira com fiação ============ */
export function UtilityPole({
  position,
  rotation = 0,
  span,
}: {
  position: [number, number, number];
  rotation?: number;
  /** distância até o próximo poste (para desenhar o cabo) */
  span?: { dx: number; dz: number };
}) {
  const wire = useMemo(() => {
    if (!span) return null;
    const pts: THREE.Vector3[] = [];
    const seg = 8;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const sag = Math.sin(t * Math.PI) * 0.9;
      pts.push(new THREE.Vector3(span.dx * t, 8.4 - sag, span.dz * t));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [span]);

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh
        geometry={G.cyl8}
        material={S.woodPole}
        position={[0, 4.6, 0]}
        scale={[0.3, 9.2, 0.3]}
      />
      <P p={[0, 8.6, 0]} s={[2.4, 0.16, 0.16]} m={S.woodPole} g={G.box} />
      <P p={[0, 7.7, 0]} s={[1.6, 0.14, 0.14]} m={S.woodPole} g={G.box} />
      {/* luminária pública */}
      <P p={[1.5, 8.2, 0]} s={[1.6, 0.12, 0.12]} m={S.playMetal} g={G.box} />
      <mesh
        geometry={G.softS}
        material={S.playMetal}
        position={[2.3, 8.05, 0]}
        scale={[0.85, 0.18, 0.42]}
      />
      {wire && <primitive object={new THREE.Line(wire, S.wire)} />}
    </group>
  );
}

/** postes de madeira ao longo das ruas, com fiação entre eles */
function PowerGrid({
  streets,
}: {
  streets: { x: number; z: number; width: number; depth: number }[];
}) {
  const poles = useMemo(() => {
    const out: { p: [number, number, number]; r: number; span?: { dx: number; dz: number } }[] = [];
    for (const s of streets) {
      const horizontal = s.width >= s.depth;
      const step = 40;
      if (horizontal) {
        const n = Math.floor((s.width - 10) / step);
        for (let i = 0; i <= n; i++) {
          const x = s.x + 8 + i * step;
          out.push({
            p: [x, 0, s.z - 2.4],
            r: 0,
            span: i < n ? { dx: step, dz: 0 } : undefined,
          });
        }
      } else {
        const n = Math.floor((s.depth - 10) / step);
        for (let i = 0; i <= n; i++) {
          const z = s.z + 8 + i * step;
          out.push({
            p: [s.x - 2.4, 0, z],
            r: Math.PI / 2,
            span: i < n ? { dx: 0, dz: step } : undefined,
          });
        }
      }
    }
    return out.slice(0, 120);
  }, [streets]);

  return (
    <group>
      {poles.map((p, i) => (
        <UtilityPole key={i} position={p.p} rotation={p.r} span={p.span} />
      ))}
    </group>
  );
}

/* ============ praça com playground e academia ao ar livre ============ */
export function Praca({
  x,
  z,
  width,
  depth,
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
}) {
  const cx = x + width / 2;
  const cz = z + depth / 2;
  return (
    <group>
      {/* laje de concreto */}
      <mesh
        geometry={G.plane}
        material={S.concrete}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[cx, 0.06, cz]}
        scale={[width * 0.78, depth * 0.7, 1]}
      />
      {/* playground */}
      <group position={[cx - width * 0.18, 0, cz - depth * 0.12]}>
        <P p={[0, 1.6, 0]} s={[2.4, 0.2, 2.4]} m={S.playWood} />
        {[-1, 1].map((sx) =>
          [-1, 1].map((sz) => (
            <mesh
              key={`${sx}${sz}`}
              geometry={G.cyl8}
              material={S.playMetal}
              position={[sx * 1.05, 0.8, sz * 1.05]}
              scale={[0.14, 1.6, 0.14]}
            />
          )),
        )}
        <mesh
          geometry={G.pyramid}
          material={S.playBlue}
          position={[0, 2.5, 0]}
          scale={[3.4, 1.2, 3.4]}
        />
        {/* escorregador */}
        <mesh
          geometry={G.box}
          material={S.playRed}
          position={[2.1, 0.95, 0.4]}
          rotation={[0, 0, -0.62]}
          scale={[2.9, 0.14, 0.8]}
        />
        {/* balanço */}
        <group position={[-3.6, 0, 0]}>
          {[-1, 1].map((sx) => (
            <mesh
              key={sx}
              geometry={G.cyl8}
              material={S.playMetal}
              position={[sx * 1.4, 1.1, 0]}
              rotation={[0, 0, sx * 0.2]}
              scale={[0.12, 2.2, 0.12]}
            />
          ))}
          <P p={[0, 2.2, 0]} s={[3, 0.12, 0.12]} m={S.playMetal} g={G.box} />
          {[-0.7, 0.7].map((dx) => (
            <P key={dx} p={[dx, 0.75, 0]} s={[0.6, 0.08, 0.3]} m={S.playYellow} g={G.box} />
          ))}
        </group>
      </group>

      {/* academia ao ar livre */}
      {[
        [0.15, -0.05],
        [0.3, 0.12],
        [0.05, 0.2],
        [0.34, -0.18],
      ].map(([fx, fz], i) => (
        <group key={i} position={[cx + width * fx, 0, cz + depth * fz]}>
          <mesh
            geometry={G.cyl8}
            material={S.playMetal}
            position={[0, 0.5, 0]}
            scale={[0.16, 1, 0.16]}
          />
          <P p={[0, 1.05, 0]} s={[1.3, 0.12, 0.35]} m={S.playYellow} g={G.softS} />
          <P p={[0.55, 0.7, 0]} s={[0.14, 0.7, 0.14]} m={S.playMetal} g={G.box} />
        </group>
      ))}

      {/* bancos de madeira */}
      {[-0.3, 0.0, 0.28].map((f, i) => (
        <group key={`bk${i}`} position={[cx + width * f * 0.8, 0, cz + depth * 0.3]}>
          <P p={[0, 0.45, 0]} s={[1.7, 0.1, 0.5]} m={S.playWood} g={G.softS} />
          {[-0.7, 0.7].map((dx) => (
            <P key={dx} p={[dx, 0.22, 0]} s={[0.12, 0.45, 0.45]} m={S.playMetal} g={G.box} />
          ))}
        </group>
      ))}
    </group>
  );
}

/* ============ estande de vendas + outdoor ============ */
export function SalesStand({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {/* piso */}
      <mesh
        geometry={G.plane}
        material={S.concrete}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.05, 0]}
        scale={[22, 16, 1]}
      />
      {/* estande */}
      <P p={[0, 1.7, 0]} s={[9, 3.4, 7]} m={S.kioskWall} />
      <P p={[0, 0.35, 0]} s={[9.4, 0.7, 7.4]} m={S.kioskBlue} />
      <mesh geometry={G.prism} material={S.kioskRoof} position={[0, 4.1, 0]} scale={[10, 1.4, 8]} />
      <P p={[0, 1.6, 3.55]} s={[2, 2.4, 0.12]} m={S.kioskBlue} g={G.box} />

      {/* outdoor "LIBERADO PARA CONSTRUIR" */}
      <group position={[15, 0, -2]}>
        {[-3.4, 0, 3.4].map((dx) => (
          <mesh
            key={dx}
            geometry={G.cyl8}
            material={S.boardFrame}
            position={[dx, 1.6, 0]}
            scale={[0.2, 3.2, 0.2]}
          />
        ))}
        <P p={[0, 4.6, 0]} s={[10.5, 3.4, 0.2]} m={S.boardFace} g={G.box} />
        <P p={[0, 3.1, 0.14]} s={[10.5, 0.9, 0.12]} m={S.boardStrip} g={G.box} />
        <P p={[0, 6.35, 0]} s={[11, 0.25, 0.35]} m={S.boardFrame} g={G.box} />
      </group>

      {/* bandeiras promocionais */}
      {[-7, -5.5, -4].map((dx, i) => (
        <group key={i} position={[dx, 0, 4]}>
          <mesh
            geometry={G.cyl8}
            material={S.playMetal}
            position={[0, 2, 0]}
            scale={[0.08, 4, 0.08]}
          />
          <P
            p={[0.5, 2.9, 0]}
            s={[0.9, 2.2, 0.06]}
            m={i % 2 ? S.kioskBlue : S.boardStrip}
            g={G.box}
          />
        </group>
      ))}
    </group>
  );
}

/* ============ manchas de terra vermelha (corte do terreno) ============ */
function ClayPatches() {
  const patches = useMemo(() => {
    const rand = rng(777);
    return Array.from({ length: 7 }, () => ({
      x: SITE.minX - 120 - rand() * 90,
      z: SITE.minZ + rand() * (SITE.maxZ - SITE.minZ),
      w: 60 + rand() * 90,
      d: 50 + rand() * 80,
    }));
  }, []);
  return (
    <group>
      {patches.map((p, i) => (
        <mesh
          key={i}
          geometry={G.cyl8}
          material={S.clay}
          position={[p.x, 0.02, p.z]}
          scale={[p.w, 0.04, p.d]}
        />
      ))}
    </group>
  );
}

export function Scenery({
  streets,
}: {
  streets: { x: number; z: number; width: number; depth: number }[];
}) {
  return (
    <group>
      <Mountains />
      <Forest />
      <ClayPatches />
      <PalmAvenue />
      <PowerGrid streets={streets} />
    </group>
  );
}
