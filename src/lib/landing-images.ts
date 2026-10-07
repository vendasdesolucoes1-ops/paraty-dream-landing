// Fotos da landing em WebP, cada uma em várias larguras (480, 800, 1200, 1600
// ou a largura original, se menor). O navegador escolhe a menor que dá conta
// da tela pelo `sizes` de cada <img>: no celular sai a de 480/800 px, de
// 30 a 100 KB, em vez do JPG original de 1 a 2 MB.
//
// As variantes são geradas a partir dos originais e ficam em
// src/assets/landing/<nome>-<largura>.webp. Para trocar uma foto, gere as
// variantes com o mesmo padrão de nome; este arquivo as encontra sozinho.

const ARQUIVOS = import.meta.glob<string>("/src/assets/landing/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

export interface FotoResponsiva {
  /** Variante de reserva, para navegador sem suporte a srcset. */
  src: string;
  srcSet: string;
  /** Largura da maior variante, em px. */
  width: number;
}

const POR_NOME = new Map<string, { largura: number; url: string }[]>();

for (const [caminho, url] of Object.entries(ARQUIVOS)) {
  const match = caminho.match(/\/([a-z0-9-]+)-(\d+)\.webp$/);
  if (!match) continue;
  const [, nome, largura] = match;
  const lista = POR_NOME.get(nome) ?? [];
  lista.push({ largura: Number(largura), url });
  POR_NOME.set(nome, lista);
}

for (const lista of POR_NOME.values()) lista.sort((a, b) => a.largura - b.largura);

/** srcset de uma foto pelo nome do arquivo original, sem extensão. */
export function foto(nome: string): FotoResponsiva {
  const variantes = POR_NOME.get(nome);
  if (!variantes || variantes.length === 0) {
    throw new Error(`Foto da landing não encontrada: ${nome}`);
  }
  const reserva = variantes.find((v) => v.largura >= 800) ?? variantes[variantes.length - 1];
  return {
    src: reserva.url,
    srcSet: variantes.map((v) => `${v.url} ${v.largura}w`).join(", "),
    width: variantes[variantes.length - 1].largura,
  };
}
