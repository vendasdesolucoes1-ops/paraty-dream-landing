import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  useAgendaProxima,
  useChegadas,
  useEscopo,
  useFilaDeAcao,
  useLotesDisponiveis,
  useResumoLeads,
  useUltimosLeads,
} from "@/lib/dashboard-queries";
import { formatDataLonga, inicioDoDia, saudacao, somarDias, tempoRelativo } from "@/lib/format";
import { Reveal } from "@/components/ds/reveal";
import { KpiCell, KpiStrip } from "@/components/ds/kpi-strip";
import { PageHeader } from "@/components/ds/page-header";
import { Sparkbars } from "@/components/ds/sparkbars";
import { Button } from "@/components/ui/button";
import { LeadFormDialog } from "@/components/dashboard/lead-form-dialog";
import { AgendaProxima } from "@/components/dashboard/home/agenda-proxima";
import { EntradaDeLeads } from "@/components/dashboard/home/entrada-de-leads";
import { Pipeline } from "@/components/dashboard/home/pipeline";
import { Prioridades } from "@/components/dashboard/home/prioridades";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({ meta: [{ title: "Início — Moradas de Paraty" }] }),
  component: DashboardHome,
});

/**
 * Atualiza a tela quando leads ou visitas mudam no banco. Várias mudanças
 * seguidas (a Sophia grava lead, interação e visita em sequência) viram uma
 * única atualização, 1,5 s depois da última.
 */
function useAtualizacaoAoVivo() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const atualizar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => queryClient.invalidateQueries({ queryKey: ["dash"] }), 1500);
    };
    const canal = supabase
      .channel("dashboard-inicio")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, atualizar)
      .on("postgres_changes", { event: "*", schema: "public", table: "visitas" }, atualizar)
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(canal);
    };
  }, [queryClient]);
}

/**
 * "Atualizado há 2 min" + botão para atualizar agora. A tela já se atualiza
 * sozinha (a cada 60 s e ao vivo), então isto serve de confiança: a pessoa vê
 * que o número é recente e, se desconfiar, força a atualização.
 */
function Atualizado({ desde }: { desde: number }) {
  const queryClient = useQueryClient();
  const buscando = useIsFetching({ queryKey: ["dash"] }) > 0;
  const [, forcar] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forcar((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <button
      type="button"
      onClick={() => queryClient.invalidateQueries({ queryKey: ["dash"] })}
      disabled={buscando}
      title="Atualizar agora"
      className="group/atual inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[0.8rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait"
    >
      <RefreshCw
        className={`h-3.5 w-3.5 transition-transform duration-500 group-hover/atual:rotate-90 ${buscando ? "animate-spin" : ""}`}
        aria-hidden
      />
      <span className="tabular-nums" aria-live="polite">
        {buscando
          ? "Atualizando…"
          : desde
            ? `Atualizado ${tempoRelativo(new Date(desde))}`
            : "Atualizar"}
      </span>
    </button>
  );
}

function DashboardHome() {
  const { pronto, escopo, papel, nome } = useEscopo();
  useAtualizacaoAoVivo();

  const resumo = useResumoLeads(escopo, pronto);
  const chegadas = useChegadas(escopo, pronto);
  const agenda = useAgendaProxima(escopo, pronto);
  const fila = useFilaDeAcao(escopo, papel, pronto);
  const ultimos = useUltimosLeads(escopo, pronto);
  const lotes = useLotesDisponiveis(pronto);

  const hoje = inicioDoDia();
  const amanha = somarDias(hoje, 1);
  const visitasHoje = agenda.data?.filter((v) => {
    const t = new Date(v.data_hora).getTime();
    return t >= hoje.getTime() && t < amanha.getTime();
  }).length;
  const pendencias = fila.data?.length;
  const primeiroNome = nome?.trim().split(/\s+/)[0];

  const resumoDoDia = [
    visitasHoje === undefined
      ? null
      : visitasHoje === 0
        ? "nenhuma visita hoje"
        : `${visitasHoje} ${visitasHoje === 1 ? "visita" : "visitas"} hoje`,
    pendencias === undefined
      ? null
      : pendencias === 0
        ? "nada pendente"
        : `${pendencias} ${pendencias === 1 ? "pendência" : "pendências"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-6 lg:space-y-8">
      <Reveal ordem={0}>
        <PageHeader
          title={`${saudacao()}${primeiroNome ? `, ${primeiroNome}` : ""}`}
          description={
            <>
              {formatDataLonga(new Date())}
              {resumoDoDia ? <span className="text-foreground"> · {resumoDoDia}</span> : null}
            </>
          }
          actions={
            <>
              <Atualizado
                desde={Math.max(resumo.dataUpdatedAt, fila.dataUpdatedAt, agenda.dataUpdatedAt)}
              />
              <Button asChild variant="outline" size="sm">
                <Link to="/dashboard/agenda">
                  <CalendarDays className="h-4 w-4" aria-hidden />
                  Agenda
                </Link>
              </Button>
              <LeadFormDialog />
            </>
          }
        />
      </Reveal>

      <Reveal ordem={1}>
        <KpiStrip>
          <KpiCell
            label="Novos hoje"
            to="/dashboard/crm"
            loading={resumo.isPending}
            value={resumo.data?.novosHoje}
            delta={
              resumo.data
                ? { valor: resumo.data.novosHoje - resumo.data.novosOntem, rotulo: "vs. ontem" }
                : null
            }
            destaque={(resumo.data?.novosHoje ?? 0) > 0}
          >
            {chegadas.data ? (
              <Sparkbars
                valores={chegadas.data.slice(-7).map((d) => d.total)}
                label="Leads por dia nos últimos 7 dias"
              />
            ) : null}
          </KpiCell>
          <KpiCell
            label="Em andamento"
            to="/dashboard/crm"
            loading={resumo.isPending}
            value={resumo.data?.emAndamento}
            context={resumo.data ? `de ${resumo.data.total} no total` : undefined}
          />
          <KpiCell
            label="Visitas hoje"
            to="/dashboard/agenda"
            loading={agenda.isPending}
            value={visitasHoje}
            context="na agenda de hoje"
            destaque={(visitasHoje ?? 0) > 0}
          />
          <KpiCell
            label="Lotes disponíveis"
            to="/dashboard/lotes"
            loading={lotes.isPending}
            value={lotes.data}
            context="prontos para vender"
          />
        </KpiStrip>
      </Reveal>

      <Reveal ordem={2}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8 [&>section]:h-full">
            <Prioridades fila={fila} recentes={ultimos} />
          </div>
          <div className="min-w-0 lg:col-span-4 [&>section]:h-full">
            <AgendaProxima query={agenda} />
          </div>
        </div>
      </Reveal>

      <Reveal ordem={3}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7 [&>section]:h-full">
            <Pipeline query={resumo} />
          </div>
          <div className="min-w-0 lg:col-span-5 [&>section]:h-full">
            <EntradaDeLeads chegadas={chegadas} resumo={resumo} />
          </div>
        </div>
      </Reveal>
    </div>
  );
}
