import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import heroImg from "@/assets/hero-aerial-paraty.jpg";
import locationImg from "@/assets/location-paraty.jpg";
import igrejaImg from "@/assets/centro-igreja-santa-rita.png";
import canhoesImg from "@/assets/centro-canhoes-orla.jpg";
import vistaAereaImg from "@/assets/centro-vista-aerea.png";
import ruaNoiteImg from "@/assets/centro-rua-noite.png";
import cheiaCanoasImg from "@/assets/centro-cheia-canoas.png";
import telhadosImg from "@/assets/centro-telhados-aerea.jpg";
import waterfallImg from "@/assets/lifestyle-waterfall.jpg";
import pedraBrancaImg from "@/assets/cachoeira-pedra-branca.jpg";
import seteQuedasImg from "@/assets/cachoeira-sete-quedas.jpg";
import seteQuedas2Img from "@/assets/cachoeira-sete-quedas-2.jpg";
import seteQuedas3Img from "@/assets/cachoeira-sete-quedas-3.jpg";
import toboga1Img from "@/assets/cachoeira-toboga-1.jpg";
import toboga2Img from "@/assets/cachoeira-toboga-2.jpg";
import empreendimentoAntesImg from "@/assets/empreendimento-antes.jpg";
import empreendimentoDepoisImg from "@/assets/empreendimento-depois.jpg";
import obraVistaAereaImg from "@/assets/obra-vista-aerea-serra.jpg";
import obraRuasImg from "@/assets/obra-ruas-pavimentadas.jpg";
import obraQuadrasImg from "@/assets/obra-quadras-vista-alta.jpg";
import obraPlaygroundImg from "@/assets/obra-playground-academia.jpg";
import obraEntradaImg from "@/assets/obra-entrada-stand.jpg";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { Reveal } from "@/components/landing/Reveal";
import { LeadForm } from "@/components/landing/LeadForm";
import { Carousel, type CarouselSlide } from "@/components/landing/Carousel";
import { Banknote, PawPrint, PlugZap, Users } from "lucide-react";

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
      { property: "og:image", content: heroImg },
      { name: "twitter:image", content: heroImg },
    ],
  }),
  component: Landing,
});

const centroSlides: CarouselSlide[] = [
  {
    src: igrejaImg,
    alt: "Igreja de Santa Rita de Cássia no Centro Histórico de Paraty",
    titulo: "Igreja de Santa Rita",
    descricao: "Construída em 1722, a mais antiga da cidade — hoje Museu de Arte Sacra.",
  },
  {
    src: locationImg,
    alt: "Centro Histórico de Paraty",
    titulo: "Centro Histórico",
    descricao: "Ruas de pedra e casario colonial, a nove minutos do empreendimento.",
  },
  {
    src: canhoesImg,
    alt: "Canhões coloniais na orla histórica de Paraty",
    titulo: "Orla Histórica",
    descricao: "Canhões coloniais à beira do cais, marca da herança marítima da cidade.",
  },
  {
    src: vistaAereaImg,
    alt: "Vista aérea do Centro Histórico de Paraty",
    titulo: "Vista do Centro Histórico",
    descricao: "O casario colonial entre o mar e a Serra do Mar, visto do alto.",
  },
  {
    src: ruaNoiteImg,
    alt: "Rua de pedra do Centro Histórico ao entardecer",
    titulo: "Vida ao Entardecer",
    descricao: "Ruas de pedra, restaurantes e flores ao cair da noite no centro.",
  },
  {
    src: cheiaCanoasImg,
    alt: "Ruas alagadas do Centro Histórico de Paraty com canoas",
    titulo: "Maré das Ruas",
    descricao: "Na maré cheia, as ruas viram canais — cena típica e única de Paraty.",
  },
  {
    src: telhadosImg,
    alt: "Telhados coloniais do Centro Histórico vistos do alto",
    titulo: "Telhados Coloniais",
    descricao: "O conjunto de telhas e quintais preservados, patrimônio tombado.",
  },
];

