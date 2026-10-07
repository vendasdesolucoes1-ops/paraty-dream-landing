import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { Avatar } from "@/components/ds/avatar";
import { Panel } from "@/components/ds/panel";
import { Pill, type Tone } from "@/components/ds/pill";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import { Segmented } from "@/components/ds/segmented";
import type { ItemAcao, LeadRecente, MotivoAcao } from "@/lib/dashboard-queries";
import { diasDesde, formatHora, rotuloDia, tempoRelativo } from "@/lib/format";
import { ORIGEM_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/lead-status";
import { cn } from "@/lib/utils";
import { LeadAcoes } from "./lead-acoes";

type Visao = "agir" | "recentes";

const GRUPOS: { motivo: MotivoAcao; titulo: string; tom: Tone }[] = [
  { motivo: "humano", titulo: "Esperando um humano", tom: "danger" },
  { motivo: "visita_a_confirmar", titulo: "Visitas a confirmar", tom: "warning" },
  { motivo: "proposta_parada", titulo: "Propostas paradas", tom: "warning" },
  { motivo: "qualificado", titulo: "Qualificados sem visita", tom: "info" },
];

const PONTO: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  accent: "bg-accent",
};

/** Por grupo, quantas linhas aparecem; o resto fica no CRM, onde se trabalha a lista. */
const MAX_POR_GRUPO = 4;

/** Quanto mais antigo o item, mais forte a cor: o olho acha o que está esquecido. */
function corIdade(desde: string) {
  const d = diasDesde(desde);
  if (d >= 30) return "text-danger";
  if (d >= 7) return "text-warning";
  return "text-muted-foreground";
}

function detalhe(item: ItemAcao): string {
  if (item.motivo === "visita_a_confirmar") {
    return `${rotuloDia(item.desde)} às ${formatHora(item.desde)}`;
  }
  return tempoRelativo(item.desde);
}

export function Prioridades({
  fila,
  recentes,
}: {
  fila: UseQueryResult<ItemAcao[]>;
  recentes: UseQueryResult<LeadRecente[]>;
}) {
  const [visao, setVisao] = useState<Visao>("agir");

  return (
    <Panel
      flush
      title="Prioridades"
      description={
        visao === "agir"
          ? "O que depende de alguém da equipe, dos mais urgentes aos mais antigos"
          : "Os leads que acabaram de chegar"
      }
      action={
        <Segmented<Visao>
          label="Visão da lista"
          value={visao}
          onChange={setVisao}
          options={[
            { value: "agir", label: "Para agir", count: fila.data?.length },
            { value: "recentes", label: "Recentes" },
          ]}
        />
      }
    >
      {visao === "agir" ? <ParaAgir query={fila} /> : <Recentes query={recentes} />}
    </Panel>
  );
}

function Esqueleto({ linhas }: { linhas: number }) {
  return (
    <div className="px-5">
      <SkeletonRows rows={linhas} className="h-11" />
    </div>
  );
}

function ParaAgir({ query }: { query: UseQueryResult<ItemAcao[]> }) {
  return (
    <QueryState
      query={query}
      skeleton={<Esqueleto linhas={5} />}
      erroClassName="mx-5"
      isEmpty={(d) => d.length === 0}
      empty={
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-10 text-center">
          <CheckCircle2 className="h-8 w-8 text-success" aria-hidden />
          <p className="text-sm font-medium text-foreground">Tudo em dia</p>
          <p className="max-w-xs text-[0.82rem] text-muted-foreground">
            Qualificados sem visita, propostas paradas e visitas a confirmar aparecem aqui assim que
            surgirem.
          </p>
        </div>
      }
    >
      {(itens) => (
        <div>
          {GRUPOS.map(({ motivo, titulo, tom }) => {
            const doGrupo = itens.filter((i) => i.motivo === motivo);
            if (doGrupo.length === 0) return null;
            // "humano" é um item só, com a contagem de conversas dentro.
            const total =
              motivo === "humano" ? (doGrupo[0].quantidade ?? doGrupo.length) : doGrupo.length;
            return (
              <div key={motivo}>
                <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-5 py-1.5 first:border-t-0">
                  <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", PONTO[tom])} />
                  <h3 className="font-sans text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {titulo}
                  </h3>
                  <span className="text-[0.72rem] tabular-nums text-muted-foreground">{total}</span>
                </div>
                <ul>
                  {doGrupo.slice(0, MAX_POR_GRUPO).map((item) => (
                    <LinhaAcao key={item.chave} item={item} />
                  ))}
                </ul>
                {doGrupo.length > MAX_POR_GRUPO ? (
                  <Link
                    to="/dashboard/crm"
                    className="block px-5 py-2 text-[0.78rem] text-muted-foreground hover:text-foreground hover:underline"
                  >
                    + {doGrupo.length - MAX_POR_GRUPO} no CRM
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </QueryState>
  );
}

function LinhaAcao({ item }: { item: ItemAcao }) {
  if (item.motivo === "humano") {
    const n = item.quantidade ?? 0;
    return (
      <li>
        <Link
          to="/dashboard/crm"
          className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="min-w-0 flex-1 text-sm text-foreground">
            <strong className="font-semibold tabular-nums">{n}</strong>{" "}
            {n === 1 ? "conversa pausou a IA" : "conversas pausaram a IA"} e{" "}
            {n === 1 ? "aguarda" : "aguardam"} resposta
          </span>
          <span className="text-[0.8rem] font-medium text-foreground">Abrir CRM →</span>
        </Link>
      </li>
    );
  }
  const lead = item.lead;
  return (
    <li className="group/linha flex items-center gap-3 px-5 py-2 transition-colors hover:bg-muted/50 focus-within:bg-muted/50">
      <Avatar nome={lead?.nome} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {lead?.nome ?? "Lead sem nome"}
        </p>
      </div>
      <span className={cn("shrink-0 text-[0.8rem] tabular-nums", corIdade(item.desde))}>
        {detalhe(item)}
      </span>
      {lead ? <LeadAcoes leadId={lead.id} nome={lead.nome} telefone={lead.telefone} /> : null}
    </li>
  );
}

function Recentes({ query }: { query: UseQueryResult<LeadRecente[]> }) {
  return (
    <QueryState
      query={query}
      skeleton={<Esqueleto linhas={5} />}
      erroClassName="mx-5"
      isEmpty={(d) => d.length === 0}
      empty={
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          Nenhum lead recebido ainda.
        </p>
      }
    >
      {(leads) => (
        <ul className="divide-y divide-border border-t border-border">
          {leads.map((l) => (
            <li
              key={l.id}
              className="group/linha flex items-center gap-3 px-5 py-2 transition-colors hover:bg-muted/50 focus-within:bg-muted/50"
            >
              <Avatar nome={l.nome} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{l.nome}</p>
                <p className="truncate text-[0.78rem] text-muted-foreground">
                  {[l.origem ? ORIGEM_LABEL[l.origem] : null, tempoRelativo(l.created_at)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Pill tone={STATUS_TONE[l.status_crm]} dot className="hidden sm:inline-flex">
                {STATUS_LABEL[l.status_crm]}
              </Pill>
              <LeadAcoes leadId={l.id} nome={l.nome} telefone={l.telefone} />
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}
