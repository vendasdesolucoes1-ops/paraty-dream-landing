// Divisão da base de conhecimento (markdown) em trechos para busca vetorial.
//
// Puro de propósito: sem fetch, sem Deno.*, sem banco. Roda igual na edge
// function, no Node e no Bun, e por isso tem teste de unidade
// (rag-chunker.test.ts) — é a parte do RAG que mais decide a qualidade da busca.
//
// Regras, na ordem em que importam:
//  1. A unidade natural é a SEÇÃO (## / ###). Um trecho nunca atravessa o
//     título de uma seção, e leva o caminho do título ("5. DIFERENCIAIS > 5.2
//     O empreendimento") — é isso que permite ao modelo e à busca saberem de
//     onde o trecho veio.
//  2. Tabela é indivisível enquanto couber. Quando passa do limite, quebra por
//     linhas REPETINDO o cabeçalho, para cada pedaço continuar legível sozinho
//     (a tabela de objeções vira dois trechos, ambos com "Objeção | Resposta").
//  3. O cabeçalho do documento (título, versão, nota "esta base é injetada no
//     prompt…") é metadado de quem edita, não conhecimento: não vira trecho.
//     Se virasse, a nota "esta base NÃO contém preço" apareceria como
//     resposta a "quanto custa?".

export interface TrechoBruto {
  ordem: number;
  /** Caminho de títulos: "2. ESTRUTURA DO LOTEAMENTO > 2.2 Distribuição por quadra". */
  secao: string;
  conteudo: string;
}

export interface ResultadoChunking {
  /** Nome do documento (subtítulo do cabeçalho). Só informativo: fica em rag_documentos.titulo. */
  titulo: string;
  trechos: TrechoBruto[];
}

/** ~200 tokens em português. Trecho pequeno recupera com precisão. */
export const MAX_CHARS_TRECHO = 800;
/** Sobra menor que isto é colada no trecho anterior da mesma seção. */
const MIN_CHARS_SOBRA = 120;

