import { createFileRoute, Link } from "@tanstack/react-router";
import heroImg from "@/assets/hero-paraty.jpg";
import waterfallImg from "@/assets/lifestyle-waterfall.jpg";
import locationImg from "@/assets/location-paraty.jpg";
import { Reveal } from "@/components/landing/Reveal";
import { LeadForm } from "@/components/landing/LeadForm";

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

function Landing() {
  return (
    <div className="bg-background text-foreground">
      <Nav />
      <Hero />
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
        <a href="#top" className="flex flex-col leading-none">
          <span className="font-display text-xl text-ivory drop-shadow-sm">Moradas</span>
          <span className="eyebrow text-ivory/80">de Paraty</span>
        </a>
        <Link
          to="/login"
          className="eyebrow text-ivory/90 hover:text-ivory border border-ivory/40 hover:border-ivory px-4 py-2 backdrop-blur-sm transition-colors"
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
      {/* Placeholder de vídeo — substituir <img> por <video src="..." autoPlay muted loop playsInline> */}
      <div className="absolute inset-0">
        <img
          src={heroImg}
          alt="Mata Atlântica em Paraty ao amanhecer"
          className="w-full h-full object-cover"
          width={1920}
          height={1280}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/30 to-black/75" />
      </div>

      <div className="relative container-x min-h-screen flex flex-col justify-end pb-20 pt-32 sm:pb-28">
        <Reveal>
          <p className="eyebrow text-ivory/85 mb-6">Loteamento Residencial Sophia Saíde · Paraty / RJ</p>
        </Reveal>
        <Reveal delay={150}>
          <h1 className="font-display text-ivory text-5xl sm:text-7xl lg:text-8xl leading-[0.95] max-w-5xl">
            Invista em Paraty
            <br />
            <em className="not-italic text-sand">com tranquilidade.</em>
          </h1>
        </Reveal>
        <Reveal delay={300}>
          <p className="mt-8 text-ivory/85 text-lg sm:text-xl max-w-xl font-light">
            Lotes de alto padrão entre a Mata Atlântica e o Centro Histórico.
            Um lugar para viver, construir e valorizar.
          </p>
        </Reveal>
        <Reveal delay={450}>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 sm:items-center">
            <a
              href="#formulario"
              className="group inline-flex items-center justify-center gap-3 bg-ivory text-primary px-8 py-4 eyebrow hover:bg-sand transition-colors"
            >
              Quero mais informações
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </a>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-3 text-ivory border border-ivory/50 hover:border-ivory px-8 py-4 eyebrow hover:bg-ivory/10 transition-colors"
            >
              Entrar no sistema
            </Link>
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
      <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
        <div className="lg:col-span-5">
          <Reveal>
            <p className="eyebrow text-accent mb-6">Localização</p>
            <h2 className="text-4xl sm:text-5xl text-primary leading-tight">
              A nove minutos do <em className="not-italic text-forest">coração colonial</em> de Paraty.
            </h2>
            <p className="mt-8 text-muted-foreground text-lg font-light leading-relaxed">
              Entre as ruas de pedra do Centro Histórico e o silêncio da Serra do Mar,
              o Moradas de Paraty oferece o raro equilíbrio entre cultura, natureza e praticidade.
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
          </Reveal>
        </div>

        <div className="lg:col-span-7">
          <Reveal delay={150}>
            <div className="relative aspect-[4/5] sm:aspect-[16/11] overflow-hidden">
              <img
                src={locationImg}
                alt="Centro Histórico de Paraty"
                loading="lazy"
                width={1600}
                height={1200}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="mt-6 aspect-[16/9] bg-muted border border-border flex items-center justify-center">
              <iframe
                title="Mapa Moradas de Paraty"
                src="https://www.google.com/maps?q=Rod.+Paraty-Cunha,+489+-+Pantanal,+Paraty+-+RJ&output=embed"
                className="w-full h-full"
                loading="lazy"
              />
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
            <div className="relative aspect-[3/4] overflow-hidden">
              <img
                src={waterfallImg}
                alt="Cachoeira em Paraty"
                loading="lazy"
                width={1024}
                height={1600}
                className="w-full h-full object-cover"
              />
            </div>
          </Reveal>
        </div>

        <div className="lg:col-span-6 order-1 lg:order-2">
          <Reveal delay={150}>
            <p className="eyebrow text-accent mb-6">Estilo de vida</p>
            <h2 className="text-4xl sm:text-5xl text-primary leading-tight">
              Onde o cotidiano se reencontra com a natureza.
            </h2>
            <p className="mt-8 text-muted-foreground text-lg font-light leading-relaxed">
              Lotes prontos para construir, cercados por cachoeiras, trilhas e mirantes.
              Um endereço para quem busca qualidade de vida sem abrir mão de praticidade,
              segurança e valorização patrimonial.
            </p>

            <div className="mt-12 grid grid-cols-2 gap-x-8 gap-y-10">
              {[
                ["Construa quando quiser", "Lotes regulares e planos, infraestrutura entregue."],
                ["Reserva natural", "Áreas verdes preservadas dentro do empreendimento."],
                ["Investimento sólido", "Paraty entre os destinos mais valorizados do litoral."],
                ["Curadoria arquitetônica", "Diretrizes para preservar a paisagem e a harmonia."],
              ].map(([t, d]) => (
                <div key={t}>
                  <h3 className="font-display text-xl text-primary">{t}</h3>
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
          <h2 className="text-4xl sm:text-5xl text-primary leading-tight">
            Conheça o Moradas de Paraty em 3D.
          </h2>
          <p className="mt-6 text-muted-foreground text-lg font-light">
            Uma visão imersiva sobre o desenho do loteamento, suas vias, áreas comuns e a integração com o relevo natural.
          </p>
        </div>
      </Reveal>

      <Reveal delay={200}>
        <div className="mt-14 relative aspect-video bg-primary overflow-hidden">
          {/* Placeholder de vídeo / render 3D — substituir por <video> ou <iframe> */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-ivory/90 gap-6">
            <div className="w-20 h-20 rounded-full border border-ivory/40 flex items-center justify-center">
              <span className="ml-1 text-2xl">▶</span>
            </div>
            <p className="eyebrow text-ivory/70">Vídeo / Render 3D em breve</p>
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,oklch(0.45_0.07_152/0.6),transparent_60%)]" />
        </div>
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
            <h2 className="font-display text-4xl sm:text-5xl text-ivory leading-tight">
              Reserve seu lote
              <br />
              <em className="not-italic text-sand">no Moradas de Paraty.</em>
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
            <div className="bg-ivory text-foreground p-8 sm:p-12">
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
    <footer className="bg-forest-deep text-ivory/80">
      <div className="container-x py-16 grid md:grid-cols-3 gap-10 text-sm">
        <div>
          <div className="font-display text-2xl text-ivory">Moradas de Paraty</div>
          <p className="eyebrow text-ivory/60 mt-2">Loteamento Sophia Saíde</p>
          <p className="mt-6 leading-relaxed">
            Rod. Paraty–Cunha, 489<br />
            Pantanal — Paraty / RJ
          </p>
        </div>
        <div>
          <p className="eyebrow text-ivory/60 mb-4">Registro</p>
          <p className="leading-relaxed">
            Loteamento Residencial Sophia Saíde<br />
            Matrícula nº 3487A<br />
            Comarca de Paraty / RJ
          </p>
        </div>
        <div>
          <p className="eyebrow text-ivory/60 mb-4">Incorporação</p>
          <p className="leading-relaxed">
            Incorporadora Sophia Saíde<br />
            Empreendimentos Imobiliários<br />
            <span className="text-ivory/55">Dados completos disponíveis sob consulta.</span>
          </p>
        </div>
      </div>
      <div className="border-t border-ivory/10">
        <div className="container-x py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ivory/55">
          <span>© {new Date().getFullYear()} Moradas de Paraty. Todos os direitos reservados.</span>
          <Link to="/login" className="hover:text-ivory transition-colors">Acesso ao sistema</Link>
        </div>
      </div>
    </footer>
  );
}
