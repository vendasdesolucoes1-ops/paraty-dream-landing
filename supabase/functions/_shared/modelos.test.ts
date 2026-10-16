// Rodar: node --test "supabase/functions/_shared/*.test.ts"
//
// Registro central de modelos (issue #61): a escolha de modelo do painel tem
// efeito, e nenhum ID de modelo escapa de modelos.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MODELOS,
  MODELOS_SOPHIA_PERMITIDOS,
  MODELO_SOPHIA_PADRAO,
  PRECO_POR_MILHAO,
  resolverModeloSophia,
} from "./modelos.ts";

test("modelo do agente: cada valor permitido é usado como está", () => {
  for (const modelo of MODELOS_SOPHIA_PERMITIDOS) {
    assert.equal(resolverModeloSophia(modelo), modelo);
  }
  assert.notEqual(resolverModeloSophia("gpt-4o"), resolverModeloSophia("gpt-4o-mini"));
});

test("modelo do agente fora da lista cai no padrão", () => {
  for (const valor of [null, undefined, "", "gpt-3.5-turbo", " gpt-4o", 42]) {
    assert.equal(resolverModeloSophia(valor), MODELO_SOPHIA_PADRAO);
  }
  assert.equal(MODELOS.sophiaChat.id, MODELO_SOPHIA_PADRAO);
});

test("parâmetros da Sophia e do follow-up", () => {
  assert.equal(MODELOS.sophiaChat.temperatura, 0.4);
  assert.equal(MODELOS.sophiaChat.maxTokens, 1000);
  assert.equal(MODELOS.followUpClassificador.temperatura, 0.2);
  assert.equal(MODELOS.followUpRedator.temperatura, 0.5);
  // Sem OPENAI_FALLBACK_MODEL no ambiente de teste: fallback desligado.
  assert.equal(MODELOS.sophiaFallback.id, "");
});

test("nenhum modelo de produção em versão preview/experimental", () => {
  for (const [uso, cfg] of Object.entries(MODELOS)) {
    assert.doesNotMatch(cfg.id, /preview|exp/i, uso);
  }
});

test("todo modelo OpenAI cobrado por token tem preço na telemetria", () => {
  for (const cfg of [
    ...MODELOS_SOPHIA_PERMITIDOS.map((id) => ({ id })),
    MODELOS.qualificacaoLead,
    MODELOS.extracaoVisita,
    MODELOS.embeddingRag,
  ]) {
    assert.ok(PRECO_POR_MILHAO[cfg.id], cfg.id);
  }
});

// Varredura: um ID de modelo literal fora do registro reabre o problema da
// issue — IDs espalhados e preview em produção sem ninguém perceber.
const PADRAO_ID_MODELO =
  /\b(gpt-[0-9a-z]|gemini-[0-9a-z]|whisper-[0-9]|text-embedding-|claude-[0-9a-z])/i;
const DIR_SHARED = dirname(fileURLToPath(import.meta.url));
const DIR_FUNCOES = dirname(DIR_SHARED);
const PERMITIDOS = new Set(["modelos.ts", "modelos.test.ts"]);

function arquivosTs(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(dir, f));
}

test("nenhum ID de modelo fora de _shared/modelos.ts", () => {
  const achados: string[] = [];
  for (const arquivo of arquivosTs(DIR_FUNCOES)) {
    if (dirname(arquivo) === DIR_SHARED && PERMITIDOS.has(basename(arquivo))) continue;
    readFileSync(arquivo, "utf8")
      .split("\n")
      .forEach((linha, i) => {
        if (PADRAO_ID_MODELO.test(linha)) {
          achados.push(`${relative(DIR_FUNCOES, arquivo)}:${i + 1}: ${linha.trim()}`);
        }
      });
  }
  assert.deepEqual(achados, [], "mova o ID para supabase/functions/_shared/modelos.ts");
});
