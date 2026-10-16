// Rodar: node --test "supabase/functions/_shared/*.test.ts"
//
// Cada campo de estilo do painel do agente precisa mudar o prompt (issue #61).

import { test } from "node:test";
import assert from "node:assert/strict";
import { ESTILO_PADRAO, TONS_DE_VOZ, blocoEstiloAgente } from "./estilo-agente.ts";

test("valores padrão não mudam o prompt", () => {
  assert.equal(blocoEstiloAgente(ESTILO_PADRAO), "");
  assert.equal(blocoEstiloAgente(null), "");
  assert.equal(blocoEstiloAgente({}), "");
});

test("tom_voz: cada tom fora do padrão gera instrução própria", () => {
  const blocos = new Set<string>();
  for (const tom of TONS_DE_VOZ) {
    if (tom === ESTILO_PADRAO.tom_voz) continue;
    const bloco = blocoEstiloAgente({ ...ESTILO_PADRAO, tom_voz: tom });
    assert.match(bloco, /PREFERÊNCIAS DE ESTILO/);
    assert.match(bloco, /Tom de voz:/);
    blocos.add(bloco);
  }
  assert.equal(blocos.size, TONS_DE_VOZ.length - 1, "tons diferentes, instruções diferentes");
  assert.match(blocoEstiloAgente({ tom_voz: "formal" }), /formal/);
  assert.match(blocoEstiloAgente({ tom_voz: "informal" }), /informal/);
  assert.match(blocoEstiloAgente({ tom_voz: "amigavel" }), /amigável/);
});

test("tom_voz inválido é tratado como o padrão", () => {
  assert.equal(blocoEstiloAgente({ tom_voz: "sarcastico" }), "");
  assert.equal(blocoEstiloAgente({ tom_voz: null }), "");
});

test("usar_emojis: liberar acrescenta a exceção à regra de nenhum emoji", () => {
  const bloco = blocoEstiloAgente({ ...ESTILO_PADRAO, usar_emojis: true });
  assert.match(bloco, /Emojis: a equipe liberou/);
  assert.match(bloco, /NENHUM emoji/);
  assert.equal(blocoEstiloAgente({ ...ESTILO_PADRAO, usar_emojis: false }), "");
});

test("ser_breve: desligar pede respostas mais completas, mantendo o ||", () => {
  const bloco = blocoEstiloAgente({ ...ESTILO_PADRAO, ser_breve: false });
  assert.match(bloco, /respostas mais completas/);
  assert.match(bloco, /\|\|/);
  assert.equal(blocoEstiloAgente({ ...ESTILO_PADRAO, ser_breve: true }), "");
});

test("campos combinados: uma linha por preferência, um cabeçalho só", () => {
  const bloco = blocoEstiloAgente({ tom_voz: "informal", usar_emojis: true, ser_breve: false });
  assert.equal(bloco.match(/PREFERÊNCIAS DE ESTILO/g)?.length, 1);
  assert.equal(bloco.split("\n").filter((l) => l.startsWith("- ")).length, 3);
});

test("temperatura: nulo/inválido usa o padrão; fora da faixa é limitada", async () => {
  const { temperaturaAgente, TEMPERATURA_PADRAO } = await import("./estilo-agente.ts");
  assert.equal(temperaturaAgente(null), TEMPERATURA_PADRAO);
  assert.equal(temperaturaAgente("abc"), TEMPERATURA_PADRAO);
  assert.equal(temperaturaAgente("0.70"), 0.7, "numeric do Postgres chega como texto");
  assert.equal(temperaturaAgente(0.2), 0.2);
  assert.equal(temperaturaAgente(5), 1);
  assert.equal(temperaturaAgente(-1), 0);
});

test("instruções da equipe: vazio não muda o prompt; texto vem com as regras fixas acima dele", async () => {
  const { blocoInstrucoesEquipe, LIMITE_INSTRUCOES_EXTRAS } = await import("./estilo-agente.ts");
  assert.equal(blocoInstrucoesEquipe(null), "");
  assert.equal(blocoInstrucoesEquipe("   "), "");
  const bloco = blocoInstrucoesEquipe("Sempre mencione a praia do Jabaquara.");
  assert.match(bloco, /INSTRUÇÕES DA EQUIPE/);
  assert.match(bloco, /nunca informar preço/);
  assert.ok(bloco.endsWith("Sempre mencione a praia do Jabaquara."));
  const longo = blocoInstrucoesEquipe("x".repeat(LIMITE_INSTRUCOES_EXTRAS + 50));
  assert.ok(!longo.includes("x".repeat(LIMITE_INSTRUCOES_EXTRAS + 1)), "texto cortado no limite");
});

test("mensagem de transferência: personalizada em bolhas, padrão quando vazia", async () => {
  const { mensagemTransferencia, MENSAGEM_TRANSFERENCIA_PADRAO } =
    await import("./estilo-agente.ts");
  assert.deepEqual(mensagemTransferencia("Já te passo pro consultor! || Um minutinho"), [
    "Já te passo pro consultor!",
    "Um minutinho",
  ]);
  assert.deepEqual(
    mensagemTransferencia(" || "),
    MENSAGEM_TRANSFERENCIA_PADRAO.split("||").map((m) => m.trim()),
  );
  assert.equal(mensagemTransferencia(null).length, 2);
});
