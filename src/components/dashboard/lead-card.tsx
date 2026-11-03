import { forwardRef, type HTMLAttributes, type KeyboardEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import {
  CalendarX,
  ClipboardList,
  Headset,
  MapPin,
  Megaphone,
  Ruler,
  Sparkles,
  UserX,
} from "lucide-react";
import { Avatar } from "@/components/ds/avatar";
import { Pill } from "@/components/ds/pill";
import { atraso } from "@/components/ds/reveal";
import { cn } from "@/lib/utils";
import { formatTelefone, tempoRelativo } from "@/lib/format";
import { rotuloOrigem } from "@/lib/lead-status";
import { cidadeValida, nomeExibicao, resumoRespostas } from "@/lib/lead-exibicao";
import type { Lead } from "@/lib/types";

type VistaProps = {
  lead: Lead;
  hasHumanTakeover?: boolean;
  /** Lead em "Agendado" sem visita marcada: o cartão avisa. */
  semVisita?: boolean;
  draggable?: boolean;
  /** "fantasma": o cartão de origem enquanto o clone é arrastado. "clone": o que segue o cursor. */
  modo?: "normal" | "fantasma" | "clone";
} & Omit<HTMLAttributes<HTMLDivElement>, "children">;

/** O cartão em si, sem lógica de arrastar: serve ao Kanban e ao clone do arrasto. */
export const LeadCardView = forwardRef<HTMLDivElement, VistaProps>(function LeadCardView(
  { lead, hasHumanTakeover, semVisita, draggable = true, modo = "normal", className, ...rest },
  ref,
) {
  const origem = lead.origem ? rotuloOrigem(lead.origem) : null;
  // Entrou de novo por outro canal (ex.: veio do WhatsApp e depois preencheu o formulário).
  const voltouPor =
    lead.origem_ultima && lead.origem_ultima !== lead.origem
      ? rotuloOrigem(lead.origem_ultima)
      : null;
  const nome = nomeExibicao(lead);
  const cidade = cidadeValida(lead.cidade);
  const respostas = resumoRespostas(lead);
  // Lead de anúncio: a campanha (ou o anúncio) aparece numa linha própria,
  // cortada com reticências, para não estourar o cartão.
  const campanha = lead.campanha_nome ?? lead.anuncio_nome ?? null;
  const deFormulario =
    lead.origem === "formulario_meta" || (lead.canais_entrada ?? []).includes("formulario_meta");
  const deAnuncioWhats = lead.origem === "anuncio_whatsapp";
  const semVendedor = !lead.vendedor_id && !lead.is_teste;

  return (
    <div
      ref={ref}
      {...rest}
      className={cn(
        "group/cartao relative rounded-xl border border-border bg-card p-3.5 text-card-foreground shadow-[var(--shadow-card)] outline-none",
        // Formulário da Meta: faixa colorida à esquerda para achar de relance.
        deFormulario && "border-l-[3px] border-l-info",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        draggable ? "touch-none cursor-grab active:cursor-grabbing" : "cursor-pointer",
        modo === "normal" && "card-hover",
        modo === "fantasma" && "border-dashed opacity-40 saturate-0",
        modo === "clone" &&
          "rotate-[1.5deg] scale-[1.03] cursor-grabbing border-accent shadow-[var(--shadow-pop)] ring-4 ring-accent/20",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar nome={nome === "Sem nome" ? "?" : nome} />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "line-clamp-2 break-words text-[0.875rem] font-semibold leading-snug tracking-[-0.011em]",
              nome === "Sem nome" ? "italic text-muted-foreground" : "text-foreground",
            )}
          >
            {nome}
          </p>
          {lead.telefone ? (
            <p className="mt-0.5 truncate text-[0.78rem] tabular-nums text-muted-foreground">
              {formatTelefone(lead.telefone)}
            </p>
          ) : null}
        </div>
        <span
          title="Pontuação do lead"
          className="num shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[0.72rem] leading-4 text-foreground"
        >
          {lead.score} pts
        </span>
      </div>

      {cidade || lead.metragem_interesse ? (
        <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-[0.78rem] text-muted-foreground">
          {cidade ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{cidade}</span>
            </span>
          ) : null}
          {lead.metragem_interesse ? (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Ruler className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {lead.metragem_interesse} m²
            </span>
          ) : null}
        </div>
      ) : null}

      {respostas ? (
        <p className="mt-2.5 flex min-w-0 items-center gap-1.5 text-[0.75rem] font-medium text-foreground">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-info" aria-hidden />
          <span className="truncate">{respostas}</span>
        </p>
      ) : null}

      {semVisita ? (
        <p className="mt-2.5 flex items-center gap-1.5 rounded-md bg-warning-soft px-2 py-1 text-[0.75rem] font-medium text-warning">
          <CalendarX className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Agendado sem visita marcada
        </p>
      ) : null}

      {campanha && (deFormulario || deAnuncioWhats) ? (
        <p
          className="mt-2.5 flex min-w-0 items-center gap-1.5 text-[0.75rem] text-muted-foreground"
          title={campanha}
        >
          <Megaphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{campanha}</span>
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/70 pt-2.5">
        {lead.interno ? (
          <span title="Contato interno (equipe ou a própria empresa): fora do funil e dos números.">
            <Pill>INTERNO</Pill>
          </span>
        ) : lead.is_teste ? (
          <span title="Lead gerado pelo painel Testar Agente — não é um cliente real.">
            <Pill tone="warning">TESTE</Pill>
          </span>
        ) : null}
        {origem ? (
          deFormulario ? (
            <Pill tone="info">
              <ClipboardList className="h-3 w-3" aria-hidden />
              {origem}
            </Pill>
          ) : deAnuncioWhats ? (
            <Pill tone="accent">{origem}</Pill>
          ) : (
            <Pill>{origem}</Pill>
          )
        ) : null}
        {voltouPor ? (
          <span title={`Última entrada: ${voltouPor}`}>
            <Pill tone="info">+ {voltouPor}</Pill>
          </span>
        ) : null}
        {semVendedor ? (
          <span title="Ainda sem vendedor responsável. Abra a ficha para entregar a alguém.">
            <Pill tone="warning">
              <UserX className="h-3 w-3" aria-hidden />
              Sem vendedor
            </Pill>
          </span>
        ) : null}
        {hasHumanTakeover ? (
          <Pill tone="danger">
            <Headset className="h-3 w-3" aria-hidden />
            Atendimento humano
          </Pill>
        ) : null}
        <span
          className="ml-auto text-[0.72rem] tabular-nums text-muted-foreground"
          title={`Atualizado em ${new Date(lead.updated_at).toLocaleString("pt-BR")}`}
        >
          {tempoRelativo(lead.updated_at)}
        </span>
      </div>
    </div>
  );
});

export function LeadCard({
  lead,
  hasHumanTakeover,
  semVisita,
  onClick,
  draggable = true,
  indice = 0,
}: {
  lead: Lead;
  hasHumanTakeover?: boolean;
  semVisita?: boolean;
  onClick?: () => void;
  draggable?: boolean;
  /** Posição na coluna: define o atraso da entrada em cascata. */
  indice?: number;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
    disabled: !draggable,
  });

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  }

  // O movimento fica por conta do clone (DragOverlay), então o cartão de origem
  // não recebe `transform`: a animação de entrada vive no invólucro.
  return (
    <div className="animate-swap" style={atraso(indice, 40, 360)}>
      <LeadCardView
        ref={setNodeRef}
        lead={lead}
        hasHumanTakeover={hasHumanTakeover}
        semVisita={semVisita}
        draggable={draggable}
        modo={isDragging ? "fantasma" : "normal"}
        {...(draggable ? attributes : { role: "button", tabIndex: 0 })}
        {...(draggable ? listeners : {})}
        onClick={onClick}
        onKeyDown={aoTeclar}
      />
    </div>
  );
}
