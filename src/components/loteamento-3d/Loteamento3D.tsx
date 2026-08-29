import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Billboard, Html, Sky } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { LoteStatus } from "@/lib/types";
import { House, HouseLOD } from "@/components/loteamento-3d/House3D";
import { HOUSE_PLOTS, type HousePlot } from "@/lib/loteamento-3d/houses";
import { G, PROP_M } from "@/lib/loteamento-3d/three-assets";
import {
  Bench,
  Crosswalk,
  StreetSign,
  TrafficSign,
  TrashBin,
} from "@/components/loteamento-3d/Props3D";
import { Praca, SalesStand, Scenery } from "@/components/loteamento-3d/Scenery3D";
import {
  GREEN_AREAS,
  INSTITUTIONAL,
  QUADRA_LABELS,
  SITE,
  STREETS,
  type LayoutLot,
  type Rect,
} from "@/lib/loteamento-3d/loteamento";
import {
  asphaltTexture,
  grassTexture,
  noiseRoughnessTexture,
} from "@/lib/loteamento-3d/procedural-textures";

/** rótulos em HTML — troika criaria um 2º contexto WebGL e derrubaria a cena */
function Text({
  position,
  fontSize = 3,
  color = "#ffffff",
  outlineColor,
  children,
}: {
  position?: [number, number, number];
  fontSize?: number;
  color?: string;
  outlineColor?: string;
  children: React.ReactNode;
  font?: string;
  rotation?: [number, number, number];
  anchorX?: string;
  anchorY?: string;
  outlineWidth?: number;
}) {
  return (
    <Html position={position} center distanceFactor={160} style={{ pointerEvents: "none" }}>
      <span
        style={{
          color,
          fontSize: `${fontSize * 5}px`,
          fontWeight: 700,
          whiteSpace: "nowrap",
          letterSpacing: "0.02em",
          textShadow: outlineColor
            ? `0 0 6px ${outlineColor}, 0 1px 2px ${outlineColor}`
            : "0 1px 2px rgba(0,0,0,0.35)",
        }}
      >
        {children}
      </span>
    </Html>
  );
}

export interface LotView extends LayoutLot {
  id: string | null;
  status: LoteStatus;
  valor: number | null;
  observacoes: string | null;
}

const STATUS_COLORS: Record<LoteStatus, string> = {
  disponivel: "#22c55e",
  reservado: "#f59e0b",
  vendido: "#ef4444",
};

const FONT_URL = "/fonts/inter-600.woff";

const COLORS = {
  grass: "#7ea852",
  quadra: "#c6ab6e",
  street: "#3b3f45",
  streetLine: "#e8e6df",
  green: "#4d8a3d",
  institutional: "#9db4c0",
  trunk: "#6b4a2f",
  canopy: "#3d7032",
};

function LotMesh({
  lot,
  onSelect,
  selected,
}: {
  lot: LotView;
  onSelect: (l: LotView) => void;
  selected: boolean;
}) {
  const [hover, setHover] = useState(false);
  const groupRef = useRef<THREE.Group>(null);
  const color = STATUS_COLORS[lot.status];
  const height = 0.12;
  const fontSize = Math.min(Math.min(lot.width, lot.depth) * 0.42, lot.width * 0.28);

  useFrame(() => {
    if (!groupRef.current) return;
    const targetY = hover || selected ? 0.35 : 0;
    groupRef.current.position.y += (targetY - groupRef.current.position.y) * 0.15;
  });

  return (
    <group position={[lot.x, 0, lot.z]}>
      <group ref={groupRef}>
        <mesh
          position={[0, height / 2, 0]}
          receiveShadow
          onClick={(e) => {
            e.stopPropagation();
            onSelect(lot);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHover(true);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            setHover(false);
            document.body.style.cursor = "auto";
          }}
        >
          <boxGeometry args={[lot.width - 0.6, height, lot.depth - 0.6]} />
          <meshStandardMaterial
            color={color}
            emissive={selected || hover ? color : "#000"}
            emissiveIntensity={selected ? 0.5 : hover ? 0.25 : 0}
            roughness={0.7}
            metalness={0.02}
          />
        </mesh>
        {hover || selected ? (
          <Text
            font={FONT_URL}
            position={[0, height + 0.06, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={fontSize}
            color="#14261a"
            anchorX="center"
            anchorY="middle"
          >
            {String(lot.number)}
          </Text>
        ) : null}
      </group>
    </group>
  );
}

function FlatRect({
  rect,
  color,
  y = 0.02,
  map,
}: {
  rect: Rect;
  color: string;
  y?: number;
  map?: THREE.Texture;
}) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[rect.x + rect.width / 2, y, rect.z + rect.depth / 2]}
      receiveShadow
    >
      <planeGeometry args={[rect.width, rect.depth]} />
      <meshStandardMaterial color={color} roughness={1} map={map} />
    </mesh>
  );
}

