import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AssinaturaHorizontal,
  AssinaturaMarca,
  DivisorMarca,
} from "@/components/landing/BrandMark";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { HeroVideo } from "@/components/landing/HeroVideo";
import { Reveal } from "@/components/landing/Reveal";
import { SecaoHeader } from "@/components/landing/SecaoHeader";
import { TiraInformativa } from "@/components/landing/TiraInformativa";
import { LeadForm } from "@/components/landing/LeadForm";
import { useCondicaoVigente } from "@/components/landing/condicao-vigente";
import { Carousel, type CarouselSlide } from "@/components/landing/Carousel";
import {
  Banknote,
  PawPrint,
  PlugZap,
  Users,
  Lightbulb,
  Droplets,
  ShieldCheck,
  TreePine,
  MapPin,
  Ruler,
  FileCheck2,
} from "lucide-react";
import { foto } from "@/lib/landing-images";
import "@/components/landing/landing.css";

/** Atraso da animação de abertura do hero (ver landing.css). */
const atraso = (ms: number) => ({ "--lp-delay": `${ms}ms` }) as CSSProperties;

/** src + srcSet de uma foto da landing (ver lib/landing-images). */
function img(nome: string) {
  const { src, srcSet } = foto(nome);
  return { src, srcSet };
}

// Primeiro quadro do vídeo do hero, servido como imagem responsiva: é o que
// pinta o LCP e o que fica no lugar do vídeo onde ele não é baixado.
const HERO = foto("hero-drone-paraty");
const HERO_VIDEO = "/video/hero-drone-paraty.mp4";
// O hero ocupa a tela inteira; no celular, a altura manda (a foto é paisagem e
// é cortada nas laterais), então a largura útil é ~1,8x a da tela.
const HERO_SIZES = "(max-aspect-ratio: 1/1) 180vw, 100vw";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Moradas de Paraty — Loteamento Residencial Sophia Saíde" },
      {
        name: "description",
        content:
          "Lotes residenciais e comerciais de 250 a 450 m², a 9 minutos do Centro Histórico de Paraty. Natureza, exclusividade e investimento seguro.",
      },
      { property: "og:title", content: "Moradas de Paraty" },
      { property: "og:description", content: "Viva e invista em Paraty com tranquilidade." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    // A foto do hero é o maior elemento da primeira tela: o pedido sai junto
    // com o HTML, com prioridade alta, já na largura certa para a tela.
    links: [
      // Fontes da identidade visual (ver landing.css). Sem o preload, o título
      // do hero pinta primeiro na fonte de sistema e troca depois.
      ...[
        "/fonts/playfair-display-latin-var.woff",
        "/fonts/nunito-sans-latin-var.woff",
        "/fonts/montserrat-latin-var.woff",
      ].map((href) => ({
        rel: "preload",
        href,
        as: "font",
        type: "font/woff",
        crossOrigin: "anonymous" as const,
      })),
      {
        rel: "preload",
        as: "image",
        href: HERO.src,
        imageSrcSet: HERO.srcSet,
        imageSizes: HERO_SIZES,
        fetchPriority: "high",
      },
    ],
  }),
  component: Landing,
});

const centroSlides: CarouselSlide[] = [
  {
    ...img("centro-igreja-santa-rita"),
    alt: "Igreja de Santa Rita de Cássia no Centro Histórico de Paraty",
    titulo: "Igreja de Santa Rita",
    descricao: "Construída em 1722, a mais antiga da cidade — hoje Museu de Arte Sacra.",
  },
  {
    ...img("location-paraty"),
    alt: "Centro Histórico de Paraty",
    titulo: "Centro Histórico",
    descricao: "Ruas de pedra e casario colonial, a nove minutos do empreendimento.",
  },
  {
    ...img("centro-canhoes-orla"),
    alt: "Canhões coloniais na orla histórica de Paraty",
    titulo: "Orla Histórica",
    descricao: "Canhões coloniais à beira do cais, marca da herança marítima da cidade.",
  },
  {
    ...img("centro-vista-aerea"),
    alt: "Vista aérea do Centro Histórico de Paraty",
    titulo: "Vista do Centro Histórico",
    descricao: "O casario colonial entre o mar e a Serra do Mar, visto do alto.",
  },
  {
    ...img("centro-rua-noite"),
    alt: "Rua de pedra do Centro Histórico ao entardecer",
    titulo: "Vida ao Entardecer",
    descricao: "Ruas de pedra, restaurantes e flores ao cair da noite no centro.",
  },
  {
    ...img("centro-cheia-canoas"),
    alt: "Ruas alagadas do Centro Histórico de Paraty com canoas",
    titulo: "Maré das Ruas",
    descricao: "Na maré cheia, as ruas viram canais — cena típica e única de Paraty.",
  },
  {
    ...img("centro-telhados-aerea"),
    alt: "Telhados coloniais do Centro Histórico vistos do alto",
    titulo: "Telhados Coloniais",
    descricao: "O conjunto de telhas e quintais preservados, patrimônio tombado.",
  },
];