const RE_TITULO = /^(#{1,3})\s+(.+?)\s*$/;
const RE_REGUA = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const RE_SEPARADOR_TABELA = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** Tira a marcação e o espaço do título: "## **2.** Foo" -> "2. Foo". */
function limparTitulo(texto: string): string {
  return texto.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
}

interface Bloco {
  tabela: boolean;
  linhas: string[];
}

function emBlocos(linhas: string[]): Bloco[] {
  const blocos: Bloco[] = [];
  let atual: Bloco | null = null;

  const fechar = () => {
    if (atual && atual.linhas.length) blocos.push(atual);
    atual = null;
  };

  for (const linha of linhas) {
    if (!linha.trim()) {
      fechar();
      continue;
    }
    const tabela = linha.trim().startsWith("|");
    if (atual && atual.tabela !== tabela) fechar();
    if (!atual) atual = { tabela, linhas: [] };
    atual.linhas.push(linha);
  }
  fechar();
  return blocos;
}

/** Quebra uma frase longa demais em pedaços, preferindo o fim de frase. */
function quebrarLinhaLonga(linha: string, max: number): string[] {
  if (linha.length <= max) return [linha];
  const partes: string[] = [];
  let resto = linha;
  while (resto.length > max) {
    const janela = resto.slice(0, max);
    const corte = Math.max(janela.lastIndexOf(". "), janela.lastIndexOf("; "));
    const ponto = corte > max * 0.4 ? corte + 1 : janela.lastIndexOf(" ");
    const fim = ponto > 0 ? ponto : max;
    partes.push(resto.slice(0, fim).trim());
    resto = resto.slice(fim).trim();
  }
  if (resto) partes.push(resto);
  return partes;
}

function dividirTabela(linhas: string[], max: number): string[] {
  const temSeparador = linhas.length > 1 && RE_SEPARADOR_TABELA.test(linhas[1]);
  const cabecalho = temSeparador ? linhas.slice(0, 2) : [];
  const corpo = temSeparador ? linhas.slice(2) : linhas;
  const baseCabecalho = cabecalho.join("\n");

  const pedacos: string[] = [];
  let grupo: string[] = [];
  const tamanho = (g: string[]) =>
    (baseCabecalho ? baseCabecalho.length + 1 : 0) + g.join("\n").length;

  for (const linha of corpo) {
    if (grupo.length && tamanho([...grupo, linha]) > max) {
      pedacos.push([baseCabecalho, ...grupo].filter(Boolean).join("\n"));
      grupo = [];
    }
    grupo.push(linha);
  }
  if (grupo.length) pedacos.push([baseCabecalho, ...grupo].filter(Boolean).join("\n"));
  return pedacos;
}

function dividirTexto(linhas: string[], max: number): string[] {
  const pedacos: string[] = [];
  let grupo: string[] = [];
  const empurrar = () => {
    if (grupo.length) pedacos.push(grupo.join("\n"));
    grupo = [];
  };

  for (const linha of linhas.flatMap((l) => quebrarLinhaLonga(l, max))) {
    if (grupo.length && grupo.join("\n").length + 1 + linha.length > max) empurrar();
    grupo.push(linha);
  }
  empurrar();
  return pedacos;
}

function empacotar(blocos: Bloco[], max: number): string[] {
  const trechos: string[] = [];
  let atual: string[] = [];
  const tamanho = () => atual.join("\n\n").length;
  const fechar = () => {
    if (atual.length) trechos.push(atual.join("\n\n"));
    atual = [];
  };

  for (const bloco of blocos) {
    const bruto = bloco.linhas.join("\n");
    const partes =
      bruto.length <= max
        ? [bruto]
        : bloco.tabela
          ? dividirTabela(bloco.linhas, max)
          : dividirTexto(bloco.linhas, max);

    for (const parte of partes) {
      if (atual.length && tamanho() + 2 + parte.length > max) fechar();
      atual.push(parte);
    }
  }
  fechar();

  // Sobra minúscula não vira trecho: cola no anterior se ainda couber com folga.
  if (trechos.length > 1) {
    const ultimo = trechos[trechos.length - 1];
    const penultimo = trechos[trechos.length - 2];
    if (ultimo.length < MIN_CHARS_SOBRA && penultimo.length + 2 + ultimo.length <= max * 1.25) {
      trechos.splice(-2, 2, `${penultimo}\n\n${ultimo}`);
    }
  }
  return trechos;
}

interface Secao {
  h2: string;
  h3: string;
  linhas: string[];
}

export function dividirEmTrechos(
  markdown: string,
  maxChars: number = MAX_CHARS_TRECHO,
): ResultadoChunking {
  const linhas = String(markdown ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");

  // Cabeçalho do documento: H1 na primeira linha com conteúdo e uma régua
  // depois dele. Tudo até a régua é metadado.
  let inicio = 0;
  let titulo = "";
  const primeira = linhas.findIndex((l) => l.trim());
  if (primeira >= 0 && /^#\s+/.test(linhas[primeira])) {
    const regua = linhas.findIndex((l, i) => i > primeira && RE_REGUA.test(l));
    if (regua > 0) {
      const titulos = linhas
        .slice(primeira, regua)
        .map((l) => RE_TITULO.exec(l))
        .filter((m): m is RegExpExecArray => m !== null);
      const h2 = titulos.find((m) => m[1].length === 2);
      const h1 = titulos.find((m) => m[1].length === 1);
      titulo = limparTitulo((h2 ?? h1)?.[2] ?? "");
      inicio = regua + 1;
    }
  }

  const secoes: Secao[] = [];
  let atual: Secao = { h2: "", h3: "", linhas: [] };
  const abrir = (h2: string, h3: string) => {
    if (atual.linhas.some((l) => l.trim())) secoes.push(atual);
    atual = { h2, h3, linhas: [] };
  };

  for (const linha of linhas.slice(inicio)) {
    if (RE_REGUA.test(linha)) continue;
    const m = RE_TITULO.exec(linha);
    if (!m) {
      atual.linhas.push(linha);
      continue;
    }
    const nivel = m[1].length;
    const texto = limparTitulo(m[2]);
    if (nivel === 3) abrir(atual.h2, texto);
    else abrir(texto, ""); // # e ## abrem seção de topo
  }
  abrir("", "");

  const trechos: TrechoBruto[] = [];
  for (const secao of secoes) {
    const rotulo = [secao.h2, secao.h3].filter(Boolean).join(" > ") || titulo || "Documento";
    for (const conteudo of empacotar(emBlocos(secao.linhas), maxChars)) {
      const limpo = conteudo.trim();
      if (limpo) trechos.push({ ordem: trechos.length, secao: rotulo, conteudo: limpo });
    }
  }
  return { titulo, trechos };
}

/**
 * O que de fato vai para o modelo de embedding: o conteúdo precedido do
 * caminho da seção. Uma linha "| 150m² | Residencial |" sozinha não diz sobre o
 * que é; com "2.3 Faixas de metragem" na frente, diz.
 *
 * O nome do documento NÃO entra no prefixo, de propósito: sendo igual em todos
 * os trechos, ele os aproxima de qualquer pergunta que o cite — "onde fica o
 * loteamento?" ficava igualmente perto de todos os trechos e o do endereço se
 * perdia. Só o que diferencia um trecho dos outros vai no prefixo.
 */
export function textoParaEmbedding(secao: string, conteudo: string): string {
  return `${secao}\n\n${conteudo}`;
}
