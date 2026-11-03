import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  CalendarClock,
  Instagram,
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  Palette,
  SquarePen,
  Wand2,
} from "lucide-react";
import { CreatePostTab } from "@/components/marketing/create-post-tab";
import { PostsGalleryTab } from "@/components/marketing/posts-gallery-tab";
import { ProspectioAgendaTab } from "@/components/marketing/prospectio-agenda-tab";
import { BrandAssetsPanel } from "@/components/marketing/brand-assets-panel";
import { AcervoPanel } from "@/components/marketing/acervo-panel";
import { InstagramSettingsCard } from "@/components/marketing/instagram-settings-card";
import { ABA_PADRAO, ehAbaMarketing, type AbaMarketing } from "@/components/marketing/meta/abas";
import { Anuncios } from "@/components/marketing/meta/anuncios";
import { InstagramMeta } from "@/components/marketing/meta/instagram";
import { Integracao } from "@/components/marketing/meta/integracao";
import { VisaoGeral } from "@/components/marketing/meta/visao-geral";
import { FiltroPeriodo } from "@/components/dashboard/relatorios/filtro-periodo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoleGuard } from "@/components/dashboard/role-guard";
import { PageHeader } from "@/components/dashboard/page-header";
import { Reveal } from "@/components/ds/reveal";
import { useProfile } from "@/hooks/use-profile";
import { incluiHoje } from "@/lib/marketing-calculos";
import { paraDiaISO, periodoDoPreset, type Periodo, type PresetPeriodo } from "@/lib/relatorios";

interface BuscaMarketing {
  aba?: AbaMarketing;
}

export const Route = createFileRoute("/dashboard/marketing")({
  // A aba fica na URL (?aba=anuncios): link compartilhável e "voltar" que funciona.
  validateSearch: (busca: Record<string, unknown>): BuscaMarketing =>
    ehAbaMarketing(busca.aba) ? { aba: busca.aba } : {},
  head: () => ({
    meta: [
      { title: "Marketing — Moradas de Paraty" },
      {
        name: "description",
        content:
          "Marketing do Moradas de Paraty: resultado dos anúncios e do Instagram, criação e agenda de posts.",
      },
      { property: "og:title", content: "Marketing — Moradas de Paraty" },
      {
        property: "og:description",
        content: "Anúncios, Instagram e conteúdo do Moradas de Paraty em um só lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MarketingPage,
});

function MarketingPage() {
  return (
    <RoleGuard allow={["admin", "gestor"]}>
      <Marketing />
    </RoleGuard>
  );
}

const ABAS_COM_PERIODO: AbaMarketing[] = ["visao-geral", "anuncios", "instagram"];

// Separado da página para as consultas só dispararem depois do RoleGuard.
function Marketing() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { aba: abaDaUrl } = Route.useSearch();
  const { profile } = useProfile();
  const ehAdmin = profile?.role === "admin";
  const aba: AbaMarketing =
    abaDaUrl === "integracao" && !ehAdmin ? ABA_PADRAO : (abaDaUrl ?? ABA_PADRAO);

  // Período compartilhado entre Visão geral, Anúncios e Instagram.
  const [preset, setPreset] = useState<PresetPeriodo | null>("30d");
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDoPreset("30d"));

  const irPara = (nova: AbaMarketing) =>
    navigate({ search: nova === ABA_PADRAO ? {} : { aba: nova }, replace: false });

  return (
    <div className="space-y-8">
      <Reveal ordem={0}>
        <PageHeader
          eyebrow="Operação"
          title="Marketing"
          description="Resultado dos anúncios e do Instagram, e a produção de conteúdo do Moradas de Paraty"
        />
      </Reveal>

      <Reveal ordem={1}>
        <Tabs value={aba} onValueChange={(v) => ehAbaMarketing(v) && irPara(v)}>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <TabsList>
              <TabsTrigger value="visao-geral">
                <LayoutDashboard className="h-4 w-4" aria-hidden />
                Visão geral
              </TabsTrigger>
              <TabsTrigger value="anuncios">
                <Megaphone className="h-4 w-4" aria-hidden />
                Anúncios
              </TabsTrigger>
              <TabsTrigger value="instagram">
                <Instagram className="h-4 w-4" aria-hidden />
                Instagram
              </TabsTrigger>
              <TabsTrigger value="conteudo">
                <SquarePen className="h-4 w-4" aria-hidden />
                Conteúdo
              </TabsTrigger>
              <TabsTrigger value="marca">
                <Palette className="h-4 w-4" aria-hidden />
                Marca
              </TabsTrigger>
              {ehAdmin ? (
                <TabsTrigger value="integracao">
                  <Activity className="h-4 w-4" aria-hidden />
                  Integração
                </TabsTrigger>
              ) : null}
            </TabsList>
          </div>

          {ABAS_COM_PERIODO.includes(aba) ? (
            <div className="mt-6">
              <FiltroPeriodo
                periodo={periodo}
                preset={preset}
                onChange={(p, novoPreset) => {
                  setPeriodo(p);
                  setPreset(novoPreset);
                }}
              />
              {incluiHoje(periodo, paraDiaISO(new Date())) ? (
                <p className="mt-2 text-[0.75rem] text-muted-foreground">
                  Inclui hoje, que ainda está em andamento: os números de hoje são parciais.
                </p>
              ) : null}
            </div>
          ) : null}

          <TabsContent value="visao-geral" className="mt-8">
            <VisaoGeral periodo={periodo} irPara={irPara} />
          </TabsContent>

          <TabsContent value="anuncios" className="mt-8">
            <Anuncios periodo={periodo} podeSincronizar={ehAdmin} />
          </TabsContent>

          <TabsContent value="instagram" className="mt-8">
            <InstagramMeta periodo={periodo} />
          </TabsContent>

          <TabsContent value="conteudo" className="mt-8">
            <Conteudo />
          </TabsContent>

          <TabsContent value="marca" className="mt-8 space-y-8">
            <AcervoPanel />
            <BrandAssetsPanel />
            <InstagramSettingsCard />
          </TabsContent>

          {ehAdmin ? (
            <TabsContent value="integracao" className="mt-8">
              <Integracao />
            </TabsContent>
          ) : null}
        </Tabs>
      </Reveal>
    </div>
  );
}

/** Produção de conteúdo (como antes): Imagery Engine, galeria e agenda do ProspectIO. */
function Conteudo() {
  return (
    <Tabs defaultValue="criar">
      <TabsList>
        <TabsTrigger value="criar">
          <Wand2 className="h-4 w-4" aria-hidden />
          Criar post
        </TabsTrigger>
        <TabsTrigger value="galeria">
          <LayoutGrid className="h-4 w-4" aria-hidden />
          Galeria
        </TabsTrigger>
        <TabsTrigger value="agenda">
          <CalendarClock className="h-4 w-4" aria-hidden />
          Agenda
        </TabsTrigger>
      </TabsList>

      <TabsContent value="criar" className="mt-8">
        <CreatePostTab />
      </TabsContent>
      <TabsContent value="galeria" className="mt-8">
        <PostsGalleryTab />
      </TabsContent>
      <TabsContent value="agenda" className="mt-8">
        <ProspectioAgendaTab />
      </TabsContent>
    </Tabs>
  );
}
