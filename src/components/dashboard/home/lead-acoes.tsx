import { Link } from "@tanstack/react-router";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { linkWhatsapp } from "@/lib/format";
import { cn } from "@/lib/utils";

const BOTAO =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Ações rápidas de uma linha de lead: conversar no WhatsApp e abrir a ficha
 * no CRM. Em tela com mouse ficam escondidas até a linha receber o cursor ou
 * o foco (a lista fica limpa); em toque ficam sempre visíveis. O pai precisa
 * ter a classe `group/linha`.
 */
export function LeadAcoes({
  leadId,
  nome,
  telefone,
  sobrepor = false,
}: {
  leadId: string;
  nome: string;
  telefone: string | null;
  /** Com mouse, flutua sobre o fim da linha em vez de reservar espaço (linhas estreitas). */
  sobrepor?: boolean;
}) {
  const wa = linkWhatsapp(telefone);
  return (
    <div
      className={cn(
        "relative z-10 flex shrink-0 items-center gap-0.5 transition-opacity duration-150",
        "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/linha:opacity-100 [@media(hover:hover)]:group-focus-within/linha:opacity-100",
        sobrepor &&
          "[@media(hover:hover)]:absolute [@media(hover:hover)]:right-1 [@media(hover:hover)]:rounded-md [@media(hover:hover)]:bg-muted",
      )}
    >
      {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noreferrer"
          className={BOTAO}
          aria-label={`Abrir conversa com ${nome} no WhatsApp`}
          title="WhatsApp"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
        </a>
      ) : null}
      <Link
        to="/dashboard/crm"
        search={{ lead: leadId }}
        className={BOTAO}
        aria-label={`Abrir a ficha de ${nome} no CRM`}
        title="Abrir no CRM"
      >
        <ArrowUpRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
