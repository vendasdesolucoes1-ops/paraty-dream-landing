// Renderiza docs/video/cenas.html em MP4 (1920×1080), quadro a quadro.
//
// Uso:
//   node docs/video/render.mjs [--fps 30] [--saida docs/video/saida/video-mudo.mp4]
//                              [--de 0 --ate 20] [--legendas]
// Lê docs/video/saida/tempos.json se existir (gerado por narracao.mjs), senão
// usa as durações padrão das cenas. O áudio entra depois, em montar.sh.
import { createRequire } from "node:module";
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 ? process.argv[i + 1] : padrao;
};
const fps = Number(arg("fps", 30));
const saida = resolve(arg("saida", `${aqui}/saida/video-mudo.mp4`));
const comLegendas = process.argv.includes("--legendas");
mkdirSync(dirname(saida), { recursive: true });

// Playwright do projeto ou o global do ambiente.
let playwright;
try {
  playwright = createRequire(import.meta.url)("playwright");
} catch {
  const raiz = execSync("npm root -g").toString().trim();
  playwright = createRequire(`${raiz}/`)("playwright");
}

const tempos = existsSync(`${aqui}/saida/tempos.json`)
  ? JSON.parse(readFileSync(`${aqui}/saida/tempos.json`, "utf8"))
  : null;

const navegador = await playwright.chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1920, height: 1080 } });
if (tempos) await pagina.addInitScript((t) => (window.TEMPOS = t), tempos);
await pagina.goto(`file://${aqui}/cenas.html${comLegendas ? "?legendas" : ""}`);
await pagina.evaluate(() => document.fonts.ready);

const total = await pagina.evaluate(() => window.duracaoTotal());
const de = Number(arg("de", 0)) * 1000;
const ate = Math.min(Number(arg("ate", total / 1000)) * 1000, total);
const quadros = Math.ceil(((ate - de) / 1000) * fps);

const ffmpeg = spawn("ffmpeg", [
  "-y", "-loglevel", "error",
  "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
  "-movflags", "+faststart", saida,
], { stdio: ["pipe", "inherit", "inherit"] });

const inicio = Date.now();
for (let q = 0; q < quadros; q++) {
  const ms = de + (q * 1000) / fps;
  await pagina.evaluate((t) => window.render(t), ms);
  const jpg = await pagina.screenshot({ type: "jpeg", quality: 92 });
  if (!ffmpeg.stdin.write(jpg)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
  if (q % (fps * 10) === 0) {
    process.stdout.write(`\r${Math.round((q / quadros) * 100)}% (${(ms / 1000).toFixed(0)} s)   `);
  }
}
ffmpeg.stdin.end();
await new Promise((r) => ffmpeg.on("close", r));
await navegador.close();
console.log(`\n${saida}: ${quadros} quadros em ${((Date.now() - inicio) / 1000).toFixed(0)} s`);
