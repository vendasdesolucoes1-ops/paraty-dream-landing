import { createFileRoute, Link } from "@tanstack/react-router";
import { MarcaHorizontal } from "@/components/marca";
import { Rodape } from "@/components/landing/Rodape";
import "@/components/landing/landing.css";

const TITULO = "Política de Privacidade — Moradas de Paraty";
const DESCRICAO =
  "Como o Moradas de Paraty trata os dados pessoais de quem entra em contato, conforme a LGPD.";

export const Route = createFileRoute("/politica-de-privacidade")({
  head: () => ({
    meta: [
      { title: TITULO },
      { name: "description", content: DESCRICAO },
      { property: "og:title", content: TITULO },
      { property: "og:description", content: DESCRICAO },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PoliticaDePrivacidade,
});

const EMAIL = "moradasparaty@gmail.com";
const ENDERECO = "Estrada do Bananal, RJ-165, s/n, Zona Rural, Paraty/RJ, CEP 23970-000";

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl text-primary">{titulo}</h2>
      <div className="mt-3 space-y-3 leading-relaxed">{children}</div>
    </section>
  );
}

function Lista({ itens }: { itens: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {itens.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function PoliticaDePrivacidade() {
  return (
    <div className="lp-ease lp-brand bg-background text-foreground">
      <header className="bg-primary text-ivory">
        <div className="container-x flex items-center justify-between py-5">
          <Link to="/" aria-label="Moradas de Paraty — página inicial">
            <MarcaHorizontal className="text-[15px] text-ivory" />
          </Link>
          <Link to="/" className="text-sm text-ivory/80 transition-colors hover:text-ivory">
            Voltar ao site
          </Link>
        </div>
      </header>

      <main className="container-x max-w-3xl py-12 text-base sm:py-16">
        <h1 className="font-display text-3xl text-primary sm:text-4xl">
          Política de Privacidade – Moradas de Paraty
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">Última atualização: outubro de 2026</p>

        <Secao titulo="1. Quem somos">
          <p>
            Esta política explica como a RESIDENCIAL SOPHIA SAIDE EMPREENDIMENTOS SPE LTDA, CNPJ
            37.489.760/0001-14, com sede na Estrada do Bananal, RJ-165, s/n, Zona Rural, Paraty/RJ,
            CEP 23970-000, responsável pelo loteamento Moradas de Paraty (&ldquo;nós&rdquo;), trata
            os dados pessoais de quem entra em contato conosco, conforme a Lei Geral de Proteção de
            Dados (Lei nº 13.709/2018 – LGPD).
          </p>
        </Secao>

        <Secao titulo="2. Quais dados coletamos">
          <Lista
            itens={[
              "Dados que você nos informa: nome, telefone/WhatsApp, e-mail e cidade.",
              "Respostas sobre seu interesse: finalidade da compra (morar, veraneio ou investir), prazo pretendido, forma de pagamento preferida e interesse em visitar o loteamento.",
              "Conversas que você inicia conosco pelo WhatsApp, Instagram ou Facebook.",
              "Dados de navegação no site (cookies e ferramentas de medição, como o Pixel da Meta), como páginas visitadas e tipo de dispositivo.",
            ]}
          />
          <p>
            Coletamos esses dados pelo formulário do nosso site, pelos formulários de anúncios no
            Facebook e Instagram e pelas mensagens que você nos envia.
          </p>
        </Secao>

        <Secao titulo="3. Para que usamos seus dados">
          <Lista
            itens={[
              "Responder ao seu contato e enviar informações sobre os lotes e condições comerciais.",
              "Agendar e organizar visitas ao loteamento.",
              "Fazer o atendimento comercial pela equipe de consultores do Moradas de Paraty.",
              "Medir e melhorar nossos anúncios e nosso site.",
              "Cumprir obrigações legais.",
            ]}
          />
          <p>
            As bases legais são: o seu consentimento, os procedimentos preliminares a um possível
            contrato a pedido seu e o nosso legítimo interesse em atender e divulgar o
            empreendimento.
          </p>
        </Secao>

        <Secao titulo="4. Com quem compartilhamos">
          <p>Seus dados podem ser acessados por:</p>
          <Lista
            itens={[
              "Nossa equipe comercial e consultores que atendem o empreendimento.",
              "Prestadores de tecnologia que usamos para operar (hospedagem do site, WhatsApp, Meta/Facebook/Instagram e ferramentas de atendimento), alguns com servidores fora do Brasil.",
              "Autoridades, quando a lei exigir.",
            ]}
          />
          <p>Não vendemos seus dados pessoais.</p>
        </Secao>

        <Secao titulo="5. Por quanto tempo guardamos">
          <p>
            Mantemos seus dados enquanto houver relação comercial ou interesse no atendimento e por
            até 2 anos após o último contato, salvo quando a lei exigir prazo maior. Depois disso,
            os dados são apagados ou anonimizados.
          </p>
        </Secao>

        <Secao titulo="6. Seus direitos">
          <p>
            Você pode, a qualquer momento: confirmar se tratamos seus dados, acessá-los,
            corrigi-los, pedir a exclusão, revogar o consentimento, pedir a portabilidade e pedir
            para não receber mais mensagens. Para isso, fale com a gente pelos canais abaixo.
          </p>
        </Secao>

        <Secao titulo="7. Segurança">
          <p>
            Adotamos medidas técnicas e administrativas razoáveis para proteger seus dados contra
            acesso não autorizado, perda ou uso indevido.
          </p>
        </Secao>

        <Secao titulo="8. Cookies">
          <p>
            Usamos cookies para o funcionamento do site e para medir nossos anúncios. Você pode
            desativá-los nas configurações do seu navegador.
          </p>
        </Secao>

        <Secao titulo="9. Contato sobre privacidade">
          <p>
            E-mail:{" "}
            <a href={`mailto:${EMAIL}`} className="underline underline-offset-2">
              {EMAIL}
            </a>
            <br />
            WhatsApp:{" "}
            <a href="https://wa.me/5512988880309" className="underline underline-offset-2">
              (12) 98888-0309
            </a>
            <br />
            Endereço: {ENDERECO}
          </p>
        </Secao>

        <Secao titulo="10. Alterações">
          <p>Podemos atualizar esta política. A versão mais recente estará sempre nesta página.</p>
        </Secao>
      </main>

      <Rodape />
    </div>
  );
}
