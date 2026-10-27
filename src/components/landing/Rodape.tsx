import { Link } from "@tanstack/react-router";
import { MarcaHorizontal } from "@/components/marca";
import { RedesSociais } from "@/components/landing/RedesSociais";

/** Rodapé do site: usado na landing e na página de política de privacidade. */
export function Rodape() {
  return (
    <footer className="bg-primary text-ivory/80">
      {/* Assinatura horizontal, não a empilhada: a empilhada (flor sobre nome
          sobre divisor) é alta e sozinha respondia por boa parte da altura do
          rodapé. Aqui a marca é referência, não abertura. */}
      <div className="container-x grid gap-8 py-10 text-sm md:grid-cols-3">
        <div>
          <MarcaHorizontal className="text-[15px] text-ivory" />
          <p className="eyebrow text-ivory/60 mt-4">Loteamento Sophia Saíde</p>
          <p className="mt-3 leading-relaxed">
            Rod. Paraty–Cunha, 489
            <br />
            Pantanal — Paraty / RJ
          </p>
          <RedesSociais className="mt-5" />
        </div>
        <div>
          <p className="eyebrow text-ivory/60 mb-3">Registro</p>
          <p className="leading-relaxed">
            Loteamento Residencial Sophia Saíde
            <br />
            Matrícula nº 3487A
            <br />
            Comarca de Paraty / RJ
          </p>
        </div>
        <div>
          <p className="eyebrow text-ivory/60 mb-3">Incorporação</p>
          <p className="leading-relaxed">
            RESIDENCIAL SOPHIA SAIDE EMPREENDIMENTOS SPE LTDA
            <br />
            CNPJ 37.489.760/0001-14
            <br />
            Estrada do Bananal, RJ-165, s/n · Zona Rural · Paraty/RJ
          </p>
        </div>
      </div>
      <div className="border-t border-ivory/10">
        <div className="container-x flex flex-col items-center justify-between gap-2 py-4 text-xs text-ivory/55 sm:flex-row">
          <span>
            © {new Date().getFullYear()} Moradas de Paraty. Todos os direitos reservados. Imagens
            meramente ilustrativas.
          </span>
          <span className="flex items-center gap-4">
            <Link to="/politica-de-privacidade" className="hover:text-ivory transition-colors">
              Política de Privacidade
            </Link>
            <Link to="/login" className="hover:text-ivory transition-colors">
              Acesso ao sistema
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
