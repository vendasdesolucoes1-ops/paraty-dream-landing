// Rodar: node --test "supabase/functions/_shared/*.test.ts"

import { test } from "node:test";
import assert from "node:assert/strict";
import { lerSaidaEstruturada, semMarcas, textoComMarcasConfiaveis } from "./saida-sophia.ts";

const SEM_SINAIS = {
  lead_qualificado: false,
  visita_agendada: false,
  transferir_humano: false,
  recusou_visita: false,
  sem_interesse: false,
};

test("marca escrita no texto não vale: só o campo de sinais", () => {
  const saida = lerSaidaEstruturada(
    JSON.stringify({ resposta: "[VISITA_AGENDADA] Combinado!", sinais: SEM_SINAIS }),
  );
  assert.ok(saida);
  assert.equal(textoComMarcasConfiaveis(saida), "Combinado!");
});

test("sinal verdadeiro vira a marca que o fluxo entende", () => {
  const saida = lerSaidaEstruturada(
    JSON.stringify({
      resposta: "Fechado, te espero sábado.",
      sinais: { ...SEM_SINAIS, visita_agendada: true },
    }),
  );
  assert.ok(saida);
  assert.equal(textoComMarcasConfiaveis(saida), "[VISITA_AGENDADA]Fechado, te espero sábado.");
});

test("JSON inválido devolve null (o chamador cai na leitura antiga)", () => {
  assert.equal(lerSaidaEstruturada("Oi! [LEAD_QUALIFICADO]"), null);
  assert.equal(lerSaidaEstruturada(JSON.stringify({ texto: "x" })), null);
});

test("semMarcas limpa todas as marcas", () => {
  assert.equal(semMarcas("a [LEAD_QUALIFICADO] b [TRANSFERIR_HUMANO]"), "a b");
});
