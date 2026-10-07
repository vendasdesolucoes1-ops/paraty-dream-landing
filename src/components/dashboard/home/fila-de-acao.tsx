import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  CalendarClock,
  FileClock,
  Headset,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Panel } from "@/components/ds/panel";
import { PanelEmpty, QueryState, SkeletonRows } from "@/components/ds/query-state";
import type { Tone } from "@/components/ds/pill";
import type { ItemAcao, MotivoAcao } from "@/lib/dashboard-queries";
import { formatHora, rotuloDia, tempoRelativo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LeadAcoes } from "./lead-acoes";
import type { UseQueryResult } from "@tanstack/react-query";

const MOTIVOS: Record<
  MotivoAcao,
  { icon: LucideIcon; tone: Tone; texto: (i: ItemAcao) => string }
> = {
  humano: {
    icon: Headset,
    tone: "danger",
    texto: () => "A IA está pausada nessas conversas até alguém responder.",
  },
  visita_a_confirmar: {
    icon: CalendarClock,
    tone: "warning",
    texto: (i) => `Visita com data a confirmar · ${rotuloDia(i.desde)} às ${formatHora(i.desde)}`,
  },
  proposta_parada: {
    icon: FileClock,
    tone: "warning",
    texto: (i) => `Proposta sem movimento ${tempoRelativo(i.desde)}`,
  },
  qualificado: {
    icon: Sparkles,
    tone: "info",
    texto: (i) => `Qualificado pela Sophia ${tempoRelativo(i.desde)} · sem visita marcada`,
  },
};

const ICONE_TOM: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  accent: "bg-accent/15 text-foreground",
};

/** Limite de linhas visíveis; o resto fica no CRM, que é onde se trabalha a lista. */
const MAX_ITENS = 7;

export function FilaDeAcao({ query }: { query: UseQueryResult<ItemAcao[]> }) {
  const total = query.data?.length ?? 0;
  return (
    <Panel
      title="Para agir agora"
      description={
        query.data
          ? total === 0
            ? "Tudo em dia."
            : `${total} ${total === 1 ? "pendência" : "pendências"}, das mais urgentes às mais antigas`
          : "Leads e visitas que dependem de alguém da equipe"
      }
      action={
        <Link
          to="/dashboard/crm"
          className="text-[0.8rem] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Abrir CRM
        </Link>
      }
      bodyClassName="px-2 pb-2"
    >
      <QueryState
        query={query}
        skeleton={
          <div className="px-3 pb-3">
            <SkeletonRows rows={4} className="h-12" />
          </div>
        }
        isEmpty={(d) => d.length === 0}
        empty={
          <div className="px-3 pb-3">
            <PanelEmpty>
              Nada pendente. Leads qualificados sem visita, propostas paradas e visitas com data a
              confirmar aparecem aqui assim que surgirem.
            </PanelEmpty>
          </div>
        }
      >
        {(itens) => (
          <ul className="divide-y divide-border">
            {itens.slice(0, MAX_ITENS).map((item) => {
              const motivo = MOTIVOS[item.motivo];
              const Icon = motivo.icon;
              const titulo =
                item.motivo === "humano"
                  ? `${item.quantidade} ${item.quantidade === 1 ? "conversa espera" : "conversas esperam"} um humano`
                  : (item.lead?.nome ?? "Lead sem nome");
              return (
                <li key={item.chave} className="flex items-center gap-3 rounded-md px-3 py-2.5">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      ICONE_TOM[motivo.tone],
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{titulo}</p>
                    <p className="line-clamp-2 text-[0.78rem] text-muted-foreground">
                      {motivo.texto(item)}
                    </p>
                  </div>
                  {item.lead ? (
                    <LeadAcoes
                      leadId={item.lead.id}
                      nome={item.lead.nome}
                      telefone={item.lead.telefone}
                    />
                  ) : (
                    <Link
                      to="/dashboard/crm"
                      aria-label="Abrir o CRM"
                      title="Abrir o CRM"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ArrowUpRight className="h-4 w-4" aria-hidden />
                    </Link>
                  )}
                </li>
              );
            })}
            {itens.length > MAX_ITENS ? (
              <li className="px-3 pt-2.5 text-[0.78rem] text-muted-foreground">
                E mais {itens.length - MAX_ITENS} no CRM.
              </li>
            ) : null}
          </ul>
        )}
      </QueryState>
    </Panel>
  );
}
