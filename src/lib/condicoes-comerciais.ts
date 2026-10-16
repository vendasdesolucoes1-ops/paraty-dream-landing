// Validação do formulário de condição comercial (mesmos limites do banco:
// entrada 0–100%, parcelas 1–480).

export interface RascunhoCondicao {
  id: string | null;
  nome: string;
  entrada: string;
  parcelas: string;
  observacao: string;
}

/** Devolve a mensagem de erro do rascunho, ou null se está ok. */
export function erroDoRascunho(r: RascunhoCondicao): string | null {
  if (!r.nome.trim()) return "Dê um nome à condição.";
  const entrada = Number(r.entrada.replace(",", "."));
  if (!r.entrada.trim() || !Number.isFinite(entrada) || entrada < 0 || entrada > 100) {
    return "Entrada entre 0% e 100%.";
  }
  const parcelas = Number(r.parcelas);
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 480)
    return "Parcelas entre 1 e 480.";
  return null;
}
