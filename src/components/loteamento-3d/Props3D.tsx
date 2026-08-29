import * as THREE from "three";
import { CAR_M, G, PROP_M, mat } from "@/lib/loteamento-3d/three-assets";

/**
 * Mesh utilitário com geometria/material compartilhados. Lança e recebe
 * sombra por padrão — é o bloco de construção de quase toda a cena (casas,
 * mobiliário urbano, praça), então ligar aqui é o jeito mais barato de dar
 * sombra real pra cena inteira de uma vez. `shadow={false}` desliga nos
 * poucos casos em que não vale o custo (vidros finos, detalhes minúsculos).
 */
export function P({
  p,
  s,
  m,
  r,
  g = G.soft,
  shadow = true,
}: {
  p: [number, number, number];
  s: [number, number, number];
  m: THREE.Material;
  r?: [number, number, number];
  g?: THREE.BufferGeometry;
  shadow?: boolean;
}) {
  return (
    <mesh
      geometry={g}
      material={m}
      position={p}
      scale={s}
      rotation={r}
      castShadow={shadow}
      receiveShadow={shadow}
    />
  );
}

/** sombra de contato falsa (barata) */
export function ContactShadow({ p, s }: { p: [number, number, number]; s: [number, number] }) {
  return (
    <mesh
      geometry={G.plane}
      material={PROP_M.shadow}
      position={[p[0], p[1], p[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[s[0], s[1], 1]}
    />
  );
}

/**
 * Carro com carroceria arredondada, vidros, rodas, faróis e lanternas.
 * Comprimento ~4.4m, olhando para +Z.
 */
export function Car({
  position = [0, 0, 0],
  rotation = 0,
  colorIndex = 0,
  suv = false,
  scale = 1,
}: {
  position?: [number, number, number];
  rotation?: number;
  colorIndex?: number;
  suv?: boolean;
  scale?: number;
}) {
  const body = CAR_M.body[colorIndex % CAR_M.body.length];
  const L = suv ? 4.8 : 4.3;
  const W = suv ? 2.0 : 1.85;
  const bodyH = suv ? 0.95 : 0.8;
  const y0 = suv ? 0.42 : 0.36;
  const cabinH = suv ? 0.85 : 0.7;
  const cabinY = y0 + bodyH / 2 + cabinH / 2 - 0.06;

  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      {/* carroceria */}
      <P p={[0, y0 + bodyH / 2, 0]} s={[W, bodyH, L]} m={body} />
      {/* capô/porta-malas mais baixos, dá silhueta de carro */}
      <P p={[0, y0 + bodyH + 0.06, L / 2 - 0.75]} s={[W - 0.12, 0.22, 1.4]} m={body} />
      <P p={[0, y0 + bodyH + 0.06, -L / 2 + 0.7]} s={[W - 0.12, 0.22, 1.2]} m={body} />
      {/* cabine */}
      <P p={[0, cabinY, -0.15]} s={[W - 0.22, cabinH, L * 0.46]} m={body} />
      {/* vidros */}
      <P p={[0, cabinY, -0.15 + L * 0.23]} s={[W - 0.34, cabinH - 0.22, 0.08]} m={CAR_M.glass} />
      <P p={[0, cabinY, -0.15 - L * 0.23]} s={[W - 0.34, cabinH - 0.22, 0.08]} m={CAR_M.glass} />
      {[-1, 1].map((sg) => (
        <P
          key={sg}
          p={[sg * (W / 2 - 0.12), cabinY, -0.15]}
          s={[0.06, cabinH - 0.26, L * 0.4]}
          m={CAR_M.glass}
        />
      ))}
      {/* faixa inferior / para-choques */}
      <P p={[0, y0 + 0.12, 0]} s={[W + 0.05, 0.24, L - 0.25]} m={CAR_M.trim} />
      {/* faróis e lanternas */}
      {[-1, 1].map((sg) => (
        <group key={`l${sg}`}>
          <P
            p={[sg * (W / 2 - 0.35), y0 + bodyH - 0.18, L / 2 - 0.02]}
            s={[0.42, 0.18, 0.1]}
            m={CAR_M.light}
            g={G.softS}
          />
          <P
            p={[sg * (W / 2 - 0.35), y0 + bodyH - 0.18, -L / 2 + 0.02]}
            s={[0.42, 0.18, 0.1]}
            m={CAR_M.tail}
            g={G.softS}
          />
        </group>
      ))}
      {/* rodas */}
      {[
        [-1, 1],
        [1, 1],
        [-1, -1],
        [1, -1],
      ].map(([sx, sz], i) => (
        <group key={i} position={[sx * (W / 2 - 0.08), y0 - 0.02, sz * (L / 2 - 1.05)]}>
          <mesh geometry={G.wheel} material={CAR_M.tire} scale={[0.26, 0.66, 0.66]} />
          <mesh
            geometry={G.wheel}
            material={CAR_M.rim}
            scale={[0.28, 0.34, 0.34]}
            position={[sx * 0.02, 0, 0]}
          />
        </group>
      ))}
      <ContactShadow p={[0, 0.03, 0]} s={[W + 0.5, L + 0.6]} />
    </group>
  );
}

/** poste de iluminação pública com braço curvo */
export function StreetLamp({
  position,
  rotation = 0,
}: {
  position: [number, number, number];
  rotation?: number;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh
        geometry={G.cyl8}
        material={PROP_M.metal}
        position={[0, 0.18, 0]}
        scale={[0.55, 0.36, 0.55]}
      />
      <mesh
        geometry={G.cyl8}
        material={PROP_M.pole}
        position={[0, 3.4, 0]}
        scale={[0.28, 6.8, 0.28]}
      />
      <mesh
        geometry={G.cyl8}
        material={PROP_M.pole}
        position={[0.75, 6.65, 0]}
        rotation={[0, 0, -Math.PI / 2.6]}
        scale={[0.2, 1.8, 0.2]}
      />
      <mesh
        geometry={G.softS}
        material={PROP_M.lampHead}
        position={[1.5, 6.45, 0]}
        scale={[1.1, 0.22, 0.5]}
      />
      <mesh
        geometry={G.plane}
        material={PROP_M.bulb}
        position={[1.5, 6.32, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[0.9, 0.4, 1]}
      />
    </group>
  );
}

/** placa de nome de rua (duas lâminas verdes cruzadas) */
export function StreetSign({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh
        geometry={G.cyl8}
        material={PROP_M.pole}
        position={[0, 1.7, 0]}
        scale={[0.14, 3.4, 0.14]}
      />
      <mesh
        geometry={G.softS}
        material={PROP_M.signGreen}
        position={[0.75, 3.3, 0]}
        scale={[2.4, 0.5, 0.06]}
      />
      <mesh
        geometry={G.softS}
        material={PROP_M.signGreen}
        position={[0, 2.75, 0.75]}
        scale={[0.06, 0.5, 2.4]}
      />
    </group>
  );
}

/** placa de trânsito (PARE / velocidade) */
export function TrafficSign({
  position,
  kind = "stop",
  rotation = 0,
}: {
  position: [number, number, number];
  kind?: "stop" | "speed" | "warn";
  rotation?: number;
}) {
  const m =
    kind === "stop" ? PROP_M.signRed : kind === "warn" ? PROP_M.signYellow : PROP_M.signWhite;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh
        geometry={G.cyl8}
        material={PROP_M.pole}
        position={[0, 1.15, 0]}
        scale={[0.11, 2.3, 0.11]}
      />
      {kind === "stop" ? (
        <mesh
          geometry={G.cyl}
          material={m}
          position={[0, 2.5, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[1.1, 0.08, 1.1]}
        />
      ) : kind === "warn" ? (
        <mesh
          geometry={G.softS}
          material={m}
          position={[0, 2.5, 0]}
          rotation={[0, 0, Math.PI / 4]}
          scale={[0.85, 0.85, 0.07]}
        />
      ) : (
        <mesh geometry={G.softS} material={m} position={[0, 2.5, 0]} scale={[0.9, 1.1, 0.07]} />
      )}
    </group>
  );
}

/** faixa de pedestres */
export function Crosswalk({
  x,
  z,
  width,
  depth,
  horizontal,
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
  horizontal: boolean;
}) {
  const span = horizontal ? depth : width;
  const n = Math.max(3, Math.floor(span / 1.1));
  return (
    <group>
      {Array.from({ length: n }).map((_, i) => {
        const off = -span / 2 + span * ((i + 0.5) / n);
        return (
          <mesh
            key={i}
            geometry={G.plane}
            material={PROP_M.paint}
            rotation={[-Math.PI / 2, 0, 0]}
            position={horizontal ? [x, 0.07, z + off] : [x + off, 0.07, z]}
            scale={horizontal ? [2.6, 0.45, 1] : [0.45, 2.6, 1]}
          />
        );
      })}
    </group>
  );
}

/** banco de praça */
export function Bench({
  position,
  rotation = 0,
}: {
  position: [number, number, number];
  rotation?: number;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <P p={[0, 0.45, 0]} s={[1.8, 0.1, 0.55]} m={PROP_M.bench} />
      <P p={[0, 0.78, -0.25]} s={[1.8, 0.5, 0.1]} m={PROP_M.bench} />
      {[-0.7, 0.7].map((dx) => (
        <P key={dx} p={[dx, 0.22, 0]} s={[0.12, 0.45, 0.5]} m={PROP_M.metal} />
      ))}
    </group>
  );
}

/** lixeira */
export function TrashBin({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh
        geometry={G.cyl}
        material={PROP_M.metal}
        position={[0, 0.45, 0]}
        scale={[0.6, 0.9, 0.6]}
      />
      <mesh
        geometry={G.cyl}
        material={PROP_M.pole}
        position={[0, 0.95, 0]}
        scale={[0.68, 0.1, 0.68]}
      />
    </group>
  );
}

export const HOUSE_EXTRA_M = {
  mailbox: mat("#3f4a52", { roughness: 0.6, metalness: 0.3 }),
  planter: mat("#a8886a", { roughness: 0.95 }),
  bush: mat("#3f7a37", { roughness: 1, flatShading: false }),
  flower: mat("#d6567b", { roughness: 0.9 }),
  lampPost: mat("#2f3439", { roughness: 0.6 }),
  gravel: mat("#cfcabd", { roughness: 1 }),
};
