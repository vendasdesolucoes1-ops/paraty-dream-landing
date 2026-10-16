import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ds/reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { RoleGuard } from "@/components/dashboard/role-guard";
import { FiltroPeriodo } from "@/components/dashboard/relatorios/filtro-periodo";
import { FunilConversao } from "@/components/dashboard/relatorios/funil-conversao";
import { MetaFormDialog } from "@/components/dashboard/relatorios/meta-form-dialog";
import { MetasRealizado } from "@/components/dashboard/relatorios/metas-realizado";
import { TabelaConversao } from "@/components/dashboard/relatorios/tabela-conversao";
import { TempoPorEtapa } from "@/components/dashboard/relatorios/tempo-etapa";
import {
  periodoDoPreset,
  useConversao,
  useMetasRealizado,
  useTempoPorEtapa,
  type Periodo,
  type PresetPeriodo,
} from "@/lib/relatorios";

export const Route = createFileRoute("/dashboard/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — Moradas de Paraty" },
      {
        name: "description",
        content: "Conversão por etapa, por vendedor e por origem, e metas da equipe.",
      },
      { property: "og:title", content: "Relatórios — Moradas de Paraty" },
      {
        property: "og:description",
        content: "Conversão por etapa, por vendedor e por origem, e metas da equipe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  return (
    <RoleGuard allow={["admin", "gestor"]}>
      <Relatorios />
    </RoleGuard>
  );
}

// Separado da página para as consultas só dispararem depois do RoleGuard: um
// vendedor que abre a URL direto não chega a pedir nada ao banco (e, se
// pedisse, as funções SQL só devolveriam a carteira dele).
function Relatorios() {
  const [preset, setPreset] = useState<PresetPeriodo | null>("mes");
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDoPreset("mes"));

  const conversao = useConversao(periodo);
  const tempo = useTempoPorEtapa(periodo);
  const metas = useMetasRealizado(periodo);

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-10">
      <Reveal ordem={0}>
        <PageHeader
          eyebrow="Vendas"
          title="Relatórios"
          description="Como os leads do período avançaram no funil, quanto tempo ficam em cada etapa e como estão as metas."
        />
      </Reveal>

      <Reveal ordem={1}>
        <FiltroPeriodo
          periodo={periodo}
          preset={preset}
          onChange={(p, novoPreset) => {
            setPeriodo(p);
            setPreset(novoPreset);
          }}
        />
      </Reveal>

      <Reveal ordem={2}>
        <FunilConversao query={conversao} />
      </Reveal>

      <Reveal ordem={3}>
        <TabelaConversao query={conversao} />
      </Reveal>

      <Reveal ordem={4}>
        <MetasRealizado
          query={metas}
          acao={
            <MetaFormDialog
              periodoInicial={periodo}
              trigger={
                <Button size="sm">
                  <Plus aria-hidden />
                  Nova meta
                </Button>
              }
            />
          }
        />
      </Reveal>

      <Reveal ordem={5}>
        <TempoPorEtapa query={tempo} />
      </Reveal>
    </div>
  );
}
