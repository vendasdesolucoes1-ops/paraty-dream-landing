import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { Reveal } from "@/components/landing/Reveal";
import { LeadForm } from "@/components/landing/LeadForm";
import { Carousel, type CarouselSlide } from "@/components/landing/Carousel";
import { Banknote, PawPrint, PlugZap, Users } from "lucide-react";
import { foto } from "@/lib/landing-images";
import ogImg from "@/assets/landing/og-moradas.jpg";
import "@/components/landing/landing.css";

/** Atraso da animação de abertura do hero (ver landing.css). */
const atraso = (ms: number) => ({ "--lp-delay": `${ms}ms` }) as CSSProperties;

/** src + srcSet de uma foto da landing (ver lib/landing-images). */
function img(nome: string) {
  const { src, srcSet } = foto(nome);
  return { src, srcSet };
}

const HERO = foto("hero-aerial-paraty");
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
      { property: "og:image", content: ogImg },
      { name: "twitter:image", content: ogImg },
    ],
    // A foto do hero é o maior elemento da primeira tela: o pedido sai junto
    // com o HTML, com prioridade alta, já na largura certa para a tela.
    links: [
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
    <section className="bg-forest-deep text-ivory py-24 sm:py-32">
      <div className="container-x">
        <Reveal>
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl leading-[1.05] max-w-3xl">
            Sua casa em Paraty,
            <br />
            <em className="not-italic text-sand">sem complicação.</em>
          </h2>
        </Reveal>

        {/* Duas colunas no desktop: os diferenciais ocupam a esquerda e o
            carrossel a direita, em vez de empilhados. Empilhado, o carrossel
            sozinho passava de 800px de altura e deixava metade da faixa vazia
            à direita. */}
        <div className="mt-14 grid gap-10 lg:grid-cols-2 lg:gap-16 lg:items-center">
          <div>
            <Reveal delay={150}>
              <ul className="grid gap-y-7">
                {DIFERENCIAIS.map(({ Icon, titulo, texto }) => (
                  <li key={titulo} className="flex gap-4">
                    <Icon className="h-6 w-6 shrink-0 text-gold mt-0.5" strokeWidth={1.5} />
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
                  className="group inline-flex items-center gap-3 bg-ivory text-primary hover:bg-sand px-8 py-4 rounded-[3px] eyebrow shadow-[0_14px_40px_-18px_rgba(0,0,0,0.55)] hover:shadow-[0_20px_48px_-18px_rgba(0,0,0,0.6)] hover:-translate-y-0.5 transition-[background-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sand focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
                >
                  Agendar uma visita
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </a>
              </div>
            </Reveal>
          </div>

          {obraSlides.length > 0 && (
            <Reveal delay={300}>
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

function Landing() {
  return (
    <div className="lp-ease bg-background text-foreground">
      <a
        href="#formulario"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-sand focus:text-primary focus:px-4 focus:py-3 focus:rounded-[3px] eyebrow"
      >
        Pular para o formulário
      </a>
      <Nav />
      <Hero />
      <SemComplicacao />
      <Localizacao />
      <EstiloDeVida />
      <Maquete />
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
    const io = new IntersectionObserver(([entry]) => setSolid(!entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      {/* Marcador invisível no fim do hero: quando sai da tela, o header fica sólido. */}
      <div
        ref={sentinel}
        aria-hidden="true"
        className="absolute top-[calc(100svh-96px)] left-0 h-px w-px"
      />
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-[background-color,box-shadow,border-color] duration-300 motion-reduce:transition-none border-b ${
          solid
            ? "bg-ivory/90 backdrop-blur-md border-border/60 shadow-[0_8px_30px_-24px_rgba(0,0,0,0.35)]"
            : "border-transparent"
        }`}
      >
        <div
          className={`container-x flex items-center justify-between transition-[padding] duration-300 motion-reduce:transition-none ${
            solid ? "py-2.5" : "py-5"
          }`}
        >
          <a
            href="#top"
            className="flex items-center leading-none"
            aria-label="Moradas de Paraty — início"
          >
            {/* Sobre a foto, o wordmark navy do arquivo vira ivory por CSS, com
                drop-shadow para segurar a leitura nos trechos claros. Com o
                header sólido, volta à cor original. */}
            <Logo
              variante="completo"
              className={`w-auto transition-[height] duration-300 motion-reduce:transition-none ${
                solid ? "h-11" : "h-16 [&_text]:fill-ivory drop-shadow-md"
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
            className={`eyebrow inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-[3px] bg-primary text-primary-foreground hover:bg-forest transition-[opacity,transform,background-color] duration-300 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
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
    <section id="top" className="relative min-h-[100svh] w-full overflow-hidden">
      <div className="absolute inset-0 bg-primary">
        <div className="lp-hero-media absolute inset-0">
          <img
            src={HERO.src}
            srcSet={HERO.srcSet}
            sizes={HERO_SIZES}
            // Imagem aspiracional (o estilo de vida que o lote permite
            // construir), não foto do empreendimento: por isso o alt fala em
            // ilustração. A obra real aparece na faixa seguinte.
            alt="Ilustração de uma rua do bairro com casa contemporânea, família e muito verde"
            className="w-full h-full object-cover"
            width={HERO.width}
            height={Math.round((HERO.width * 768) / 1376)}
            fetchPriority="high"
            decoding="async"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/80" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/15 to-transparent" />
      </div>

      <div className="relative container-x min-h-[100svh] flex flex-col justify-end pb-14 sm:pb-20 pt-32">
        {/* Nome comercial, não a razão social. "Sophia Saíde" continua no
            rodapé, junto com matrícula e incorporadora — que é onde a
            informação legal pertence. */}
        <p className="lp-nudge eyebrow text-ivory/85 mb-6 tracking-[0.2em] sm:tracking-[0.28em]">
          Loteamento Residencial Moradas de Paraty · RJ
        </p>
        <h1 className="font-display text-ivory text-5xl sm:text-7xl lg:text-8xl leading-[0.95] max-w-5xl tracking-tight">
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
          className="lp-nudge mt-8 text-ivory/85 text-lg sm:text-xl max-w-xl font-light"
          style={atraso(260)}
        >
          Lotes de alto padrão entre a Mata Atlântica e o Centro Histórico. Um lugar para viver,
          construir e valorizar.
        </p>
        <div className="lp-nudge mt-10 flex flex-wrap gap-4 items-center" style={atraso(340)}>
          <a
            href="#formulario"
            className="group inline-flex items-center gap-3 bg-ivory text-primary hover:bg-sand px-8 py-4 rounded-[3px] eyebrow shadow-[0_14px_40px_-18px_rgba(0,0,0,0.55)] hover:shadow-[0_20px_48px_-18px_rgba(0,0,0,0.6)] hover:-translate-y-0.5 transition-[background-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sand focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
          >
            Agendar uma visita
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </a>
        </div>

        <div
          className="lp-fade mt-14 sm:mt-20 grid grid-cols-3 gap-4 sm:gap-6 max-w-2xl border-t border-ivory/20 pt-7 sm:pt-8"
          style={atraso(600)}
        >
          <Stat n="9 min" l="do Centro Histórico" />
          <Stat n="250 – 450" l="m² · residenciais e comerciais" />
          <Stat n="100%" l="cercado de natureza" />
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
      <div className="font-display text-ivory text-2xl sm:text-4xl [font-variant-numeric:lining-nums]">
        {n}
      </div>
      <div className="eyebrow text-ivory/70 mt-2 text-[0.6rem] sm:text-[0.65rem] tracking-[0.12em] sm:tracking-[0.28em] leading-snug">
        {l}
      </div>
    </div>
  );
}

function Localizacao() {
  return (
    <section className="py-24 sm:py-36 container-x">
      <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-start">
        <div className="lg:col-span-5">
          <Reveal>
            <p className="eyebrow text-accent mb-6">Localização</p>
            <h2 className="text-4xl sm:text-5xl text-primary leading-tight tracking-tight">
              A nove minutos do <em className="not-italic text-forest">coração colonial</em> de
              Paraty.
            </h2>
            <p className="mt-8 text-muted-foreground text-lg font-light leading-relaxed">
              Entre as ruas de pedra do Centro Histórico e o silêncio da Serra do Mar, o Moradas de
              Paraty oferece o raro equilíbrio entre cultura, natureza e praticidade.
            </p>
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
      <div className="container-x grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
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
            <p className="eyebrow text-accent mb-6">Estilo de vida</p>
            <h2 className="text-4xl sm:text-5xl text-primary leading-tight tracking-tight">
              Onde o cotidiano se reencontra com a natureza.
            </h2>
            <p className="mt-8 text-muted-foreground text-lg font-light leading-relaxed">
              Lotes prontos para construir, cercados por cachoeiras, trilhas e mirantes. Um endereço
              para quem busca qualidade de vida sem abrir mão de praticidade, segurança e
              valorização patrimonial.
            </p>

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
    <section className="py-24 sm:py-36 container-x">
      <Reveal>
        <div className="max-w-2xl">
          <p className="eyebrow text-accent mb-6">O empreendimento</p>
          <h2 className="text-4xl sm:text-5xl text-primary leading-tight tracking-tight">
            Conheça o Moradas de Paraty.
          </h2>
          <p className="mt-6 text-muted-foreground text-lg font-light">
            Uma visão imersiva sobre o desenho do loteamento, suas vias, áreas comuns e a integração
            com o relevo natural.
          </p>
        </div>
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
    </section>
  );
}

function Formulario() {
  return (
    <section id="formulario" className="bg-primary text-ivory py-24 sm:py-36">
      <div className="container-x grid lg:grid-cols-12 gap-12 lg:gap-20">
        <div className="lg:col-span-5">
          <Reveal>
            <p className="eyebrow text-sand mb-6">Receba a apresentação</p>
            <h2 className="font-display text-4xl sm:text-5xl text-ivory leading-tight tracking-tight">
              Receba a apresentação
              <br />
              <em className="not-italic text-sand">completa.</em>
            </h2>
            <p className="mt-8 text-ivory/75 font-light text-lg leading-relaxed">
              Preencha o formulário e nossa equipe fala com você no WhatsApp com os lotes
              disponíveis e as datas de visita.
            </p>
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
          <div className="font-display text-2xl text-ivory">Moradas de Paraty</div>
          <p className="eyebrow text-ivory/60 mt-2">Loteamento Sophia Saíde</p>
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
          <span>© {new Date().getFullYear()} Moradas de Paraty. Todos os direitos reservados.</span>
          <Link to="/login" className="hover:text-ivory transition-colors">
            Acesso ao sistema
          </Link>
        </div>
      </div>
    </footer>
  );
}
