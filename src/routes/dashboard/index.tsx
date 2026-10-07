import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
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
import { formatDataLonga, inicioDoDia, saudacao, somarDias } from "@/lib/format";
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
    <div className="mx-auto w-full max-w-[1360px] space-y-5">
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8 [&>section]:h-full">
          <Prioridades fila={fila} recentes={ultimos} />
        </div>
        <div className="min-w-0 lg:col-span-4 [&>section]:h-full">
          <AgendaProxima query={agenda} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7 [&>section]:h-full">
          <Pipeline query={resumo} />
        </div>
        <div className="min-w-0 lg:col-span-5 [&>section]:h-full">
          <EntradaDeLeads chegadas={chegadas} resumo={resumo} />
        </div>
      </div>
    </div>
  );
}