const lifeSlides: CarouselSlide[] = [
  {
    ...img("cachoeira-pedra-branca"),
    alt: "Cachoeira da Pedra Branca em Paraty",
    titulo: "Cachoeira da Pedra Branca",
    descricao: "Poços de água cristalina e tobogã natural, a poucos minutos do loteamento.",
  },
  {
    ...img("cachoeira-sete-quedas-2"),
    alt: "Poço da Cachoeira das Sete Quedas",
    titulo: "Cachoeira das Sete Quedas",
    descricao: "Poço de águas calmas ao pé da queda, perfeito para banho em meio à mata.",
  },
  {
    ...img("cachoeira-sete-quedas-3"),
    alt: "Queda d'água entre rochas da Cachoeira das Sete Quedas",
    titulo: "Cachoeira das Sete Quedas",
    descricao: "Cortina de água entre rochas musgo, um espetáculo natural.",
  },
  {
    ...img("cachoeira-toboga-1"),
    alt: "Cachoeira do Tobogã com tobogã natural de rocha",
    titulo: "Cachoeira do Tobogã",
    descricao: "Tobogã natural de rocha polida — diversão e adrenalina em meio à mata.",
  },
  {
    ...img("cachoeira-toboga-2"),
    alt: "Poço e tobogã da Cachoeira do Tobogã em Paraty",
    titulo: "Cachoeira do Tobogã",
    descricao: "Poço cristalino ao pé do tobogã, perfeito para banho e lazer em família.",
  },
  {
    ...img("lifestyle-waterfall"),
    alt: "Cachoeira em meio à Mata Atlântica de Paraty",
    titulo: "Mata Atlântica",
    descricao: "Trilhas, quedas d'água e floresta preservada cercando o empreendimento.",
  },
];

// Fotos reais da obra entregue — as ÚNICAS do site que não são geradas por IA.
// Por isso ficam nesta faixa, que é a de prova concreta: o resto da página
// mostra Paraty, aqui se mostra o que já está construído.
//
// Chegaram como PNG de ~7 MB cada (33,5 MB no total, 2830px de largura).
// Convertidas para JPEG a 1600px: 1,1 MB no total, sem perda visível na tela.
const obraSlides: CarouselSlide[] = [
  {
    ...img("obra-vista-aerea-serra"),
    alt: "Vista aérea do loteamento Moradas de Paraty com a Serra do Mar ao fundo",
    titulo: "Entre a serra e o centro",
    descricao: "O loteamento pronto, cercado de mata, a nove minutos do Centro Histórico.",
  },
  {
    ...img("obra-ruas-pavimentadas"),
    alt: "Ruas pavimentadas e demarcadas do loteamento",
    titulo: "Infraestrutura entregue",
    descricao: "Ruas asfaltadas, sinalizadas e com iluminação — nada no papel.",
  },
  {
    ...img("obra-quadras-vista-alta"),
    alt: "Quadras do loteamento vistas do alto, com o bairro vizinho ao lado",
    titulo: "Quadras demarcadas",
    descricao: "Lotes prontos para construir, junto a um bairro já consolidado.",
  },
  {
    ...img("obra-playground-academia"),
    alt: "Playground e academia ao ar livre do loteamento",
    titulo: "Lazer para a família",
    descricao: "Playground e academia ao ar livre, à beira da Mata Atlântica.",
  },
  {
    ...img("obra-entrada-stand"),
    alt: "Entrada do loteamento com palmeiras e o stand de vendas",
    titulo: "Entrada do loteamento",
    descricao: "Acesso arborizado e stand de vendas aberto para visita.",
  },
];

/**
 * Tira entre o hero e a primeira seção. Cada item já é afirmado em outro
 * ponto da página (números do hero, infraestrutura, condições) — a tira
 * resume, não acrescenta.
 */
const TIRA = [
  { Icon: MapPin, texto: "9 min do Centro Histórico" },
  { Icon: Ruler, texto: "Lotes de 250 a 450 m²" },
  { Icon: PlugZap, texto: "Água, luz e ruas prontas" },
  { Icon: Banknote, texto: "Financiamento direto com a loteadora" },
  { Icon: FileCheck2, texto: "Loteamento 100% regularizado" },
  { Icon: TreePine, texto: "Cercado de Mata Atlântica" },
] as const;

const DIFERENCIAIS = [
  {
    Icon: Banknote,
    titulo: "Financiamento direto com o loteador",
    texto: "Sem banco e sem burocracia.",
  },
  {
    Icon: PlugZap,
    titulo: "Lote pronto pra construir",
    texto: "Água, luz e ruas pavimentadas já entregues.",
  },
  {
    Icon: Users,
    titulo: "Bairro planejado",
    texto: "Com associação de moradores.",
  },
  {
    Icon: PawPrint,
    titulo: "Lazer para a família",
    texto: "Espaço pet, academia ao ar livre e playground.",
  },
] as const;