function Street({ rect, asphaltMap }: { rect: Rect; asphaltMap?: THREE.Texture }) {
  const horizontal = rect.width >= rect.depth;
  const length = horizontal ? rect.width : rect.depth;
  const dashes = useMemo(() => {
    const step = 9;
    const count = Math.floor((length - 4) / step);
    return Array.from({ length: count }, (_, i) => 4 + i * step + step / 2);
  }, [length]);

  return (
    <group>
      <FlatRect rect={rect} color={COLORS.street} y={0.04} map={asphaltMap} />
      {/* meio-fio dos dois lados */}
      {[-1, 1].map((sg) => (
        <mesh
          key={sg}
          geometry={G.box}
          material={PROP_M.curb}
          position={
            horizontal
              ? [rect.x + rect.width / 2, 0.11, rect.z + rect.depth / 2 + sg * (rect.depth / 2)]
              : [rect.x + rect.width / 2 + sg * (rect.width / 2), 0.11, rect.z + rect.depth / 2]
          }
          scale={horizontal ? [rect.width, 0.22, 0.5] : [0.5, 0.22, rect.depth]}
        />
      ))}
      {dashes.map((d, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          position={
            horizontal
              ? [rect.x + d, 0.06, rect.z + rect.depth / 2]
              : [rect.x + rect.width / 2, 0.06, rect.z + d]
          }
        >
          <planeGeometry args={horizontal ? [3.2, 0.35] : [0.35, 3.2]} />
          <meshStandardMaterial color={COLORS.streetLine} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/** postes, placas e faixas de pedestre do condomínio */
function StreetFurniture() {
  const items = useMemo(() => {
    const lamps: { x: number; z: number; r: number }[] = [];
    const signs: [number, number, number][] = [];
    const traffic: { p: [number, number, number]; kind: "stop" | "speed" | "warn" }[] = [];
    const crossings: {
      x: number;
      z: number;
      width: number;
      depth: number;
      horizontal: boolean;
    }[] = [];

    const horizontals = STREETS.filter((s) => s.width >= s.depth);
    const verticals = STREETS.filter((s) => s.width < s.depth);

    for (const s of horizontals) {
      const step = 46;
      const n = Math.max(1, Math.floor((s.width - 20) / step));
      for (let i = 0; i <= n; i++) {
        const x = s.x + 12 + i * ((s.width - 24) / Math.max(1, n));
        lamps.push({ x, z: s.z - 1.2, r: 0 });
        if (i % 2 === 0) lamps.push({ x: x + step / 2, z: s.z + s.depth + 1.2, r: Math.PI });
      }
    }
    for (const s of verticals) {
      const step = 52;
      const n = Math.max(1, Math.floor((s.depth - 20) / step));
      for (let i = 0; i <= n; i++) {
        const z = s.z + 12 + i * ((s.depth - 24) / Math.max(1, n));
        lamps.push({ x: s.x - 1.2, z, r: Math.PI / 2 });
      }
    }

    // cruzamentos: placa de rua, PARE e faixas
    for (const h of horizontals) {
      for (const v of verticals) {
        const ox = v.x < h.x + h.width && v.x + v.width > h.x;
        const oz = h.z < v.z + v.depth && h.z + h.depth > v.z;
        if (!ox || !oz) continue;
        const cx = v.x + v.width / 2;
        const cz = h.z + h.depth / 2;
        signs.push([cx - v.width / 2 - 2.4, 0, cz - h.depth / 2 - 2.4]);
        traffic.push({
          p: [cx + v.width / 2 + 2.2, 0, cz + h.depth / 2 + 2.2],
          kind: "stop",
        });
        crossings.push({
          x: cx - v.width / 2 - 3.2,
          z: cz,
          width: v.width,
          depth: h.depth,
          horizontal: true,
        });
        crossings.push({
          x: cx,
          z: cz - h.depth / 2 - 3.2,
          width: v.width,
          depth: h.depth,
          horizontal: false,
        });
      }
    }

    // limita para manter performance
    return {
      lamps: lamps.slice(0, 90),
      signs: signs.slice(0, 26),
      traffic: traffic.slice(0, 26),
      crossings: crossings.slice(0, 40),
    };
  }, []);

  return (
    <group>
      {items.signs.map((p, i) => (
        <StreetSign key={`sg${i}`} position={p} />
      ))}
      {items.traffic.map((t, i) => (
        <TrafficSign key={`tf${i}`} position={t.p} kind={t.kind} />
      ))}
      {items.crossings.map((c, i) => (
        <Crosswalk key={`cw${i}`} {...c} />
      ))}
    </group>
  );
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Tree({ x, z, scale }: { x: number; z: number; scale: number }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh geometry={G.cyl8} position={[0, 1.1, 0]} scale={[0.55, 2.2, 0.55]} castShadow>
        <meshStandardMaterial color={COLORS.trunk} roughness={1} />
      </mesh>
      <mesh geometry={G.blob} position={[0, 3.1, 0]} scale={3.4} castShadow receiveShadow>
        <meshStandardMaterial color={COLORS.canopy} roughness={0.95} />
      </mesh>
    </group>
  );
}

function GreenArea({ rect, seed }: { rect: Rect; seed: number }) {
  const items = useMemo(() => {
    const rand = mulberry32(seed * 7919 + 13);
    const count = Math.max(2, Math.round((rect.width * rect.depth) / 900));
    const trees = Array.from({ length: count }, () => ({
      x: rect.x + 2.5 + rand() * (rect.width - 5),
      z: rect.z + 2.5 + rand() * (rect.depth - 5),
      scale: 0.8 + rand() * 0.9,
    }));
    const benches = Array.from({ length: 2 }, (_, i) => ({
      x: rect.x + rect.width * (0.3 + 0.4 * i),
      z: rect.z + rect.depth * 0.5,
      r: i % 2 ? Math.PI : 0,
    }));
    return { trees, benches };
  }, [rect, seed]);

  return (
    <group>
      <FlatRect rect={rect} color={COLORS.green} y={0.03} />
      {items.trees.map((t, i) => (
        <Tree key={i} {...t} />
      ))}
      {items.benches.map((b, i) => (
        <group key={`bn${i}`}>
          <Bench position={[b.x, 0, b.z]} rotation={b.r} />
          {i === 0 && <TrashBin position={[b.x + 2.2, 0, b.z]} />}
        </group>
      ))}
      {rect.label ? (
        <Text
          font={FONT_URL}
          position={[rect.x + rect.width / 2, 0.12, rect.z + rect.depth - 3]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={2.4}
          color="#dcefd2"
          anchorX="center"
          anchorY="middle"
        >
          {rect.label}
        </Text>
      ) : null}
    </group>
  );
}

function Institutional() {
  const r = INSTITUTIONAL;
  return (
    <group>
      <FlatRect rect={r} color={COLORS.institutional} y={0.03} />
      <mesh
        geometry={G.soft}
        position={[r.x + r.width / 2, 2.2, r.z + r.depth / 2]}
        scale={[r.width * 0.45, 4.4, r.depth * 0.4]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#e7e2d5" roughness={0.8} />
      </mesh>
      <mesh
        geometry={G.soft}
        position={[r.x + r.width / 2, 5.3, r.z + r.depth / 2]}
        scale={[r.width * 0.5, 1.4, r.depth * 0.45]}
        castShadow
      >
        <meshStandardMaterial color="#b0492f" roughness={0.9} />
      </mesh>
      <Text
        font={FONT_URL}
        position={[r.x + r.width / 2, 0.12, r.z + r.depth - 4]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={3}
        color="#243b4a"
        anchorX="center"
        anchorY="middle"
      >
        {r.label}
      </Text>
    </group>
  );
}

function Entrance() {
  const cx = 144;
  const z = SITE.maxZ + 2;
  return (
    <group>
      {[-8, 8].map((dx) => (
        <mesh
          key={dx}
          geometry={G.soft}
          position={[cx + dx, 2.4, z]}
          scale={[1.6, 4.8, 1.6]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#e7e2d5" roughness={0.8} />
        </mesh>
      ))}
      <mesh geometry={G.soft} position={[cx, 5.1, z]} scale={[19, 1.2, 1.8]} castShadow>
        <meshStandardMaterial color="#e7e2d5" roughness={0.8} />
      </mesh>
      <TrafficSign position={[cx + 14, 0, z - 3]} kind="speed" />
      <TrafficSign position={[cx - 14, 0, z - 3]} kind="warn" />
      <Text
        font={FONT_URL}
        position={[cx, 5.2, z + 1.05]}
        fontSize={1.5}
        color="#243b4a"
        anchorX="center"
        anchorY="middle"
      >
        ENTRADA
      </Text>
    </group>
  );
}

function QuadraLabel({ quadra, x, z }: { quadra: number; x: number; z: number }) {
  return (
    <Billboard position={[x, 9, z]}>
      <Text
        font={FONT_URL}
        fontSize={4}
        color="#ffffff"
        outlineWidth={0.28}
        outlineColor="#1f2937"
        anchorX="center"
        anchorY="middle"
      >
        {`Q${quadra}`}
      </Text>
    </Billboard>
  );
}

/** casas com nível de detalhe por distância (mantém o FPS alto ao voar) */
function Houses({ plots }: { plots: HousePlot[] }) {
  const [nearKeys, setNearKeys] = useState<Set<string>>(() => new Set());
  const tick = useRef(0);

  useFrame(({ camera }) => {
    if (tick.current++ % 12 !== 0) return;
    const p = camera.position;
    const next = new Set<string>();
    for (const h of plots) {
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d < 190) next.add(h.lots.join("-"));
    }
    setNearKeys((prev) => {
      if (prev.size === next.size) {
        let same = true;
        for (const k of next)
          if (!prev.has(k)) {
            same = false;
            break;
          }
        if (same) return prev;
      }
      return next;
    });
  });

  return (
    <group>
      {plots.map((h) => {
        const key = h.lots.join("-");
        return nearKeys.has(key) ? <House key={key} plot={h} /> : <HouseLOD key={key} plot={h} />;
      })}
    </group>
  );
}

/** câmera de voo em 1ª pessoa (WASD + mouse, estilo jogo) */
function FlyCamera({
  enabled,
  onLockChange,
}: {
  enabled: boolean;
  onLockChange: (v: boolean) => void;
}) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const euler = useRef(new THREE.Euler(0, 0, 0, "YXZ"));
  const vel = useRef(new THREE.Vector3());

  useEffect(() => {
    if (!enabled) return;
    const dom = gl.domElement;
    euler.current.setFromQuaternion(camera.quaternion);

    const requestLock = () => {
      if (document.pointerLockElement !== dom) dom.requestPointerLock?.();
    };
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== dom) return;
      euler.current.y -= e.movementX * 0.0022;
      euler.current.x -= e.movementY * 0.0022;
      euler.current.x = Math.max(
        -Math.PI / 2 + 0.05,
        Math.min(Math.PI / 2 - 0.05, euler.current.x),
      );
      camera.quaternion.setFromEuler(euler.current);
    };
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      keys.current[e.code] = down;
      if (["Space", "ShiftLeft", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code))
        e.preventDefault();
    };
    const kd = onKey(true);
    const ku = onKey(false);
    const onLock = () => onLockChange(document.pointerLockElement === dom);

    dom.addEventListener("click", requestLock);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("keydown", kd);
    document.addEventListener("keyup", ku);
    document.addEventListener("pointerlockchange", onLock);
    return () => {
      dom.removeEventListener("click", requestLock);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("keydown", kd);
      document.removeEventListener("keyup", ku);
      document.removeEventListener("pointerlockchange", onLock);
      keys.current = {};
      if (document.pointerLockElement === dom) document.exitPointerLock();
      onLockChange(false);
    };
  }, [enabled, camera, gl, onLockChange]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const k = keys.current;
    const dt = Math.min(delta, 0.05);
    const boost = k["ShiftLeft"] || k["ShiftRight"] ? 3.2 : k["ControlLeft"] ? 0.35 : 1;
    const speed = 42 * boost;

    const dir = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();

    if (k["KeyW"] || k["ArrowUp"]) dir.add(fwd);
    if (k["KeyS"] || k["ArrowDown"]) dir.sub(fwd);
    if (k["KeyD"] || k["ArrowRight"]) dir.add(right);
    if (k["KeyA"] || k["ArrowLeft"]) dir.sub(right);
    if (k["Space"] || k["KeyE"]) dir.y += 1;
    if (k["KeyQ"] || k["KeyC"]) dir.y -= 1;

    if (dir.lengthSq() > 0) dir.normalize().multiplyScalar(speed);
    vel.current.lerp(dir, 1 - Math.pow(0.0016, dt));
    camera.position.addScaledVector(vel.current, dt);
    if (camera.position.y < 1.6) camera.position.y = 1.6;
  });

  return null;
}

export function Loteamento3D({
  lots,
  selectedNumber,
  onSelect,
  showHouses = true,
  flyMode = false,
  onLockChange,
}: {
  lots: LotView[];
  selectedNumber: number | null;
  onSelect: (l: LotView) => void;
  showHouses?: boolean;
  flyMode?: boolean;
  onLockChange?: (locked: boolean) => void;
}) {
  const center = useMemo(
    () => new THREE.Vector3((SITE.minX + SITE.maxX) / 2, 0, (SITE.minZ + SITE.maxZ) / 2),
    [],
  );

  // Direção do sol reaproveitada pelo céu (Sky) e pela luz direcional
  // principal, pra o disco solar do céu bater com de onde vem a sombra.
  const sunDir = useMemo(() => new THREE.Vector3(220, 260, 60).normalize(), []);
  const sunPos = useMemo(() => center.clone().addScaledVector(sunDir, 420), [center, sunDir]);
  // Alvo da luz: sem isso a directional light mira a origem do mundo
  // (0,0,0), que fica fora do loteamento (centrado em ~[150,0,166]) — a
  // sombra saía toda desalinhada do frustum configurado abaixo.
  const sunTarget = useMemo(() => new THREE.Object3D(), []);

  const grassMap = useMemo(() => grassTexture(), []);
  const roughMap = useMemo(() => noiseRoughnessTexture(), []);
  const asphaltMap = useMemo(() => asphaltTexture(), []);

  const quadraPlates = useMemo(() => {
    const byQuadra = new Map<number, LotView[]>();
    for (const l of lots) {
      const arr = byQuadra.get(l.quadra) ?? [];
      arr.push(l);
      byQuadra.set(l.quadra, arr);
    }
    return [...byQuadra.values()].map((ls) => {
      const minX = Math.min(...ls.map((l) => l.x - l.width / 2));
      const maxX = Math.max(...ls.map((l) => l.x + l.width / 2));
      const minZ = Math.min(...ls.map((l) => l.z - l.depth / 2));
      const maxZ = Math.max(...ls.map((l) => l.z + l.depth / 2));
      return {
        x: minX - 1,
        z: minZ - 1,
        width: maxX - minX + 2,
        depth: maxZ - minZ + 2,
      } as Rect;
    });
  }, [lots]);

  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      camera={{
        position: [center.x, 230, SITE.maxZ + 250],
        fov: 55,
        near: 0.5,
        far: 3000,
      }}
      style={{ background: "linear-gradient(to bottom, #2f7fd0 0%, #6fb3e6 45%, #cfe6f3 100%)" }}
    >
      <Sky
        sunPosition={[sunDir.x * 1000, sunDir.y * 1000, sunDir.z * 1000]}
        turbidity={3}
        rayleigh={1.1}
        mieCoefficient={0.006}
        mieDirectionalG={0.86}
      />
      <fog attach="fog" args={["#bcd8ea", 700, 2600]} />
      <hemisphereLight args={["#cfe6f5", "#6d8a5a", 0.85]} />
      <ambientLight intensity={0.25} />
      <primitive object={sunTarget} position={[center.x, 0, center.z]} />
      <directionalLight
        position={[sunPos.x, sunPos.y, sunPos.z]}
        target={sunTarget}
        intensity={1.35}
        color="#fff3df"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-260}
        shadow-camera-right={260}
        shadow-camera-top={260}
        shadow-camera-bottom={-260}
        shadow-camera-near={100}
        shadow-camera-far={900}
        shadow-normalBias={0.5}
      />
      <directionalLight position={[-160, 180, -120]} intensity={0.4} color="#cfe0ff" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, 0, center.z]} receiveShadow>
        <planeGeometry args={[4000, 4000]} />
        <meshStandardMaterial
          color="#ffffff"
          map={grassMap}
          roughnessMap={roughMap}
          roughness={1}
        />
      </mesh>

      {quadraPlates.map((r, i) => (
        <FlatRect key={i} rect={r} color={COLORS.quadra} y={0.05} />
      ))}

      {STREETS.map((s, i) => (
        <Street key={i} rect={s} asphaltMap={asphaltMap} />
      ))}

      <StreetFurniture />

      <Scenery streets={STREETS} />

      {GREEN_AREAS.map((g, i) => (
        <GreenArea key={i} rect={g} seed={i + 1} />
      ))}
      <Praca {...GREEN_AREAS[0]} />
      <SalesStand x={60} z={SITE.maxZ + 8} />

      <Institutional />
      <Entrance />

      {QUADRA_LABELS.map((q) => (
        <QuadraLabel key={q.quadra} {...q} />
      ))}

      {showHouses && <Houses plots={HOUSE_PLOTS} />}

      {lots.map((lot) => (
        <LotMesh
          key={lot.number}
          lot={lot}
          selected={selectedNumber === lot.number}
          onSelect={onSelect}
        />
      ))}

      <FlyCamera enabled={flyMode} onLockChange={onLockChange ?? (() => {})} />
      {!flyMode && (
        <OrbitControls
          enableDamping
          makeDefault
          target={center}
          maxPolarAngle={Math.PI / 2.05}
          minDistance={8}
          maxDistance={900}
        />
      )}
    </Canvas>
  );
}
