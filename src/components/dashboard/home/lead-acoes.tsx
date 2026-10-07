import { Link } from "@tanstack/react-router";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { linkWhatsapp } from "@/lib/format";

/**
 * Ações rápidas de uma linha de lead: conversar no WhatsApp e abrir a ficha
 * no CRM. Sempre nesta ordem e neste formato, em qualquer lista do painel.
 */
export function LeadAcoes({
  leadId,
  nome,
  telefone,
}: {
  leadId: string;
  nome: string;
  telefone: string | null;
}) {
  const wa = linkWhatsapp(telefone);
  const botao =
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noreferrer"
          className={botao}
          aria-label={`Abrir conversa com ${nome} no WhatsApp`}
          title="WhatsApp"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
        </a>
      ) : null}
      <Link
        to="/dashboard/crm"
        search={{ lead: leadId }}
        className={botao}
        aria-label={`Abrir a ficha de ${nome} no CRM`}
        title="Abrir no CRM"
      >
        <ArrowUpRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