/**
 * Faixa persuasiva logo depois do hero: o que o lead precisa saber antes de
 * qualquer outra coisa. Fundo navy para separar do restante da página, que é
 * claro, e para o dourado dos ícones ter contraste.
 */
function SemComplicacao() {
  return (
    <section className="bg-forest-deep text-ivory py-24 sm:py-36">
      <div className="container-x">
        {/* Uma grade só, com o título DENTRO da coluna da esquerda. Antes ele
            ocupava uma linha inteira acima, com a metade direita vazia, e o
            carrossel começava 350px abaixo do topo da seção sem nada por
            perto a que se alinhar. */}
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16 lg:items-start">
          <div className="lg:col-span-6">
            <Reveal>
              <SecaoHeader
                tom="escuro"
                tamanho="grande"
                titulo={
                  <>
                    Sua casa em Paraty,
                    <br />
                    <em className="not-italic text-sand">sem complicação.</em>
                  </>
                }
              />
            </Reveal>

            <Reveal delay={150}>
              <ul className="mt-12 grid gap-y-7">
                {DIFERENCIAIS.map(({ Icon, titulo, texto }) => (
                  <li key={titulo} className="flex gap-5 items-start">
                    <IconeMarca Icon={Icon} />
                    <div>
                      <div className="font-display text-xl leading-snug">{titulo}</div>
                      <div className="mt-1 text-ivory/75 font-light">{texto}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={450}>
              <div className="mt-10 flex flex-wrap gap-4 items-center">
                <a
                  href="#formulario"
                  className="group inline-flex items-center gap-3 bg-gold text-primary hover:bg-sand px-8 py-4 rounded-full eyebrow shadow-[0_14px_40px_-18px_rgba(0,0,0,0.55)] hover:shadow-[0_20px_48px_-18px_rgba(0,0,0,0.6)] hover:-translate-y-0.5 transition-[background-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sand focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
                >
                  Agendar uma visita
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </a>
              </div>
            </Reveal>
          </div>

          {obraSlides.length > 0 && (
            <Reveal delay={300} className="lg:col-span-6">
              <Carousel
                slides={obraSlides}
                aspect="aspect-[4/3]"
                maxCaptionWidth="26rem"
                sizes="(min-width: 1280px) 600px, (min-width: 1024px) 48vw, 100vw"
              />
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}

/** WhatsApp comercial (o mesmo das peças de Instagram). */
const WHATSAPP_URL =
  "https://wa.me/5512988880309?text=" +
  encodeURIComponent("Olá! QUERO MEU LOTE no Moradas de Paraty.");

function IconeWhatsApp({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.85 9.85 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24a8.23 8.23 0 0 1 8.24 8.25c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.54.06a6.7 6.7 0 0 1-1.99-1.23 7.5 7.5 0 0 1-1.38-1.72c-.14-.25 0-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.42h-.48a.92.92 0 0 0-.66.31c-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.08.15-1.18-.06-.11-.23-.17-.48-.29Z" />
    </svg>
  );
}

/** CTA de WhatsApp em pílula — "contorno" sobre foto/verde, "solido" em dourado. */
function BotaoWhatsApp({ variante }: { variante: "contorno" | "solido" }) {
  const estilo =
    variante === "solido"
      ? "bg-gold text-primary hover:bg-sand border-transparent"
      : "bg-transparent text-ivory border-gold/80 hover:border-sand hover:bg-ivory/[0.06]";
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-3 whitespace-nowrap border-2 px-7 py-[14px] rounded-full eyebrow transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sand focus-visible:ring-offset-2 focus-visible:ring-offset-primary ${estilo}`}
    >
      <IconeWhatsApp className={`h-5 w-5 ${variante === "solido" ? "" : "text-gold"}`} />
      <span>
        <span className="hidden sm:inline">WhatsApp </span>
        <span className={variante === "solido" ? "" : "text-sand"}>(12) 98888-0309</span>
      </span>
    </a>
  );
}

/**
 * Ícone da marca: traço dourado dentro de uma moldura quadrada arredondada,
 * como nos diferenciais das peças de feed.
 */
function IconeMarca({ Icon, tom = "escuro" }: { Icon: typeof Banknote; tom?: "escuro" | "claro" }) {
  return (
    <span
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gold/80 ${
        tom === "escuro" ? "bg-ivory/[0.04]" : "bg-card"
      }`}
    >
      <Icon className="h-6 w-6 text-gold" strokeWidth={1.5} aria-hidden="true" />
    </span>
  );
}

const INFRAESTRUTURA = [
  { Icon: Lightbulb, titulo: "Iluminação pública" },
  { Icon: TreePine, titulo: "Ruas asfaltadas e arborizadas" },
  { Icon: Droplets, titulo: "Abastecimento de água" },
  { Icon: ShieldCheck, titulo: "Monitoramento por câmeras 24h" },
] as const;

/**
 * Condição comercial — o "herói" das peças de feed: entrada e saldo direto
 * com a loteadora. Os números vêm da condição vigente escolhida no painel
 * (Configurações → Condições comerciais); sem vigente, o bloco não cita
 * números. Mesmo bloco do componente "Card de Oferta" do design system:
 * números em Playfair dourado dentro de moldura dourada sobre o verde.
 */
function CondicoesEspeciais() {
  const condicao = useCondicaoVigente();
  // Enquanto carrega, o espaço fica reservado (sem pulo de layout).
  const oculto = condicao === undefined ? "invisible" : "";
  return (
    <section id="condicoes" className="bg-secondary py-24 sm:py-36">
      <div className="container-x grid gap-10 lg:grid-cols-12 lg:gap-16 lg:items-center">
        <div className="lg:col-span-5">
          <Reveal>
            <SecaoHeader
              eyebrow="Condições especiais"
              eyebrowPilula
              titulo={
                <>
                  Seu terreno. Sua casa.
                  <br />
                  <em className="not-italic text-accent">Sua liberdade.</em>
                </>
              }
              texto="Lotes a partir de 250 m² em um loteamento 100% regularizado, com negociação direta com a loteadora — sem banco e sem burocracia."
            />
            <ul className="mt-10 grid gap-5 sm:grid-cols-2">
              {INFRAESTRUTURA.map(({ Icon, titulo }) => (
                <li key={titulo} className="flex items-center gap-4">
                  <IconeMarca Icon={Icon} tom="claro" />
                  <span className="text-[0.95rem] leading-snug text-primary">{titulo}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <div className="lg:col-span-7">
          <Reveal delay={150}>
            <div className="relative overflow-hidden rounded-[28px] bg-primary px-7 py-12 sm:px-12 sm:py-14 text-ivory shadow-[0_40px_90px_-45px_rgba(15,31,22,0.75)]">
              {/* Moldura dourada interna, como nas peças. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-3 sm:inset-4 rounded-[20px] border border-gold/70"
              />
              {/* As duas colunas têm a MESMA forma: rótulo, valor, e nada mais.
                  Antes, "direto com a loteadora" aparecia duas vezes no card em
                  tipografias diferentes — serifa grande à esquerda, caixa-alta
                  espaçada à direita — o que fazia duas informações de mesmo
                  peso parecerem de níveis diferentes. A frase é uma só e vale
                  para os dois lados, então saiu das colunas e virou a linha
                  compartilhada abaixo. */}
              <div className="relative grid items-start gap-8 sm:grid-cols-[1fr_auto_1fr] text-center">
                <div className={oculto}>
                  <p className="eyebrow text-ivory/80">
                    {condicao ? "Entrada a partir de" : "Entrada"}
                  </p>
                  {/* Altura reservada: sem ela o card encolhe quando a condição
                      real chega e empurra o resto da página. */}
                  <div className="mt-3 flex min-h-[5.5rem] sm:min-h-[7rem] items-center justify-center">
                    {condicao ? (
                      <p className="lp-num text-gold text-[5.5rem] sm:text-[7rem] leading-none">
                        {condicao.entrada}
                        <span className="text-[0.55em] align-top">%</span>
                      </p>
                    ) : (
                      <p className="font-display text-gold text-5xl sm:text-6xl leading-none">
                        Facilitada
                      </p>
                    )}
                  </div>
                </div>
                <div aria-hidden="true" className="mx-auto h-px w-2/3 bg-gold/70 sm:h-40 sm:w-px" />
                <div className={oculto}>
                  <p className="eyebrow text-ivory/80">{condicao ? "Saldo em até" : "Saldo"}</p>
                  <div className="mt-3 flex min-h-[5.5rem] sm:min-h-[7rem] items-center justify-center">
                    {condicao ? (
                      <p className="lp-num text-gold text-[5.5rem] sm:text-[7rem] leading-none">
                        {condicao.parcelas}
                        <span className="text-[0.55em]">x</span>
                      </p>
                    ) : (
                      <p className="font-display text-gold text-5xl sm:text-6xl leading-none">
                        Parcelado
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <p className="relative mt-6 text-center font-display text-2xl sm:text-3xl text-ivory">
                Direto com a loteadora, sem banco.
              </p>

              <DivisorMarca className="relative mx-auto mt-10 max-w-md" />

              <div className="relative mt-10 flex flex-wrap justify-center gap-4">
                <BotaoWhatsApp variante="solido" />
                <a
                  href="#formulario"
                  className="inline-flex items-center gap-3 rounded-full border-2 border-ivory/40 px-7 py-[14px] eyebrow text-ivory hover:border-ivory/80 hover:bg-ivory/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sand focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
                >
                  Faça sua simulação
                </a>
              </div>
              <p className="relative mx-auto mt-8 max-w-lg text-center text-xs leading-relaxed text-ivory/60">
                Condições sujeitas à disponibilidade, análise cadastral e regras comerciais.
                Consulte as condições vigentes antes da contratação.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/**
 * Emenda entre duas seções de fundos diferentes.
 *
 * As trocas claro↔escuro da página eram um corte reto: a faixa verde da seção
 * "sem complicação" terminava no pixel seguinte em creme, e o mesmo acontecia
 * ao entrar no formulário. Numa página que fala de serra, mata e fim de tarde,
 * a transição dissolvida lê como luz mudando; o corte reto lê como duas
 * páginas coladas.
 *
 * Fica fora da seção, e não como overlay dentro dela, porque a emenda pertence
 * às duas — assim cada seção continua um bloco de uma cor só, e trocar a cor
 * de uma não exige lembrar de ajustar a sombra da outra.
 */
function Costura({ de, para }: { de: string; para: string }) {
  return (
    <div
      aria-hidden="true"
      className="h-16 sm:h-24"
      style={{ backgroundImage: `linear-gradient(to bottom, ${de}, ${para})` }}
    />
  );
}

function Landing() {
  return (
    <div className="lp-ease lp-brand bg-background text-foreground">
      <a
        href="#formulario"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-sand focus:text-primary focus:px-4 focus:py-3 focus:rounded-[3px] eyebrow"
      >
        Pular para o formulário
      </a>
      <Nav />
      <Hero />
      <TiraInformativa itens={TIRA} />
      {/* Do creme da tira para o verde da seção: sem a costura, o corte seco
          entre os dois faria a tira parecer destacada da página. */}
      <Costura de="var(--secondary)" para="var(--forest-deep)" />
      <SemComplicacao />
      <Costura de="var(--forest-deep)" para="var(--secondary)" />
      <CondicoesEspeciais />
      <Localizacao />
      <EstiloDeVida />
      <Maquete />
      <Costura de="var(--background)" para="var(--primary)" />
      <Formulario />
      <Rodape />
    </div>
  );
}

function Nav() {
  // Sobre o hero o header é transparente, com o logo claro. Quando o hero sai
  // de cena ele vira uma faixa marfim translúcida, com o logo na cor original e
  // o botão de visita sempre à mão. Sem isso, o logo ficava solto por cima das
  // seções seguintes e o único caminho até o formulário era rolar até o fim.
  const [solid, setSolid] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) =>
      // boundingClientRect.top < 0 distingue "ja rolou para cima" de "ainda
      // esta la embaixo". Sem isso, com o sentinela no fim da trilha de
      // 250svh o header nascia opaco no topo da pagina e ficava
      // transparente justamente depois do hero — o inverso do desejado.
      setSolid(!entry.isIntersecting && entry.boundingClientRect.top < 0),
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      {/* Marcador no fim REAL do hero. Ficava em 100svh, de quando o hero tinha
          uma tela; com a trilha de 250svh do vídeo, o header virava faixa
          opaca ainda no meio do voo e tapava justamente o que se quer ver.
          Agora acompanha a altura da seção. */}
      <div
        ref={sentinel}
        aria-hidden="true"
        className="absolute top-[calc(var(--hero-altura,100svh)-96px)] left-0 h-px w-px"
      />
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-[background-color,box-shadow,border-color] duration-300 motion-reduce:transition-none border-b ${
          solid
            ? "bg-ivory/45 backdrop-blur-2xl backdrop-saturate-150 border-ivory/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_32px_-26px_rgba(0,0,0,0.45)]"
            : "border-transparent"
        }`}
      >
        <div
          className={`container-x flex items-center justify-between transition-[padding] duration-300 motion-reduce:transition-none ${
            solid ? "py-2.5" : "py-5"
          }`}
        >
          {/* Sobre o hero a marca do header sai junto com o texto: o vídeo
              termina na própria assinatura, em tela cheia, e duas marcas ao
              mesmo tempo é uma competindo com a outra. Com o header em vidro
              (depois do hero) ela volta inteira. */}
          <a
            href="#top"
            className="flex items-center leading-none"
            aria-label="Moradas de Paraty — início"
            style={solid ? undefined : { opacity: "calc((0.7 - var(--hero-p, 0)) * 5)" }}
          >
            {/* Assinatura da identidade visual: sobre a foto, nome em marfim com
                sombra para segurar a leitura; com o header sólido (fundo
                papel), nome em verde floresta e tamanho menor. */}
            <AssinaturaHorizontal
              tom={solid ? "escuro" : "claro"}
              className={`transition-[font-size] duration-300 motion-reduce:transition-none ${
                solid ? "text-[15px]" : "text-[19px] drop-shadow-md"
              }`}
            />
          </a>
          {/* "Entrar no sistema" segue fora do header a pedido: é o acesso do
              CRM interno e só distraía quem chega atrás do loteamento. O link
              continua no rodapé. */}
          <a
            href="#formulario"
            aria-hidden={!solid}
            tabIndex={solid ? 0 : -1}
            className={`eyebrow inline-flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-full bg-primary text-primary-foreground hover:bg-forest transition-[opacity,transform,background-color] duration-300 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
              solid
                ? "opacity-100 translate-y-0 pointer-events-auto"
                : "opacity-0 -translate-y-1 pointer-events-none"
            }`}
          >
            Agendar visita
          </a>
        </div>
      </header>
    </>
  );
}

function Hero() {
  // Sem <Reveal> aqui: o hero aparece já no HTML do servidor e anima só com
  // CSS (landing.css). Antes cada bloco esperava o JavaScript carregar com
  // opacity 0 — num celular lento, o título levava 5 segundos para surgir.
  return (
    // Sem overflow-hidden na seção: ele quebraria o sticky do palco. O corte
    // da mídia passou para o palco, que é quem precisa dele.
    <section id="top" className="relative min-h-[100svh] w-full">
      {/* Palco fixo enquanto a trilha rola. É isto que dá ao vídeo distância
          para terminar o voo antes de a próxima seção entrar — com uma tela
          só de rolagem, o voo era cortado no meio. */}
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden">
        <div className="absolute inset-0 bg-primary">
          <HeroVideo
            posterSrc={HERO.src}
            posterSrcSet={HERO.srcSet}
            posterSizes={HERO_SIZES}
            posterWidth={HERO.width}
            posterHeight={Math.round((HERO.width * 9) / 16)}
            alt="Vista aérea de Paraty: a baía com veleiros, o casario colonial e a Serra do Mar ao fundo"
            videoSrc={HERO_VIDEO}
          />
          {/* O escurecimento existe para o texto do hero ser legível sobre o
              vídeo. Quando o texto some, ele perde a função — e era ele, não o
              vídeo, que deixava o fecho com o logotipo apagado. Abre um pouco
              depois do texto, para a assinatura chegar com a imagem limpa. */}
          <div
            className="absolute inset-0"
            style={{ opacity: "calc((0.95 - var(--hero-p, 0)) * 2.2)" }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-[#0f1f16]/60 via-[#0f1f16]/25 to-[#0f1f16]/90" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0f1f16]/55 via-[#0f1f16]/15 to-transparent" />
          </div>
        </div>

        {/* O texto some conforme o voo avança: o vídeo termina na assinatura da
          marca, centralizada no quadro, e título sobre logotipo seria uma
          sobreposição de duas marcas. opacity fora de 0–1 é fixada pelo
          próprio navegador, então a conta dispensa clamp. */}
        <div
          className="relative container-x flex h-full flex-col justify-end pb-14 sm:pb-20 pt-32"
          style={{ opacity: "calc((0.7 - var(--hero-p, 0)) * 5)" }}
        >
          {/* Nome comercial, não a razão social. "Sophia Saíde" continua no
            rodapé, junto com matrícula e incorporadora — que é onde a
            informação legal pertence. */}
          <p className="lp-nudge eyebrow text-ivory/85 mb-6 tracking-[0.2em] sm:tracking-[0.28em]">
            Loteamento Residencial Moradas de Paraty · RJ
          </p>
          <h1 className="font-display text-ivory text-4xl sm:text-6xl lg:text-7xl leading-[0.98] max-w-4xl tracking-tight">
            <span className="lp-line" style={atraso(80)}>
              <span>Invista em Paraty</span>
            </span>
            <span className="lp-line" style={atraso(180)}>
              <span>
                <em className="not-italic text-sand">com tranquilidade.</em>
              </span>
            </span>
          </h1>
          <p
            className="lp-nudge font-script mt-4 text-sand text-3xl sm:text-4xl leading-none"
            style={atraso(220)}
          >
            Seu lugar. Seu futuro. Sua história.
          </p>
          <p
            className="lp-nudge mt-7 text-ivory/85 text-lg sm:text-xl max-w-xl font-light"
            style={atraso(260)}
          >
            Lotes de alto padrão entre a Mata Atlântica e o Centro Histórico. Um lugar para viver,
            construir e valorizar.
          </p>
          <div className="lp-nudge mt-10 flex flex-wrap gap-4 items-center" style={atraso(340)}>
            <a
              href="#formulario"
              className="group inline-flex items-center gap-3 bg-gold text-primary hover:bg-sand px-8 py-4 rounded-full eyebrow shadow-[0_14px_40px_-18px_rgba(0,0,0,0.55)] hover:shadow-[0_20px_48px_-18px_rgba(0,0,0,0.6)] hover:-translate-y-0.5 transition-[background-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sand focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
            >
              Agendar uma visita
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </a>
            <BotaoWhatsApp variante="contorno" />
          </div>

          <div
            className="lp-fade mt-14 sm:mt-20 grid grid-cols-3 gap-4 sm:gap-6 max-w-4xl border-t border-ivory/20 pt-7 sm:pt-8"
            style={atraso(600)}
          >
            <Stat n="9 min" l="do Centro Histórico" />
            <Stat n="250 – 450" l="m² · residenciais e comerciais" />
            <Stat n="100%" l="cercado de natureza" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      {/* [font-variant-numeric:lining-nums]: a Cormorant Garamond usa algarismo
          "estilo antigo" por padrão, e o "1" nesse estilo não tem serifa e fica
          baixo — em "100%" lê-se quase como "i00%". lining-nums força o "1"
          de caixa alta, do tamanho da linha do texto, sem ambiguidade. */}
      <div className="font-display text-ivory text-xl sm:text-4xl whitespace-nowrap [font-variant-numeric:lining-nums]">
        {n}
      </div>
      {/* tracking menor no desktop do que o eyebrow padrão (0.28em): com ele,
          "m² · residenciais e comerciais" não cabia na coluna e quebrava em
          duas linhas, deixando só um dos três números com rótulo duplo e a
          fileira visivelmente torta. 0.18em mantém o ar de caixa-alta e cabe
          nos três. */}
      <div className="eyebrow text-ivory/70 mt-2 text-[0.6rem] sm:text-[0.65rem] tracking-[0.12em] sm:tracking-[0.18em] leading-snug">
        {l}
      </div>
    </div>
  );
}

function Localizacao() {
  return (
    <section className="py-24 sm:py-36 border-t border-border/70">
      <div className="container-x grid gap-10 lg:grid-cols-12 lg:gap-16 lg:items-start">
        <div className="lg:col-span-5">
          <Reveal>
            <SecaoHeader
              eyebrow="Localização"
              titulo={
                <>
                  A nove minutos do <em className="not-italic text-accent">coração colonial</em> de
                  Paraty.
                </>
              }
              texto="Entre as ruas de pedra do Centro Histórico e o silêncio da Serra do Mar, o Moradas de Paraty oferece o raro equilíbrio entre cultura, natureza e praticidade."
            />
            <ul className="mt-10 space-y-4 text-foreground">
              {[
                "Acesso direto pela Rod. Paraty–Cunha",
                "Próximo a cachoeiras, trilhas e praias",
                "Infraestrutura completa, pronto para construir",
              ].map((t) => (
                <li key={t} className="flex items-start gap-4">
                  <span className="mt-2 h-px w-6 bg-accent shrink-0" />
                  <span className="text-base">{t}</span>
                </li>
              ))}
            </ul>
            <div className="mt-10 h-[200px] bg-muted border border-border rounded-[4px] overflow-hidden shadow-[0_18px_44px_-30px_rgba(20,40,30,0.4)]">
              <iframe
                title="Mapa Moradas de Paraty"
                src="https://www.google.com/maps?q=Rod.+Paraty-Cunha,+489+-+Pantanal,+Paraty+-+RJ&output=embed"
                className="w-full h-full border-0"
                loading="lazy"
              />
            </div>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <span className="eyebrow text-accent text-[0.65rem]">Endereço</span>
              <span className="text-[0.95rem] text-forest">
                Rod. Paraty–Cunha, 489 · Pantanal · Paraty / RJ
              </span>
            </div>
          </Reveal>
        </div>

        <div className="lg:col-span-7">
          <Reveal delay={150}>
            <Carousel
              slides={centroSlides}
              sizes="(min-width: 1280px) 720px, (min-width: 1024px) 56vw, 100vw"
            />
            <div className="mt-10">
              <p className="eyebrow text-accent mb-4">A cidade histórica</p>
              <h3 className="font-display text-2xl sm:text-[2rem] text-primary leading-[1.15]">
                Paraty, patrimônio vivo entre a serra e o mar.
              </h3>
              <p className="mt-5 text-muted-foreground text-[1.0625rem] font-light leading-[1.75]">
                Fundada no século XVII, Paraty preserva um dos conjuntos coloniais mais íntegros do
                Brasil — ruas de pedra, casario branco e igrejas centenárias que hoje compõem um
                Patrimônio Mundial reconhecido pela UNESCO.
              </p>
              <p className="mt-4 text-muted-foreground text-[1.0625rem] font-light leading-[1.75]">
                Entre festivais literários, gastronomia premiada e o encontro da Mata Atlântica com
                a Baía da Ilha Grande, a cidade reúne história, cultura e natureza em um mesmo
                endereço.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function EstiloDeVida() {
  return (
    <section className="bg-secondary py-24 sm:py-36">
      <div className="container-x grid gap-10 lg:grid-cols-12 lg:gap-16 lg:items-center">
        <div className="lg:col-span-6 order-2 lg:order-1">
          <Reveal>
            <Carousel
              slides={lifeSlides}
              aspect="aspect-[3/4]"
              maxCaptionWidth="30rem"
              sizes="(min-width: 1280px) 600px, (min-width: 1024px) 48vw, 100vw"
            />
          </Reveal>
        </div>

        <div className="lg:col-span-6 order-1 lg:order-2">
          <Reveal delay={150}>
            <SecaoHeader
              eyebrow="Estilo de vida"
              titulo="Onde o cotidiano se reencontra com a natureza."
              texto="Lotes prontos para construir, cercados por cachoeiras, trilhas e mirantes. Um endereço para quem busca qualidade de vida sem abrir mão de praticidade, segurança e valorização patrimonial."
            />

            <div className="mt-12 grid grid-cols-2 gap-x-8 gap-y-10">
              {[
                ["Construa quando quiser", "Lotes regulares e planos, infraestrutura entregue."],
                ["Reserva natural", "Áreas verdes preservadas dentro do empreendimento."],
                ["Investimento sólido", "Paraty entre os destinos mais valorizados do litoral."],
                ["Curadoria arquitetônica", "Diretrizes para preservar a paisagem e a harmonia."],
              ].map(([t, d]) => (
                <div key={t} className="transition-transform duration-500 hover:-translate-y-1">
                  <h3 className="font-display text-xl text-primary tracking-tight">{t}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{d}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Maquete() {
  return (
    <section className="py-24 sm:py-36 border-t border-border/70">
      <div className="container-x">
        <Reveal>
          <SecaoHeader
            className="max-w-2xl"
            eyebrow="O empreendimento"
            titulo="Conheça o Moradas de Paraty."
            texto="Uma visão imersiva sobre o desenho do loteamento, suas vias, áreas comuns e a integração com o relevo natural."
          />
        </Reveal>

        <Reveal delay={200}>
          <BeforeAfterSlider
            beforeSrc={img("empreendimento-antes").src}
            beforeSrcSet={img("empreendimento-antes").srcSet}
            afterSrc={img("empreendimento-depois").src}
            afterSrcSet={img("empreendimento-depois").srcSet}
            sizes="(min-width: 1280px) 1232px, 100vw"
            alt="Loteamento Moradas de Paraty"
            className="mt-14 aspect-video bg-primary rounded-[4px] shadow-[0_30px_70px_-40px_rgba(20,40,30,0.55)]"
          />
        </Reveal>
      </div>
    </section>
  );
}

function Formulario() {
  return (
    <section id="formulario" className="bg-primary text-ivory py-24 sm:py-36">
      <div className="container-x grid gap-10 lg:grid-cols-12 lg:gap-16 lg:items-start">
        <div className="lg:col-span-5">
          <Reveal>
            <SecaoHeader
              tom="escuro"
              eyebrow="Contato"
              titulo={
                <>
                  Receba a apresentação
                  <br />
                  <em className="not-italic text-sand">completa.</em>
                </>
              }
              texto="Preencha o formulário e nossa equipe fala com você no WhatsApp com os lotes disponíveis e as datas de visita."
            />
            <div className="mt-12 pt-8 border-t border-ivory/15">
              <p className="eyebrow text-ivory/60 mb-3">Atendimento</p>
              <p className="text-ivory">Rod. Paraty–Cunha, 489</p>
              <p className="text-ivory/80">Pantanal · Paraty / RJ</p>
            </div>
          </Reveal>
        </div>

        <div className="lg:col-span-7">
          <Reveal delay={150}>
            <div className="bg-ivory text-foreground p-9 sm:p-13 rounded-[5px] shadow-[0_40px_90px_-45px_rgba(0,0,0,0.5)]">
              <LeadForm />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Rodape() {
  return (
    <footer className="bg-primary text-ivory/80">
      <div className="container-x py-16 grid md:grid-cols-3 gap-10 text-sm">
        <div>
          <AssinaturaMarca tom="claro" className="text-[22px]" />
          <p className="eyebrow text-ivory/60 mt-5">Loteamento Sophia Saíde</p>
          <p className="mt-6 leading-relaxed">
            Rod. Paraty–Cunha, 489
            <br />
            Pantanal — Paraty / RJ
          </p>
        </div>
        <div>
          <p className="eyebrow text-ivory/60 mb-4">Registro</p>
          <p className="leading-relaxed">
            Loteamento Residencial Sophia Saíde
            <br />
            Matrícula nº 3487A
            <br />
            Comarca de Paraty / RJ
          </p>
        </div>
        <div>
          <p className="eyebrow text-ivory/60 mb-4">Incorporação</p>
          <p className="leading-relaxed">
            Incorporadora Sophia Saíde
            <br />
            Empreendimentos Imobiliários
            <br />
            <span className="text-ivory/55">Dados completos disponíveis sob consulta.</span>
          </p>
        </div>
      </div>
      <div className="border-t border-ivory/10">
        <div className="container-x py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ivory/55">
          <span>
            © {new Date().getFullYear()} Moradas de Paraty. Todos os direitos reservados. Imagens
            meramente ilustrativas.
          </span>
          <Link to="/login" className="hover:text-ivory transition-colors">
            Acesso ao sistema
          </Link>
        </div>
      </div>
    </footer>
  );
}
