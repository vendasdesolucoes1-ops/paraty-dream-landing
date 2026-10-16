// Tira prints de instantes do vídeo para conferência: node quadros.mjs 10 45 90 ...
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
const aqui = dirname(fileURLToPath(import.meta.url));
let pw; try { pw = createRequire(import.meta.url)("playwright"); } catch { pw = createRequire(`${execSync("npm root -g").toString().trim()}/`)("playwright"); }
const tempos = existsSync(`${aqui}/saida/tempos.json`) ? JSON.parse(readFileSync(`${aqui}/saida/tempos.json`, "utf8")) : null;
const nav = await pw.chromium.launch();
const pg = await nav.newPage({ viewport: { width: 1920, height: 1080 } });
if (tempos) await pg.addInitScript((t) => (window.TEMPOS = t), tempos);
await pg.goto(`file://${aqui}/cenas.html?legendas`);
await pg.evaluate(() => document.fonts.ready);
mkdirSync(`${aqui}/saida/quadros`, { recursive: true });
for (const s of process.argv.slice(2)) {
  await pg.evaluate((t) => window.render(t), Number(s) * 1000);
  await pg.screenshot({ path: `${aqui}/saida/quadros/t${s}.png`, scale: "css" });
}
await nav.close();
