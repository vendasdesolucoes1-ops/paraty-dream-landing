import { forwardRef, type HTMLAttributes, type KeyboardEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Headset, MapPin, Ruler } from "lucide-react";
import { Avatar } from "@/components/ds/avatar";
import { Pill } from "@/components/ds/pill";
import { atraso } from "@/components/ds/reveal";
import { cn } from "@/lib/utils";
import { formatTelefone, tempoRelativo } from "@/lib/format";
import { LEAD_ORIGEM_OPTIONS, type Lead } from "@/lib/types";

const ORIGEM_LABELS = Object.fromEntries(LEAD_ORIGEM_OPTIONS.map((o) => [o.value, o.label]));

type VistaProps = {
  lead: Lead;
  hasHumanTakeover?: boolean;
  draggable?: boolean;
  /** "fantasma": o cartão de origem enquanto o clone é arrastado. "clone": o que segue o cursor. */
  modo?: "normal" | "fantasma" | "clone";
} & Omit<HTMLAttributes<HTMLDivElement>, "children">;

/** O cartão em si, sem lógica de arrastar: serve ao Kanban e ao clone do arrasto. */
export const LeadCardView = forwardRef<HTMLDivElement, VistaProps>(function LeadCardView(
  { lead, hasHumanTakeover, draggable = true, modo = "normal", className, ...rest },
  ref,
) {
  const origem = lead.origem ? (ORIGEM_LABELS[lead.origem] ?? lead.origem) : null;

  return (
    <div
      ref={ref}
      {...rest}
      className={cn(
        "group/cartao relative rounded-xl border border-border bg-card p-3.5 text-card-foreground shadow-[var(--shadow-card)] outline-none",
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
        <Avatar nome={lead.nome} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words text-[0.875rem] font-semibold leading-snug tracking-[-0.011em] text-foreground">
            {lead.nome}
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

      {lead.cidade || lead.metragem_interesse ? (
        <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-[0.78rem] text-muted-foreground">
          {lead.cidade ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {lead.cidade}
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

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/70 pt-2.5">
        {lead.is_teste ? (
          <span title="Lead gerado pelo painel Testar Agente — não é um cliente real.">
            <Pill tone="warning">TESTE</Pill>
          </span>
        ) : null}
        {origem ? <Pill>{origem}</Pill> : null}
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
  onClick,
  draggable = true,
  indice = 0,
}: {
  lead: Lead;
  hasHumanTakeover?: boolean;
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
