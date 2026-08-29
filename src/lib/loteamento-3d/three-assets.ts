import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/* ---------- geometrias unitárias compartilhadas ---------- */
export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  /** caixa com quinas suaves — tira o aspecto "tudo quadrado" */
  soft: new RoundedBoxGeometry(1, 1, 1, 3, 0.09),
  softS: new RoundedBoxGeometry(1, 1, 1, 2, 0.22),
  plane: new THREE.PlaneGeometry(1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 16),
  sphere: new THREE.SphereGeometry(0.5, 16, 12),
  blob: new THREE.IcosahedronGeometry(0.5, 2),
  torus: new THREE.TorusGeometry(0.36, 0.14, 8, 16),
  /** prisma triangular deitado no eixo X (telhado de duas águas) */
  prism: (() => {
    const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1);
    g.rotateY(Math.PI / 2);
    g.rotateZ(Math.PI / 2);
    return g;
  })(),
  pyramid: (() => {
    const g = new THREE.ConeGeometry(0.5, 1, 4, 1);
    g.rotateY(Math.PI / 4);
    return g;
  })(),
  /** roda: cilindro deitado no eixo X */
  wheel: (() => {
    const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
    g.rotateZ(Math.PI / 2);
    return g;
  })(),
};

export const mat = (color: string, o?: THREE.MeshStandardMaterialParameters) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });

export const CAR_COLORS = [
  "#b8232f",
  "#1f3f7a",
  "#2b2f33",
  "#d8d9dd",
  "#5c6f52",
  "#8a8d92",
  "#c9761f",
];

export const CAR_M = {
  body: CAR_COLORS.map((c) => mat(c, { roughness: 0.35, metalness: 0.55 })),
  glass: mat("#1b2a33", { roughness: 0.08, metalness: 0.85, transparent: true, opacity: 0.85 }),
  tire: mat("#161719", { roughness: 0.95 }),
  rim: mat("#c8ccd0", { roughness: 0.35, metalness: 0.8 }),
  light: mat("#fff4d0", { emissive: "#ffe9a8", emissiveIntensity: 0.7, roughness: 0.3 }),
  tail: mat("#7a1414", { emissive: "#c1272d", emissiveIntensity: 0.4, roughness: 0.3 }),
  trim: mat("#2c2f33", { roughness: 0.6, metalness: 0.3 }),
};

export const PROP_M = {
  pole: mat("#3c4148", { roughness: 0.5, metalness: 0.45 }),
  lampHead: mat("#dfe4e8", { roughness: 0.35, metalness: 0.4 }),
  bulb: mat("#fff6d8", { emissive: "#ffe9a0", emissiveIntensity: 1.1, roughness: 0.2 }),
  signGreen: mat("#1f6f43", { roughness: 0.6 }),
  signWhite: mat("#f4f6f7", { roughness: 0.6 }),
  signRed: mat("#b3202c", { roughness: 0.6 }),
  signYellow: mat("#e8b423", { roughness: 0.6 }),
  paint: mat("#eef0ee", { roughness: 0.9 }),
  curb: mat("#c3c0b8", { roughness: 1 }),
  bench: mat("#8a5f38", { roughness: 0.9 }),
  metal: mat("#6e7479", { roughness: 0.45, metalness: 0.6 }),
  shadow: new THREE.MeshBasicMaterial({
    color: "#20301d",
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  }),
};

export function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