const lifeSlides: CarouselSlide[] = [
  {
    src: pedraBrancaImg,
    alt: "Cachoeira da Pedra Branca em Paraty",
    titulo: "Cachoeira da Pedra Branca",
    descricao: "Poços de água cristalina e tobogã natural, a poucos minutos do loteamento.",
  },
  {
    src: seteQuedasImg,
    alt: "Cachoeira das Sete Quedas em Paraty",
    titulo: "Cachoeira das Sete Quedas",
    descricao:
      "Quedas em série e piscinas naturais em meio à floresta, ideais para um dia de mergulho.",
  },
  {
    src: seteQuedas2Img,
    alt: "Poço da Cachoeira das Sete Quedas",
    titulo: "Cachoeira das Sete Quedas",
    descricao: "Poço de águas calmas ao pé da queda, perfeito para banho em meio à mata.",
  },
  {
    src: seteQuedas3Img,
    alt: "Queda d'água entre rochas da Cachoeira das Sete Quedas",
    titulo: "Cachoeira das Sete Quedas",
    descricao: "Cortina de água entre rochas musgo, um espetáculo natural.",
  },
  {
    src: toboga1Img,
    alt: "Cachoeira do Tobogã com tobogã natural de rocha",
    titulo: "Cachoeira do Tobogã",
    descricao: "Tobogã natural de rocha polida — diversão e adrenalina em meio à mata.",
  },
  {
    src: toboga2Img,
    alt: "Poço e tobogã da Cachoeira do Tobogã em Paraty",
    titulo: "Cachoeira do Tobogã",
    descricao: "Poço cristalino ao pé do tobogã, perfeito para banho e lazer em família.",
  },
  {
    src: waterfallImg,
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
    src: obraVistaAereaImg,
    alt: "Vista aérea do loteamento Moradas de Paraty com a Serra do Mar ao fundo",
    titulo: "Entre a serra e o centro",
    descricao: "O loteamento pronto, cercado de mata, a nove minutos do Centro Histórico.",
  },
  {
    src: obraRuasImg,
    alt: "Ruas pavimentadas e demarcadas do loteamento",
    titulo: "Infraestrutura entregue",
    descricao: "Ruas asfaltadas, sinalizadas e com iluminação — nada no papel.",
  },
  {
    src: obraQuadrasImg,
    alt: "Quadras do loteamento vistas do alto, com o bairro vizinho ao lado",
    titulo: "Quadras demarcadas",
    descricao: "Lotes prontos para construir, junto a um bairro já consolidado.",
  },
  {
    src: obraPlaygroundImg,
    alt: "Playground e academia ao ar livre do loteamento",
    titulo: "Lazer para a família",
    descricao: "Playground e academia ao ar livre, à beira da Mata Atlântica.",
  },
  {
    src: obraEntradaImg,
    alt: "Entrada do loteamento com palmeiras e o stand de vendas",
    titulo: "Entrada do loteamento",
    descricao: "Acesso arborizado e stand de vendas aberto para visita.",
  },
];

