// Extrai as deixas de som (saida/cues.json) e quadros de conferência (saida/quadros/).
// Uso: node docs/video/curto/inspecionar.mjs [--quadros 4,10,20]
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
let playwright;
try {
  playwright = createRequire(import.meta.url)("playwright");
} catch {
  playwright = createRequire(`${execSync("npm root -g").toString().trim()}/`)("playwright");
}
const tempos = JSON.parse(readFileSync(`${aqui}/saida/tempos.json`, "utf8"));
const navegador = await playwright.chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1920, height: 1080 } });
pagina.on("pageerror", (e) => console.error("ERRO NA PÁGINA:", e.message));
await pagina.addInitScript((t) => (window.TEMPOS = t), tempos);
await pagina.goto(`file://${aqui}/cenas.html`);
await pagina.evaluate(() => document.fonts.ready);

const cues = await pagina.evaluate(() => window.cues());
writeFileSync(`${aqui}/saida/cues.json`, JSON.stringify(cues, null, 1));
console.log(`${cues.length} deixas de som`);

const i = process.argv.indexOf("--quadros");
if (i > -1) {
  mkdirSync(`${aqui}/saida/quadros`, { recursive: true });
  for (const s of process.argv[i + 1].split(",").map(Number)) {
    await pagina.evaluate((t) => window.render(t), s * 1000);
    await pagina.screenshot({ path: `${aqui}/saida/quadros/t${String(s).padStart(5, "0")}.jpg`, quality: 80 });
  }
}
await navegador.close();
