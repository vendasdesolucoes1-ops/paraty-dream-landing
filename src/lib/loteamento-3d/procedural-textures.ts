import * as THREE from "three";
import { rng } from "@/lib/loteamento-3d/three-assets";

/**
 * Texturas geradas em canvas, em runtime — sem nenhum arquivo de imagem no
 * bundle. Mantém o estilo baixo-poli/estilizado da cena (nada fotorreal),
 * só troca "cor sólida chapada" por variação de tom que lê como material de
 * verdade a qualquer distância de câmera.
 */

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function tileTexture(canvas: HTMLCanvasElement, repeat: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** grama: base verde + milhares de traços curtos simulando lâminas */
export function grassTexture(repeat = 90): THREE.CanvasTexture {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  const rand = rng(11);

  ctx.fillStyle = "#6f9b49";
  ctx.fillRect(0, 0, size, size);

  const blades = ["#5f8a3d", "#77a852", "#82b25c", "#688f3f", "#5a7e37"];
  for (let i = 0; i < 2400; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 3 + rand() * 5;
    const angle = rand() * Math.PI * 2;
    ctx.strokeStyle = blades[Math.floor(rand() * blades.length)];
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.55 + rand() * 0.35;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  return tileTexture(canvas, repeat);
}

/** asfalto: cinza escuro com granulado + manchas leves de desgaste */
export function asphaltTexture(repeat = 12): THREE.CanvasTexture {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  const rand = rng(23);

  ctx.fillStyle = "#3a3d42";
  ctx.fillRect(0, 0, size, size);

  // manchas grandes e suaves de desgaste
  for (let i = 0; i < 14; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 18 + rand() * 34;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const shade = rand() < 0.5 ? "rgba(20,22,25,0.25)" : "rgba(70,74,80,0.18)";
    grad.addColorStop(0, shade);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  // granulado fino
  for (let i = 0; i < 3200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const v = rand();
    ctx.fillStyle = v < 0.5 ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.10)";
    ctx.fillRect(x, y, 1, 1);
  }

  return tileTexture(canvas, repeat);
}

/** telha cerâmica: fileiras de meia-cana com sombra entre elas */
export function roofTexture(repeat = 6): THREE.CanvasTexture {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  const rand = rng(37);

  ctx.fillStyle = "#8d4a33";
  ctx.fillRect(0, 0, size, size);

  const rows = 8;
  const rowH = size / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    const tint = 0.85 + rand() * 0.3;
    for (let x = -rowH / 2; x < size + rowH; x += rowH * 0.62) {
      const grad = ctx.createRadialGradient(x, y + rowH * 0.35, 1, x, y + rowH * 0.35, rowH * 0.55);
      grad.addColorStop(0, `rgba(255,220,190,${0.28 * tint})`);
      grad.addColorStop(0.55, `rgba(120,60,40,0)`);
      grad.addColorStop(1, `rgba(40,15,10,${0.35 * tint})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(x, y + rowH * 0.35, rowH * 0.55, rowH * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(30,10,8,${0.22})`;
    ctx.fillRect(0, y + rowH * 0.88, size, rowH * 0.12);
  }

  return tileTexture(canvas, repeat);
}

/** ruído cinza neutro para usar como roughnessMap (quebra o brilho uniforme) */
export function noiseRoughnessTexture(repeat = 20): THREE.CanvasTexture {
  const size = 128;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  const rand = rng(53);

  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(150 + rand() * 90);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  const tex = tileTexture(canvas, repeat);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
