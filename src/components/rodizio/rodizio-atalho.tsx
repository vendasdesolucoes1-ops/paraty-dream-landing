import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Bloco } from "@/components/ds/bloco";
import { Button } from "@/components/ui/button";

/** O rodízio saiu da aba Equipe e ganhou tela própria (Vendas → Rodízio). */
export function RodizioAtalho() {
  return (
    <Bloco
      titulo="Rodízio de leads"
      descricao="A fila, o limite por dia, a distribuição dos leads em espera e o histórico ficam na tela Rodízio."
      acao={
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/rodizio">
            Abrir o Rodízio
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      }
    >
      <span className="sr-only">Abrir a tela Rodízio</span>
    </Bloco>
  );
}
