// Dublês compartilhados pelos testes da integração Meta (não é um teste).
import type { Armazem, Linha, ResultadoExecucao } from "./meta-armazem.ts";
import { deduplicar } from "./meta-armazem.ts";

export function armazemEmMemoria() {
  const tabelas = new Map<string, Map<string, Linha>>();
  const estados = new Map<string, Record<string, unknown>>();
  const execucoes: { id: string; job: string; resultado?: ResultadoExecucao }[] = [];
  const upserts: { tabela: string; linhas: number }[] = [];
  const alertas: string[] = [];
  const armazem: Armazem = {
    async upsert(tabela, linhas, conflito) {
      const colunas = conflito.split(",").map((c) => c.trim());
      const chave = (l: Linha) => colunas.map((c) => String(l[c])).join("|");
      const t = tabelas.get(tabela) ?? new Map<string, Linha>();
      tabelas.set(tabela, t);
      for (const l of deduplicar(linhas, conflito)) t.set(chave(l), { ...(t.get(chave(l)) ?? {}), ...l });
      upserts.push({ tabela, linhas: linhas.length });
      return linhas.length;
    },
    async iniciarExecucao(job) {
      const id = `exec-${execucoes.length + 1}`;
      execucoes.push({ id, job });
      return id;
    },
    async finalizarExecucao(id, resultado) {
      execucoes.find((e) => e.id === id)!.resultado = resultado;
    },
    async execucaoRecente(job) {
      return execucoes.some((e) => e.job === job && e.resultado?.status === "sucesso");
    },
    async alertarTokenInvalido(detalhe) {
      alertas.push(detalhe);
    },
    async lerEstado(chave) {
      const v = estados.get(chave);
      return v ? structuredClone(v) : null;
    },
    async salvarEstado(chave, valor) {
      estados.set(chave, structuredClone(valor));
    },
  };
  return { armazem, tabelas, estados, execucoes, upserts, alertas };
}

export const contagens = (tabelas: Map<string, Map<string, Linha>>) =>
  Object.fromEntries([...tabelas].map(([t, m]) => [t, m.size]));
