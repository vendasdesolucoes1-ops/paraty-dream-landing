import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Activity, CheckCheck, Gauge, Repeat } from "lucide-react";
import { RoleGuard } from "@/components/dashboard/role-guard";
import { PageHeader } from "@/components/dashboard/page-header";
import { Reveal } from "@/components/ds/reveal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CadenciasLista } from "@/components/dashboard/cadencias/cadencias-lista";
import { AprovacaoEnvios } from "@/components/dashboard/cadencias/aprovacao";
import { MetricasFollowup } from "@/components/dashboard/cadencias/metricas";
import { RegrasEnvioPainel } from "@/components/dashboard/cadencias/regras-envio";
import { useEnviosParaAprovar } from "@/lib/cadencias";

const ABAS = ["cadencias", "aprovacao", "metricas", "regras"] as const;
type Aba = (typeof ABAS)[number];

export const Route = createFileRoute("/dashboard/cadencias")({
  head: () => ({
    meta: [
      { title: "Follow-up — Moradas de Paraty" },
      {
        name: "description",
        content: "Cadências de follow-up, aprovação de mensagens, métricas e regras de envio.",
      },
      { property: "og:title", content: "Follow-up — Moradas de Paraty" },
      {
        property: "og:description",
        content: "Cadências de follow-up, aprovação de mensagens, métricas e regras de envio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // ?aba=metricas: o alerta da fila (vigiar_fila) e links internos abrem direto na aba.
  validateSearch: (search: Record<string, unknown>): { aba?: Aba } => ({
    aba: ABAS.includes(search.aba as Aba) ? (search.aba as Aba) : undefined,
  }),
  component: CadenciasPageProtegida,
});

function CadenciasPage() {
  const { aba = "cadencias" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const aprovacao = useEnviosParaAprovar();
  const pendentes = aprovacao.data?.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-8">
      <Reveal ordem={0}>
        <PageHeader
          eyebrow="Vendas"
          title="Follow-up"
          description="Sequências automáticas de WhatsApp, rascunhos da IA esperando aprovação, resultados por etapa e os limites que protegem o número."
        />
      </Reveal>

      <Reveal ordem={1}>
        <Tabs
          value={aba}
          onValueChange={(v) =>
            navigate({ search: { aba: v === "cadencias" ? undefined : (v as Aba) }, replace: true })
          }
        >
          <TabsList className="max-w-full overflow-x-auto">
            <TabsTrigger value="cadencias">
              <Repeat className="h-4 w-4" aria-hidden />
              Cadências
            </TabsTrigger>
            <TabsTrigger value="aprovacao">
              <CheckCheck className="h-4 w-4" aria-hidden />
              Aprovação
              {pendentes > 0 ? (
                <span className="num ml-1 rounded-full bg-warning-soft px-1.5 text-[0.7rem] leading-[1.15rem] text-warning tabular-nums">
                  {pendentes}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="metricas">
              <Activity className="h-4 w-4" aria-hidden />
              Métricas
            </TabsTrigger>
            <TabsTrigger value="regras">
              <Gauge className="h-4 w-4" aria-hidden />
              Regras de envio
            </TabsTrigger>
          </TabsList>
          <TabsContent value="cadencias" className="mt-8">
            <CadenciasLista />
          </TabsContent>
          <TabsContent value="aprovacao" className="mt-8">
            <AprovacaoEnvios />
          </TabsContent>
          <TabsContent value="metricas" className="mt-8">
            <MetricasFollowup />
          </TabsContent>
          <TabsContent value="regras" className="mt-8">
            <RegrasEnvioPainel />
          </TabsContent>
        </Tabs>
      </Reveal>
    </div>
  );
}

// Cadências, aprovação e regras são da gestão: o bloqueio aqui cobre o acesso
// direto pela URL; a RLS e as funções SQL (sou_gestao) garantem o mesmo no banco.
function CadenciasPageProtegida() {
  return (
    <RoleGuard allow={["admin", "gestor"]}>
      <CadenciasPage />
    </RoleGuard>
  );
}
