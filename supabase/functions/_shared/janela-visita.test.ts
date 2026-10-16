// Rodar: node --test "supabase/functions/_shared/*.test.ts"

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  JANELAS_VISITA_PADRAO,
  avaliarHorarioVisita,
  conflitaComAgenda,
  dentroDaJanela,
  descreverJanelas,
  lerJanelasVisita,
  partesNoFuso,
} from "./janela-visita.ts";

const JANELAS = lerJanelasVisita(
  JSON.stringify({
    dias: [{ dia: 6, inicio: "09:00", fim: "16:00" }],
    duracao_min: 60,
    fuso: "America/Sao_Paulo",
  }),
);

// 2026-10-17 é sábado. -03:00 = horário de Paraty.
const SABADO_10H = new Date("2026-10-17T10:00:00-03:00");

test("lê a configuração e descarta entradas inválidas", () => {
  const j = lerJanelasVisita(
    JSON.stringify({
      dias: [
        { dia: 6, inicio: "09:00", fim: "16:00" },
        { dia: 9, inicio: "09:00", fim: "16:00" },
        { dia: 1, inicio: "18:00", fim: "08:00" },
        { dia: 2, inicio: "25:00", fim: "26:00" },
      ],
      duracao_min: 45,
      fuso: "Fuso/Inexistente",
    }),
  );
  assert.deepEqual(j.dias, [{ dia: 6, inicio: "09:00", fim: "16:00" }]);
  assert.equal(j.duracao_min, 45);
  assert.equal(j.fuso, "America/Sao_Paulo");
});

test("JSON quebrado ou ausente cai no padrão", () => {
  assert.deepEqual(lerJanelasVisita("{não é json"), JANELAS_VISITA_PADRAO);
  assert.deepEqual(lerJanelasVisita(null), JANELAS_VISITA_PADRAO);
  assert.deepEqual(lerJanelasVisita(JSON.stringify({ duracao_min: 30 })), JANELAS_VISITA_PADRAO);
});

test("duração fora do razoável volta ao padrão", () => {
  const j = lerJanelasVisita(JSON.stringify({ dias: [], duracao_min: 0 }));
  assert.equal(j.duracao_min, JANELAS_VISITA_PADRAO.duracao_min);
  assert.deepEqual(j.dias, []);
});

test("descreve as janelas em texto para o prompt", () => {
  assert.equal(descreverJanelas(JANELAS), "sábado das 09:00 às 16:00");
  assert.equal(descreverJanelas({ ...JANELAS, dias: [] }), "nenhum horário fixo cadastrado");
});

test("dia e hora são lidos no fuso de Paraty, não em UTC", () => {
  // 01:30 UTC de domingo = 22:30 de sábado em São Paulo.
  assert.deepEqual(partesNoFuso(new Date("2026-10-18T01:30:00Z"), "America/Sao_Paulo"), {
    dia: 6,
    minutos: 22 * 60 + 30,
  });
});

test("sábado às 10h está dentro da janela", () => {
  assert.equal(dentroDaJanela(SABADO_10H, JANELAS), true);
});

test("a visita inteira precisa caber: 15h30 com 60 min passa do fim às 16h", () => {
  assert.equal(dentroDaJanela(new Date("2026-10-17T15:00:00-03:00"), JANELAS), true);
  assert.equal(dentroDaJanela(new Date("2026-10-17T15:30:00-03:00"), JANELAS), false);
  assert.equal(dentroDaJanela(new Date("2026-10-17T08:59:00-03:00"), JANELAS), false);
});

test("dia sem janela está fora", () => {
  // 2026-10-18 é domingo.
  assert.equal(dentroDaJanela(new Date("2026-10-18T10:00:00-03:00"), JANELAS), false);
});

test("conflito de agenda: sobreposição dentro da duração", () => {
  const ocupada = [new Date("2026-10-17T10:30:00-03:00")];
  assert.equal(conflitaComAgenda(SABADO_10H, ocupada, 60), true);
  // Encostadas não conflitam.
  assert.equal(conflitaComAgenda(SABADO_10H, [new Date("2026-10-17T11:00:00-03:00")], 60), false);
  assert.equal(conflitaComAgenda(SABADO_10H, [], 60), false);
});

test("pedido de visita fora da janela NÃO é confirmado automaticamente", () => {
  const domingo20h = new Date("2026-10-18T20:00:00-03:00");
  assert.equal(avaliarHorarioVisita(domingo20h, JANELAS, []), "fora_da_janela");
  const sabado19h = new Date("2026-10-17T19:00:00-03:00");
  assert.equal(avaliarHorarioVisita(sabado19h, JANELAS, []), "fora_da_janela");
});

test("horário com o vendedor ocupado fica a confirmar", () => {
  assert.equal(
    avaliarHorarioVisita(SABADO_10H, JANELAS, [new Date("2026-10-17T09:30:00-03:00")]),
    "conflito_agenda",
  );
});

test("dentro da janela e com agenda livre segue confirmado como sempre", () => {
  assert.equal(avaliarHorarioVisita(SABADO_10H, JANELAS, []), null);
});

test("sem nenhuma janela cadastrada, nada é confirmado sozinho", () => {
  const vazia = lerJanelasVisita(JSON.stringify({ dias: [] }));
  assert.equal(avaliarHorarioVisita(SABADO_10H, vazia, []), "fora_da_janela");
});
