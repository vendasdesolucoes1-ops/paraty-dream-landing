// Chave da OpenAI pronta para ir no cabeçalho HTTP.
//
// O segredo salvo no Supabase tem um caractere invisível: usado cru, o fetch
// recusa o cabeçalho ("not a valid ByteString") e a chamada nunca sai. Foi o
// que derrubou 100% da classificação das respostas do follow-up. A Sophia já
// limpava a chave; aqui a mesma limpeza fica num lugar só.
export function limparChave(bruta: string | null | undefined): string {
  return (bruta ?? "")
    .trim()
    .replace(/[\r\n\t]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

export function chaveOpenAI(): string {
  return limparChave(Deno.env.get("OPENAI_API_KEY"));
}
