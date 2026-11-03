// Formatação de dinheiro num lugar só: "R$ 1.234,56", sempre com 2 casas.
// Sem imports com alias (@/…) para o teste rodar direto no node --test.

const cache = new Map<string, Intl.NumberFormat>();

function formatador(codigo: string): Intl.NumberFormat {
  let f = cache.get(codigo);
  if (!f) {
    try {
      f = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: codigo,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } catch {
      f = formatador("BRL");
    }
    cache.set(codigo, f);
  }
  return f;
}

/**
 * Converte o que vier do banco/API em número. Postgres numeric chega como
 * string ("12.5"); vazio, null e lixo viram null.
 */
export function paraNumero(valor: number | string | null | undefined): number | null {
  if (valor == null) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const texto = valor.trim();
  if (texto === "") return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

/** 1234.5 ou "1234.5" → "R$ 1.234,50". null/undefined/NaN → "—". */
export function formatarBRL(valor: number | string | null | undefined): string {
  const n = paraNumero(valor);
  return n === null ? "—" : formatador("BRL").format(n);
}

/**
 * Igual a formatarBRL, mas respeita a moeda da conta (ex.: conta de anúncios
 * em USD). Sem moeda ou com código inválido, cai em BRL.
 */
export function formatarMoeda(
  valor: number | string | null | undefined,
  moeda?: string | null,
): string {
  if (!moeda || moeda.toUpperCase() === "BRL") return formatarBRL(valor);
  const n = paraNumero(valor);
  return n === null ? "—" : formatador(moeda.toUpperCase()).format(n);
}
