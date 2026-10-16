// Rodar: node --test src/lib/kanban-leads.test.ts   (Node 22.18+, que lê TypeScript)
//
// Como um evento realtime de `leads` mexe nas colunas já carregadas do quadro
// e nas contagens por etapa, sem recarregar nada.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Lead } from "./types.ts";
import {
  aplicarLeadNaColuna,
  ajustarContagens,
  etapaContada,
  filtrosDeBusca,
  leadCasaComFiltros,
  leadsDaColuna,
  type ColunaKanban,
  type FiltrosKanban,
} from "./kanban-leads.ts";

const TODOS: FiltrosKanban = { vendedorId: null, mostrarTestes: true, origem: null, termo: "" };

function lead(id: string, dia: number, extra: Partial<Lead> = {}): Lead {
  return {
    id,
    nome: `Lead ${id}`,
    email: null,
    telefone: "5524999990000",
    cidade: "Paraty",
    metragem_interesse: null,
    tipo_lote_interesse: null,
    origem: "lp",
    status_crm: "novo",
    lote_interesse_id: null,
    vendedor_id: null,
    score: 0,
    created_at: `2026-10-${String(dia).padStart(2, "0")}T12:00:00+00:00`,
    updated_at: `2026-10-${String(dia).padStart(2, "0")}T12:00:00+00:00`,
    deletado_em: null,
    is_teste: false,
    ...extra,
  };
}

function coluna(paginas: Lead[][], temMais = false): ColunaKanban {
  return {
    pages: paginas.map((leads, i) => ({ leads, temMais: i < paginas.length - 1 || temMais })),
    pageParams: paginas.map((_, i) => i * 50),
  };
}

const ids = (c: ColunaKanban) => leadsDaColuna(c).map((l) => l.id);

test("INSERT entra na posição pela data, mais recente primeiro", () => {
  const c = coluna([[lead("c", 9), lead("a", 5)]]);
  const r = aplicarLeadNaColuna(c, "novo", TODOS, "b", lead("b", 7));
  assert.deepEqual(ids(r), ["c", "b", "a"]);
});

test("lead mais antigo que o carregado só entra se não houver mais páginas", () => {
  const comMais = coluna([[lead("c", 9)]], true);
  assert.equal(aplicarLeadNaColuna(comMais, "novo", TODOS, "x", lead("x", 1)), comMais);
  const semMais = coluna([[lead("c", 9)]]);
  assert.deepEqual(ids(aplicarLeadNaColuna(semMais, "novo", TODOS, "x", lead("x", 1))), ["c", "x"]);
});

test("UPDATE de etapa sai de uma coluna e entra na outra", () => {
  const novos = coluna([[lead("a", 5), lead("b", 4)]]);
  const qualificados = coluna([[lead("q", 6)]]);
  const movido = lead("a", 5, { status_crm: "qualificado" });
  assert.deepEqual(ids(aplicarLeadNaColuna(novos, "novo", TODOS, "a", movido)), ["b"]);
  assert.deepEqual(ids(aplicarLeadNaColuna(qualificados, "qualificado", TODOS, "a", movido)), [
    "q",
    "a",
  ]);
});

test("UPDATE na mesma etapa troca o registro no lugar", () => {
  const c = coluna([[lead("a", 5), lead("b", 4)]]);
  const r = aplicarLeadNaColuna(c, "novo", TODOS, "b", lead("b", 4, { nome: "Maria" }));
  assert.equal(leadsDaColuna(r)[1].nome, "Maria");
});

test("DELETE e exclusão lógica tiram da coluna; o que não muda mantém a referência", () => {
  const c = coluna([[lead("a", 5), lead("b", 4)]]);
  assert.deepEqual(ids(aplicarLeadNaColuna(c, "novo", TODOS, "a", null)), ["b"]);
  const apagado = lead("b", 4, { deletado_em: "2026-10-10T00:00:00+00:00" });
  assert.deepEqual(ids(aplicarLeadNaColuna(c, "novo", TODOS, "b", apagado)), ["a"]);
  assert.equal(aplicarLeadNaColuna(c, "novo", TODOS, "z", null), c);
});

test("filtros do quadro valem para o que chega pelo realtime", () => {
  const f: FiltrosKanban = { vendedorId: "v1", mostrarTestes: false, origem: "lp", termo: "pa" };
  assert.equal(leadCasaComFiltros(lead("a", 1, { vendedor_id: "v1" }), f), true);
  assert.equal(leadCasaComFiltros(lead("a", 1, { vendedor_id: "v2" }), f), false);
  assert.equal(leadCasaComFiltros(lead("a", 1, { vendedor_id: "v1", is_teste: true }), f), false);
  assert.equal(
    leadCasaComFiltros(lead("a", 1, { vendedor_id: "v1", origem: "whatsapp" }), f),
    false,
  );
  assert.equal(
    leadCasaComFiltros(lead("a", 1, { vendedor_id: "v1", cidade: "Ubatuba" }), f),
    false,
  );
  const porTelefone = { ...TODOS, termo: "9999" };
  assert.equal(leadCasaComFiltros(lead("a", 1, { cidade: null }), porTelefone), true);
});

test("contagens: move de uma etapa para outra e conta inserção", () => {
  const antes = lead("a", 5);
  const depois = lead("a", 5, { status_crm: "proposta" });
  const c = { novo: 3, proposta: 1 };
  assert.deepEqual(ajustarContagens(c, etapaContada(antes, TODOS), etapaContada(depois, TODOS)), {
    novo: 2,
    proposta: 2,
  });
  assert.deepEqual(ajustarContagens(c, null, "novo"), { novo: 4, proposta: 1 });
  assert.equal(ajustarContagens(c, "novo", "novo"), c);
});

test("busca ignora acento e caixa, no banco e no navegador", () => {
  assert.equal(filtrosDeBusca("São João"), "busca.ilike.%sao joao%");
  const f = { ...TODOS, termo: "joao" };
  assert.equal(leadCasaComFiltros(lead("a", 1, { nome: "João Silva" }), f), true);
  const cidade = { ...TODOS, termo: "PARATÝ" };
  assert.equal(leadCasaComFiltros(lead("a", 1, { cidade: "Paraty" }), cidade), true);
});