const DIFERENCIAIS = [
  {
    Icon: Banknote,
    titulo: "Financiamento direto com o loteador",
    texto: "Sem banco, sem burocracia, em até 240x.",
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
                  className="group inline-flex items-center gap-3 bg-ivory text-primary hover:bg-sand px-8 py-4 rounded-[3px] eyebrow shadow-[0_14px_40px_-18px_rgba(0,0,0,0.55)] hover:shadow-[0_20px_48px_-18px_rgba(0,0,0,0.6)] hover:-translate-y-0.5 transition-all"
                >
                  Quero mais informações
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </a>
              </div>
            </Reveal>
          </div>

          {obraSlides.length > 0 && (
            <Reveal delay={300}>
              <Carousel slides={obraSlides} aspect="aspect-[4/3]" maxCaptionWidth="26rem" />
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}

function Landing() {
  return (
    <div className="bg-background text-foreground">
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
  return (
    <header className="fixed top-0 inset-x-0 z-40">
      <div className="container-x flex items-center justify-between py-5">
        <a href="#top" className="flex items-center leading-none">
          {/* Sem placa: o logo fica direto sobre a foto do hero. O wordmark
              navy do arquivo desapareceria contra a imagem escura, então vira
              ivory por CSS — mesma solução da sidebar, com drop-shadow para
              segurar a leitura sobre trechos claros da foto. */}
          <Logo variante="completo" className="h-16 w-auto [&_text]:fill-ivory drop-shadow-md" />
        </a>
        <Link
          to="/login"
          className="eyebrow text-ivory/90 hover:text-primary hover:bg-ivory/90 border border-ivory/40 hover:border-ivory px-4 py-2 rounded-[3px] backdrop-blur-sm transition-colors"
        >
          Entrar no sistema
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative min-h-screen w-full overflow-hidden">
      <div className="absolute inset-0">
        <img
          src={heroImg}
          alt="Vista aérea do loteamento Moradas de Paraty entre a Serra do Mar e a Mata Atlântica"
          className="w-full h-full object-cover"
          width={1920}
          height={1280}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/80" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/15 to-transparent" />
      </div>

      <div className="relative container-x min-h-screen flex flex-col justify-end pb-20 pt-32">
        <Reveal>
          {/* Sem "Sophia Saíde": a razão social do loteamento não é o que
              vende no primeiro segundo, e disputa atenção com a marca. Ela
              continua no rodapé, junto com matrícula e incorporadora, que é
              onde a informação legal pertence. */}
          <p className="eyebrow text-ivory/85 mb-6">Loteamento Residencial · Paraty / RJ</p>
        </Reveal>
        <Reveal delay={150}>
          <h1 className="font-display text-ivory text-5xl sm:text-7xl lg:text-8xl leading-[0.95] max-w-5xl tracking-tight">
            Invista em Paraty
            <br />
            <em className="not-italic text-sand">com tranquilidade.</em>
          </h1>
        </Reveal>
        <Reveal delay={300}>
          <p className="mt-8 text-ivory/85 text-lg sm:text-xl max-w-xl font-light">
            Lotes de alto padrão entre a Mata Atlântica e o Centro Histórico. Um lugar para viver,
            construir e valorizar.
          </p>
        </Reveal>
        <Reveal delay={450}>
          <div className="mt-10 flex flex-wrap gap-4 items-center">
            <a
              href="#formulario"
              className="group inline-flex items-center gap-3 bg-ivory text-primary hover:bg-sand px-8 py-4 rounded-[3px] eyebrow shadow-[0_14px_40px_-18px_rgba(0,0,0,0.55)] hover:shadow-[0_20px_48px_-18px_rgba(0,0,0,0.6)] hover:-translate-y-0.5 transition-all"
            >
              Quero mais informações
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </a>
          </div>
        </Reveal>

        <Reveal delay={700}>
          <div className="mt-16 sm:mt-20 grid grid-cols-3 gap-6 max-w-2xl border-t border-ivory/20 pt-8">
            <Stat n="9 min" l="do Centro Histórico" />
            <Stat n="250 – 450" l="m² por lote" />
            <Stat n="100%" l="cercado de natureza" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <div className="font-display text-ivory text-2xl sm:text-4xl">{n}</div>
      <div className="eyebrow text-ivory/70 mt-2 text-[0.65rem]">{l}</div>
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
            <Carousel slides={centroSlides} />
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
            <Carousel slides={lifeSlides} aspect="aspect-[3/4]" maxCaptionWidth="30rem" />
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
          beforeSrc={empreendimentoAntesImg}
          afterSrc={empreendimentoDepoisImg}
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
              Preencha o formulário e nossa equipe entrará em contato com a tabela de valores,
              opções disponíveis e condições especiais de lançamento.
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
