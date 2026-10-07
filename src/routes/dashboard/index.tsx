import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Layers, Map, UserPlus } from "lucide-react";
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
import { KpiCard } from "@/components/ds/kpi-card";
import { PageHeader } from "@/components/ds/page-header";
import { Button } from "@/components/ui/button";
import { AgendaProxima } from "@/components/dashboard/home/agenda-proxima";
import { Chegadas } from "@/components/dashboard/home/chegadas";
import { FilaDeAcao } from "@/components/dashboard/home/fila-de-acao";
import { Origem } from "@/components/dashboard/home/origem";
import { Pipeline } from "@/components/dashboard/home/pipeline";
import { UltimosLeads } from "@/components/dashboard/home/ultimos-leads";

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
        ? "Nenhuma visita hoje"
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
    <div className="mx-auto w-full max-w-[1280px] space-y-6">
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
              <Link to="/dashboard/agenda">Agenda</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/dashboard/crm">Abrir CRM</Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <KpiCard
          label="Novos hoje"
          icon={UserPlus}
          to="/dashboard/crm"
          loading={resumo.isPending}
          value={resumo.data?.novosHoje}
          context={resumo.data ? `Ontem: ${resumo.data.novosOntem}` : undefined}
          highlight={(resumo.data?.novosHoje ?? 0) > 0}
        />
        <KpiCard
          label="Em andamento"
          icon={Layers}
          to="/dashboard/crm"
          loading={resumo.isPending}
          value={resumo.data?.emAndamento}
          context={resumo.data ? `de ${resumo.data.total} no total` : undefined}
        />
        <KpiCard
          label="Visitas hoje"
          icon={CalendarCheck}
          to="/dashboard/agenda"
          loading={agenda.isPending}
          value={visitasHoje}
          context="Na agenda de hoje"
          highlight={(visitasHoje ?? 0) > 0}
        />
        <KpiCard
          label="Lotes disponíveis"
          icon={Map}
          to="/dashboard/lotes"
          loading={lotes.isPending}
          value={lotes.data}
          context="Prontos para vender"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3 [&>section]:h-full">
          <FilaDeAcao query={fila} />
        </div>
        <div className="min-w-0 lg:col-span-2 [&>section]:h-full">
          <AgendaProxima query={agenda} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3 [&>section]:h-full">
          <Pipeline query={resumo} />
        </div>
        <div className="min-w-0 lg:col-span-2 [&>section]:h-full">
          <Chegadas query={chegadas} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3 [&>section]:h-full">
          <UltimosLeads query={ultimos} />
        </div>
        <div className="min-w-0 lg:col-span-2 [&>section]:h-full">
          <Origem query={resumo} />
        </div>
      </div>
    </div>
  );
}
