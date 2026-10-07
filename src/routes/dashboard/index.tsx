import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
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
import { inicioDoDia, somarDias } from "@/lib/format";
import { Reveal } from "@/components/ds/reveal";
import { Agenda } from "@/components/dashboard/inicio/agenda";
import { Cabecalho } from "@/components/dashboard/inicio/cabecalho";
import { Entrada } from "@/components/dashboard/inicio/entrada";
import { Fila } from "@/components/dashboard/inicio/fila";
import { Foco } from "@/components/dashboard/inicio/foco";
import { Funil } from "@/components/dashboard/inicio/funil";
import { Indicadores } from "@/components/dashboard/inicio/indicadores";
import { Recentes } from "@/components/dashboard/inicio/recentes";

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
  const filaRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-10">
      <Reveal ordem={0}>
        <Cabecalho
          primeiroNome={primeiroNome}
          pendencias={pendencias}
          visitasHoje={visitasHoje}
          novosHoje={resumo.data?.novosHoje}
          atualizadoEm={Math.max(resumo.dataUpdatedAt, fila.dataUpdatedAt, agenda.dataUpdatedAt)}
        />
      </Reveal>

      <Reveal ordem={1}>
        <Foco
          query={fila}
          aoVerFila={() => filaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
      </Reveal>

      <Reveal ordem={2}>
        <Indicadores
          resumo={resumo}
          chegadas={chegadas}
          visitasHoje={visitasHoje}
          carregandoAgenda={agenda.isPending}
          lotes={lotes.data}
          carregandoLotes={lotes.isPending}
        />
      </Reveal>

      <Reveal ordem={3}>
        <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7">
            <Fila ref={filaRef} query={fila} />
          </div>
          <div className="min-w-0 space-y-10 lg:col-span-5">
            <Agenda query={agenda} />
            <Recentes query={ultimos} />
          </div>
        </div>
      </Reveal>

      <Reveal ordem={4}>
        <Funil query={resumo} />
      </Reveal>

      <Reveal ordem={5}>
        <Entrada chegadas={chegadas} resumo={resumo} />
      </Reveal>
    </div>
  );
}
