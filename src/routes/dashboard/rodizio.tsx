import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Bloco } from "@/components/ds/bloco";
import { Reveal } from "@/components/ds/reveal";
import { SkeletonRows } from "@/components/ds/query-state";
import { LinhaAjuste } from "@/components/ajustes/campos";
import { PageHeader } from "@/components/dashboard/page-header";
import { RoleGuard } from "@/components/dashboard/role-guard";
import { FilaRodizio } from "@/components/rodizio/fila-rodizio";
import { DistribuirEspera } from "@/components/rodizio/distribuir-espera";
import { ConsultorPlanoB } from "@/components/rodizio/consultor-plano-b";
import { HistoricoRodizio } from "@/components/rodizio/historico-rodizio";
import { motivoFilaParada, plural } from "@/lib/rodizio-formato";
import { useLigarRodizio, usePainelRodizio } from "@/lib/rodizio";

export const Route = createFileRoute("/dashboard/rodizio")({
  head: () => ({
    meta: [
      { title: "Rodízio — Moradas de Paraty" },
      {
        name: "description",
        content: "Fila de distribuição dos leads novos entre os vendedores.",
      },
      { property: "og:title", content: "Rodízio — Moradas de Paraty" },
      {
        property: "og:description",
        content: "Fila de distribuição dos leads novos entre os vendedores.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RodizioPage,
});

function RodizioPage() {
  return (
    <RoleGuard allow={["admin", "gestor"]}>
      <Rodizio />
    </RoleGuard>
  );
}

function Indicador({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string;
  valor: number;
  detalhe?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 font-display text-2xl tabular-nums">{valor.toLocaleString("pt-BR")}</p>
      {detalhe ? <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p> : null}
    </div>
  );
}

// Separado da página para as consultas só dispararem depois do RoleGuard.
function Rodizio() {
  const { data: painel, isLoading, error } = usePainelRodizio();
  const ligar = useLigarRodizio();

  const naFila = painel?.vendedores.filter((v) => v.situacao === "na_fila").length ?? 0;
  const participam = painel?.vendedores.filter((v) => v.ativo && v.no_rodizio).length ?? 0;
  const alerta = painel ? motivoFilaParada(painel) : null;

  return (
    <div className="space-y-10">
      <Reveal ordem={0}>
        <PageHeader
          eyebrow="Vendas"
          title="Rodízio"
          description="Cada lead novo que chega pelo WhatsApp, pelo site ou pelo Formulário Meta vai para o próximo vendedor da fila. Lead que já tem vendedor continua com ele."
          action={painel ? <DistribuirEspera emEspera={painel.em_espera} /> : null}
        />
      </Reveal>

      {isLoading ? (
        <SkeletonRows rows={3} className="h-24" />
      ) : error || !painel ? (
        <p className="text-[0.875rem] text-danger">
          Não foi possível carregar o rodízio. {error instanceof Error ? error.message : ""}
        </p>
      ) : (
        <>
          <Reveal ordem={1}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Indicador
                rotulo="Na vez agora"
                valor={naFila}
                detalhe={`de ${plural(participam, "participante", "participantes")}`}
              />
              <Indicador
                rotulo="Atribuídos hoje"
                valor={painel.hoje}
                detalhe="rodízio e distribuição"
              />
              <Indicador
                rotulo="Total atribuído"
                valor={painel.total}
                detalhe="desde o início do histórico"
              />
              <Link
                to="/dashboard/crm"
                search={{ vendedor: "sem" }}
                className="rounded-xl transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="Abrir no CRM os leads sem vendedor"
              >
                <Indicador
                  rotulo="Leads em espera"
                  valor={painel.em_espera}
                  detalhe="novos dos últimos 30 dias e qualificados, sem vendedor · ver no CRM"
                />
              </Link>
            </div>
          </Reveal>

          <Reveal ordem={2}>
            <Bloco titulo="Chave do rodízio">
              <div className="rounded-xl border border-border bg-background px-5 py-4">
                <LinhaAjuste
                  titulo={painel.ativo ? "Rodízio ligado" : "Rodízio desligado"}
                  descricao={
                    painel.ativo
                      ? "Cada lead novo vai para o próximo da fila, que é avisado no sino. Ligar não mexe nos leads em espera: para eles, use “Distribuir leads em espera”."
                      : "Os leads novos entram no CRM sem vendedor e só a gestão é avisada."
                  }
                  controle={
                    <Switch
                      checked={painel.ativo}
                      disabled={ligar.isPending}
                      onCheckedChange={(v) => ligar.mutate(v)}
                      aria-label="Rodízio ligado"
                    />
                  }
                />
              </div>
              {alerta ? (
                <p
                  role="alert"
                  className="mt-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-[0.8125rem]"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                  {alerta}
                </p>
              ) : null}
            </Bloco>
          </Reveal>

          <Reveal ordem={3}>
            <Bloco
              titulo="Fila"
              descricao="A ordem em que os vendedores recebem. Quem recebe vai para o fim; quem bateu o limite ou está sem WhatsApp perde a vez."
              divisor
            >
              <FilaRodizio vendedores={painel.vendedores} />
            </Bloco>
          </Reveal>

          <Reveal ordem={4}>
            <Bloco
              titulo="Consultor responsável (plano B)"
              descricao="Recebe a visita e os avisos quando o lead fica sem vendedor. A Sophia só liga com ele cadastrado."
              divisor
            >
              <ConsultorPlanoB vendedores={painel.vendedores} />
            </Bloco>
          </Reveal>

          <Reveal ordem={5}>
            <Bloco
              titulo="Histórico de atribuições"
              descricao="As 50 últimas: rodízio, distribuição, entrega manual e remoção."
              divisor
            >
              <HistoricoRodizio />
            </Bloco>
          </Reveal>
        </>
      )}
    </div>
  );
}
