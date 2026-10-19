import type { LucideIcon } from "lucide-react";

/**
 * Tira rotativa entre o hero e a primeira seção.
 *
 * Os seis fatos já aparecem em outros pontos da página — nenhuma afirmação
 * nova foi criada aqui. A tira é um resumo de leitura rápida para quem acaba
 * de ver o vídeo e ainda não sabe o que o loteamento oferece.
 *
 * SEM BOTÃO DE PAUSA, como pedido. O movimento para sozinho quando o sistema
 * está com "reduzir movimento" ligado (ver landing.css): isso não é um
 * controle na tela, é a preferência de acessibilidade do próprio aparelho, e
 * sem ela uma faixa em movimento contínuo é um problema real para quem tem
 * sensibilidade vestibular ou dificuldade de leitura.
 *
 * A lista é renderizada DUAS vezes e o trilho corre até -50%: quando a
 * primeira cópia termina de sair, a segunda está exatamente onde a primeira
 * começou, e o laço reinicia sem salto. A segunda cópia é aria-hidden para o
 * leitor de tela não anunciar tudo em dobro.
 */
export function TiraInformativa({
  itens,
}: {
  itens: readonly { Icon: LucideIcon; texto: string }[];
}) {
  const lista = (escondida: boolean) => (
    <ul
      aria-hidden={escondida || undefined}
      className="flex shrink-0 items-center gap-12 pr-12 sm:gap-16 sm:pr-16"
    >
      {itens.map(({ Icon, texto }) => (
        <li key={texto} className="flex shrink-0 items-center gap-3 whitespace-nowrap">
          <Icon aria-hidden className="h-[18px] w-[18px] shrink-0 text-gold" strokeWidth={1.6} />
          <span className="eyebrow text-[0.68rem] text-primary sm:text-[0.72rem]">{texto}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <aside
      aria-label="Resumo do loteamento"
      className="relative overflow-hidden border-y border-gold/30 bg-secondary py-5"
      // A máscara faz os itens surgirem e sumirem nas pontas; sem ela a tira
      // parece cortada na borda da tela.
      style={{
        maskImage: "linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)",
        WebkitMaskImage: "linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)",
      }}
    >
      <div className="lp-tira-trilho flex w-max">
        {lista(false)}
        {lista(true)}
      </div>
    </aside>
  );
}
