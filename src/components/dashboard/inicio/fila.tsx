import { forwardRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  FileClock,
  Headset,
  MessageCircle,
  Sparkles,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ds/avatar";
import { Bloco } from "@/components/ds/bloco";
import { Chip } from "@/components/ds/chip";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import type { ItemAcao, MotivoAcao } from "@/lib/dashboard-queries";
import { diasDesde, formatHora, linkWhatsapp, rotuloDia, tempoRelativo } from "@/lib/format";
import { cn } from "@/lib/utils";

const MOTIVOS: Record<
  MotivoAcao,
  { icon: LucideIcon; cor: string; filtro: string; texto: (i: ItemAcao) => string }
> = {
  humano: {
    icon: Headset,
    cor: "text-danger",
    filtro: "Humano",
    texto: () => "Conversa esperando atendimento humano",
  },
  visita_a_confirmar: {
    icon: CalendarClock,
    cor: "text-warning",
    filtro: "Visitas",
    texto: (i) => `Confirmar visita · ${rotuloDia(i.desde)} às ${formatHora(i.desde)}`,
  },
  proposta_parada: {
    icon: FileClock,
    cor: "text-warning",
    filtro: "Propostas",
    texto: () => "Proposta parada, sem movimento",
  },
  qualificado: {
    icon: Sparkles,
    cor: "text-info",
    filtro: "Qualificados",
    texto: () => "Qualificado pela Sophia, sem visita",
  },
};

const ORDEM: MotivoAcao[] = ["humano", "visita_a_confirmar", "proposta_parada", "qualificado"];
const VISIVEIS = 8;

/** Quanto mais antigo, mais forte a cor: o olho acha o que está esquecido. */
function corIdade(desde: string) {
  const d = diasDesde(desde);
  if (d >= 30) return "bg-danger-soft text-danger";
  if (d >= 7) return "bg-warning-soft text-warning";
  return "text-muted-foreground";
}

const ACAO =
  "relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-card hover:text-foreground hover:shadow-sm active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const Fila = forwardRef<HTMLDivElement, { query: UseQueryResult<ItemAcao[]> }>(function Fila(
  { query },
  ref,
) {
  const [filtro, setFiltro] = useState<MotivoAcao | "todos">("todos");
  const [expandida, setExpandida] = useState(false);

  return (
    <div ref={ref} className="scroll-mt-6">
      <Bloco
        titulo="Fila de trabalho"
        descricao="Do mais urgente ao mais antigo. Clique na linha para abrir a ficha."
      >
        <QueryState
          query={query}
          skeleton={<SkeletonRows rows={5} className="h-[3.75rem]" />}
          isEmpty={(d) => d.length === 0}
          empty={
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-center">
              <CheckCircle2 className="h-8 w-8 text-success" aria-hidden />
              <p className="text-sm font-semibold text-foreground">Tudo em dia</p>
              <p className="max-w-xs text-[0.8125rem] text-muted-foreground">
                Nada depende de você agora.
              </p>
            </div>
          }
        >
          {(itens) => {
            const contagem = (m: MotivoAcao) =>
              itens.filter((i) => i.motivo === m).reduce((s, i) => s + (i.quantidade ?? 1), 0);
            const filtrados = [
              ...(filtro === "todos" ? itens : itens.filter((i) => i.motivo === filtro)),
            ].sort((a, b) => ORDEM.indexOf(a.motivo) - ORDEM.indexOf(b.motivo));
            const visiveis = expandida ? filtrados : filtrados.slice(0, VISIVEIS);
            return (
              <>
                <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filtrar fila">
                  <Chip
                    ativo={filtro === "todos"}
                    onClick={() => setFiltro("todos")}
                    contagem={itens.length}
                  >
                    Tudo
                  </Chip>
                  {ORDEM.filter((m) => contagem(m) > 0).map((m) => (
                    <Chip
                      key={m}
                      ativo={filtro === m}
                      onClick={() => setFiltro(m)}
                      contagem={contagem(m)}
                    >
                      {MOTIVOS[m].filtro}
                    </Chip>
                  ))}
                </div>

                <ul
                  key={filtro}
                  className="-mx-3 divide-y divide-border border-y border-border animate-in fade-in-0 duration-200"
                >
                  {visiveis.map((item) => (
                    <Linha key={item.chave} item={item} />
                  ))}
                </ul>

                {filtrados.length > VISIVEIS ? (
                  <button
                    type="button"
                    onClick={() => setExpandida((e) => !e)}
                    className="mt-3 rounded-md px-1 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {expandida ? "Mostrar menos" : `Mostrar mais ${filtrados.length - VISIVEIS}`}
                  </button>
                ) : null}
              </>
            );
          }}
        </QueryState>
      </Bloco>
    </div>
  );
});

function Linha({ item }: { item: ItemAcao }) {
  const m = MOTIVOS[item.motivo];
  const Icon = m.icon;
  const lead = item.lead;
  const wa = lead ? linkWhatsapp(lead.telefone) : null;
  const humano = item.motivo === "humano";
  const titulo = humano
    ? `${item.quantidade ?? 0} ${(item.quantidade ?? 0) === 1 ? "conversa" : "conversas"} com a IA pausada`
    : (lead?.nome ?? "Lead sem nome");

  return (
    <li className="group/linha relative flex items-center gap-4 py-3 transition-colors duration-150 hover:bg-muted/50 focus-within:bg-muted/50 px-3">
      <span
        aria-hidden
        className="absolute inset-y-2 left-0 w-[3px] origin-center scale-y-0 rounded-full bg-accent transition-transform duration-200 ease-[var(--ease-out)] group-hover/linha:scale-y-100 group-focus-within/linha:scale-y-100"
      />
      {humano ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
          <Headset className="h-[18px] w-[18px]" aria-hidden />
        </span>
      ) : (
        <Avatar nome={lead?.nome} className="h-10 w-10 text-[0.8rem]" />
      )}

      <div className="min-w-0 flex-1">
        <Link
          to="/dashboard/crm"
          search={lead ? { lead: lead.id } : undefined}
          className="block truncate text-[0.9375rem] font-semibold leading-tight text-foreground after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
        >
          {titulo}
        </Link>
        <p className="mt-1 flex items-center gap-1.5 truncate text-[0.8125rem] text-muted-foreground">
          <Icon className={cn("h-3.5 w-3.5 shrink-0", m.cor)} aria-hidden />
          <span className="truncate">{m.texto(item)}</span>
        </p>
      </div>

      {item.motivo !== "visita_a_confirmar" ? (
        <span
          className={cn(
            "hidden shrink-0 rounded-md px-2 py-0.5 text-[0.75rem] font-medium tabular-nums sm:inline-block",
            corIdade(item.desde),
          )}
        >
          {tempoRelativo(item.desde)}
        </span>
      ) : null}

      <div className="relative z-10 flex shrink-0 items-center gap-0.5">
        {wa && lead ? (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className={ACAO}
            aria-label={`Abrir conversa com ${lead.nome} no WhatsApp`}
            title="WhatsApp"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
          </a>
        ) : null}
        <Link
          to="/dashboard/crm"
          search={lead ? { lead: lead.id } : undefined}
          className={ACAO}
          aria-label={lead ? `Abrir a ficha de ${lead.nome}` : "Abrir o CRM"}
          title="Abrir no CRM"
        >
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </li>
  );
}
