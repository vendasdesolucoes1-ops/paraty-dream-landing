// Rodar: node --test src/lib/cadencias-formato.test.ts   (Node 22.18+, que lê TypeScript)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  descreverDeslocamento,
  diaEmSaoPaulo,
  formatIntervaloPg,
  limiteDoDia,
  parseIntervalo,
  partesDoTemplate,
  previewTemplate,
  rotuloMotivo,
  variaveisDesconhecidas,
} from "./cadencias-formato.ts";

test("parseIntervalo lê o formato do PostgREST", () => {
  assert.deepEqual(parseIntervalo("1 day"), { dias: 1, horas: 0, minutos: 0 });
  assert.deepEqual(parseIntervalo("-1 days"), { dias: -1, horas: 0, minutos: 0 });
  assert.deepEqual(parseIntervalo("3 days 02:00:00"), { dias: 3, horas: 2, minutos: 0 });
  assert.deepEqual(parseIntervalo("-1 days +02:00:00"), { dias: -1, horas: 2, minutos: 0 });
  assert.deepEqual(parseIntervalo("-02:30:00"), { dias: 0, horas: -2, minutos: -30 });
  assert.deepEqual(parseIntervalo("00:00:00"), { dias: 0, horas: 0, minutos: 0 });
  assert.deepEqual(parseIntervalo("1 mon 2 days"), { dias: 32, horas: 0, minutos: 0 });
  assert.deepEqual(parseIntervalo(null), { dias: 0, horas: 0, minutos: 0 });
});

test("parseIntervalo lê o que formatIntervaloPg grava (ida e volta)", () => {
  for (const d of [
    { dias: 1, horas: 2, minutos: 0 },
    { dias: -1, horas: 0, minutos: 0 },
    { dias: 0, horas: 0, minutos: 0 },
    { dias: 2, horas: -3, minutos: 15 },
  ]) {
    assert.deepEqual(parseIntervalo(formatIntervaloPg(d)), d);
  }
});

test("formatIntervaloPg gera texto aceito pelo Postgres", () => {
  assert.equal(formatIntervaloPg({ dias: 1, horas: 2, minutos: 0 }), "1 day 2 hours");
  assert.equal(formatIntervaloPg({ dias: -1, horas: 0, minutos: 0 }), "-1 day");
  assert.equal(formatIntervaloPg({ dias: 0, horas: 0, minutos: 0 }), "0");
  assert.equal(formatIntervaloPg({ dias: 3, horas: 0, minutos: 30 }), "3 days 30 minutes");
});

test("descreverDeslocamento resume a etapa em português", () => {
  assert.equal(
    descreverDeslocamento({ dias: 1, horas: 0, minutos: 0 }, "anterior"),
    "1 dia depois do envio anterior",
  );
  assert.equal(
    descreverDeslocamento({ dias: -1, horas: 0, minutos: 0 }, "visita", "10:00:00"),
    "1 dia antes da visita, às 10:00",
  );
  assert.equal(
    descreverDeslocamento({ dias: 0, horas: 0, minutos: 0 }, "visita", "09:00"),
    "no dia da visita, às 09:00",
  );
  assert.equal(
    descreverDeslocamento({ dias: 0, horas: 0, minutos: 0 }, "inscricao"),
    "no momento da inscrição",
  );
  assert.equal(
    descreverDeslocamento({ dias: 2, horas: 3, minutos: 0 }, "inscricao"),
    "2 dias e 3 h depois da inscrição",
  );
  // "-1 days +02:00:00" = 22 h antes
  assert.equal(
    descreverDeslocamento({ dias: -1, horas: 2, minutos: 0 }, "visita"),
    "22 h antes da visita",
  );
});

test("partesDoTemplate separa por || e descarta partes vazias", () => {
  assert.deepEqual(partesDoTemplate("Oi! || Tudo bem?||  "), ["Oi!", "Tudo bem?"]);
  assert.deepEqual(partesDoTemplate(""), []);
});

test("previewTemplate troca as variáveis como o banco", () => {
  assert.deepEqual(
    previewTemplate("Oi {{primeiro_nome}}!||Visita {{data_visita}} às {{hora_visita}}"),
    ["Oi Maria!", "Visita 24/10 às 15h"],
  );
  assert.deepEqual(previewTemplate("Oi {{primeiro_nome}}, tudo bem?", { primeiro_nome: "" }), [
    "Oi, tudo bem?",
  ]);
});

test("variaveisDesconhecidas aponta variável que o banco não troca", () => {
  assert.deepEqual(variaveisDesconhecidas("Oi {{nome}}, {{primeiro_nome}} {{ telefone }}"), [
    "nome",
    "telefone",
  ]);
  assert.deepEqual(variaveisDesconhecidas("Oi {{primeiro_nome}}"), []);
});

test("diaEmSaoPaulo usa o fuso de Brasília", () => {
  // 02:00 UTC ainda é o dia anterior em Brasília (UTC-3).
  assert.equal(diaEmSaoPaulo(new Date("2026-10-16T02:00:00Z")), "2026-10-15");
  assert.equal(diaEmSaoPaulo(new Date("2026-10-16T15:00:00Z")), "2026-10-16");
});

test("limiteDoDia aplica a rampa de aquecimento como o SQL", () => {
  const base = {
    limiteInstancia: null,
    limiteRegra: 150,
    aquecimentoDias: 21,
    aquecimentoInicial: 20,
  };
  // Sem início de aquecimento: limite cheio.
  assert.equal(limiteDoDia({ ...base, aquecimentoInicio: null, hoje: "2026-10-16" }), 150);
  // Dia 0 da rampa: o inicial.
  assert.equal(limiteDoDia({ ...base, aquecimentoInicio: "2026-10-16", hoje: "2026-10-16" }), 20);
  // Dia 10: 20 + trunc(130 * 10 / 21) = 20 + 61 = 81.
  assert.equal(limiteDoDia({ ...base, aquecimentoInicio: "2026-10-06", hoje: "2026-10-16" }), 81);
  // Depois da rampa: limite cheio; limite próprio da instância prevalece.
  assert.equal(
    limiteDoDia({
      ...base,
      limiteInstancia: 90,
      aquecimentoInicio: "2026-01-01",
      hoje: "2026-10-16",
    }),
    90,
  );
  // Rampa desligada.
  assert.equal(
    limiteDoDia({
      ...base,
      aquecimentoDias: 0,
      aquecimentoInicio: "2026-10-16",
      hoje: "2026-10-16",
    }),
    150,
  );
});

test("rotuloMotivo traduz o motivo técnico e deixa passar texto livre", () => {
  assert.equal(rotuloMotivo("limite_diario"), "Limite diário da instância");
  assert.equal(rotuloMotivo("campanha cancelada"), "Campanha cancelada");
  assert.equal(rotuloMotivo(null), "—");
});
