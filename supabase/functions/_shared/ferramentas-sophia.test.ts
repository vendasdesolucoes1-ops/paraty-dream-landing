// Rodar: node --test "supabase/functions/_shared/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blocoFerramentas,
  ferramentasDoNivel,
  horariosLivres,
  nivelAutonomia,
  patchDoLead,
  permite,
  resumirLotes,
} from "./ferramentas-sophia.ts";
import { JANELAS_VISITA_PADRAO } from "./janela-visita.ts";

const nomes = (n: Parameters<typeof ferramentasDoNivel>[0]) =>
  ferramentasDoNivel(n).map((f) => f.function.name);

test("nível: inválido vira o padrão (agendar) e a ordem dos níveis vale", () => {
  assert.equal(nivelAutonomia("xyz"), "agendar");
  assert.equal(nivelAutonomia(null), "agendar");
  assert.ok(permite("agendar", "qualificar"));
  assert.ok(!permite("responder", "qualificar"));
});

test("ferramentas por nível", () => {
  assert.deepEqual(nomes("responder"), ["consultar_lotes", "buscar_informacao"]);
  assert.deepEqual(nomes("qualificar"), [
    "consultar_lotes",
    "buscar_informacao",
    "registrar_dados_lead",
  ]);
  assert.deepEqual(nomes("agendar"), [
    "consultar_lotes",
    "buscar_informacao",
    "registrar_dados_lead",
    "ver_horarios_visita",
  ]);
  assert.match(blocoFerramentas("responder"), /só conversa/);
  assert.doesNotMatch(blocoFerramentas("responder"), /registrar_dados_lead/);
  assert.match(blocoFerramentas("agendar"), /ver_horarios_visita/);
});

test("lotes: agrupa, filtra e não expõe número de lote", () => {
  const lotes = [
    { quadra: "3", metragem: 360, tipo: "residencial" },
    { quadra: "1", metragem: 360, tipo: "residencial" },
    { quadra: "2", metragem: 250, tipo: "residencial" },
    { quadra: "2", metragem: 600, tipo: "comercial" },
  ];
  const todos = resumirLotes(lotes);
  assert.equal(todos.length, 3);
  assert.deepEqual(todos[1], {
    metragem_m2: 360,
    tipo: "residencial",
    disponiveis: 2,
    quadras: ["1", "3"],
  });
  assert.equal(resumirLotes(lotes, { metragem_min: 300, metragem_max: 400 }).length, 1);
  assert.equal(resumirLotes(lotes, { quadra: "2" }).length, 2);
  assert.deepEqual(resumirLotes([], {}), []);
});

test("horários livres: dentro da janela, com antecedência e sem conflito", () => {
  // Quarta, 14/10/2026, 10h em Paraty.
  const agora = new Date("2026-10-14T10:00:00-03:00");
  const livres = horariosLivres(agora, JANELAS_VISITA_PADRAO, []);
  assert.ok(livres.length > 0);
  assert.equal(livres[0].data, "2026-10-14");
  assert.ok(!livres[0].horarios.includes("10:00"), "nada antes de 2 h de antecedência");
  assert.ok(livres[0].horarios.includes("12:00"));
  assert.ok(
    livres.every((d) => d.dia_semana !== "domingo"),
    "domingo fora da janela padrão",
  );
  const ocupado = [new Date("2026-10-15T09:00:00-03:00")];
  const quinta = horariosLivres(agora, JANELAS_VISITA_PADRAO, ocupado, { data: "2026-10-15" });
  assert.equal(quinta.length, 1);
  assert.ok(!quinta[0].horarios.includes("09:00"), "horário ocupado sai");
});

test("registro: só o que veio, sem trocar nome real por apelido", () => {
  assert.deepEqual(
    patchDoLead(
      {
        nome: "Mari",
        cidade: " Angra ",
        objetivo: "investimento",
        metragem_interesse: null,
        canal_origem: null,
      },
      { nome: "Mariana Alves", telefone: "5524999990000" },
    ),
    { cidade: "Angra", objetivo: "investimento" },
  );
  assert.deepEqual(patchDoLead({ nome: "Carlos" }, { nome: "Lead de Teste (painel)" }), {
    nome: "Carlos",
  });
  assert.deepEqual(
    patchDoLead({ nome: "Ana" }, { nome: "5524999990000", telefone: "5524999990000" }),
    {
      nome: "Ana",
    },
  );
  assert.deepEqual(patchDoLead({ objetivo: "outro" as never }, { nome: "X" }), {});
});
