import { createFileRoute } from "@tanstack/react-router";
import { CreatePostTab } from "@/components/marketing/create-post-tab";
import { PostsGalleryTab } from "@/components/marketing/posts-gallery-tab";
import { BrandAssetsPanel } from "@/components/marketing/brand-assets-panel";
import { AcervoPanel } from "@/components/marketing/acervo-panel";
import { InstagramSettingsCard } from "@/components/marketing/instagram-settings-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoleGuard } from "@/components/dashboard/role-guard";
import { PageHeader } from "@/components/dashboard/page-header";
import { Reveal } from "@/components/ds/reveal";
import { LayoutGrid, Palette, Wand2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/marketing")({
  head: () => ({
    meta: [
      { title: "Marketing — Moradas de Paraty" },
      {
        name: "description",
        content:
          "Imagery Engine do Moradas de Paraty: planeje, gere e publique carrosséis de Instagram no padrão visual do loteamento.",
      },
      { property: "og:title", content: "Marketing — Moradas de Paraty" },
      {
        property: "og:description",
        content: "Planeje, gere e publique conteúdo de Instagram com IA.",
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
      <div className="space-y-8">
        <Reveal ordem={0}>
          <PageHeader
            eyebrow="Operação"
            title="Marketing"
            description="Imagery Engine — do briefing à publicação no Instagram do Moradas de Paraty"
          />
        </Reveal>

        <Reveal ordem={1}>
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
              <TabsTrigger value="marca">
                <Palette className="h-4 w-4" aria-hidden />
                Marca
              </TabsTrigger>
            </TabsList>

            <TabsContent value="criar" className="mt-8">
              <CreatePostTab />
            </TabsContent>

            <TabsContent value="galeria" className="mt-8">
              <PostsGalleryTab />
            </TabsContent>

            <TabsContent value="marca" className="mt-8 space-y-8">
              <AcervoPanel />
              <BrandAssetsPanel />
              <InstagramSettingsCard />
            </TabsContent>
          </Tabs>
        </Reveal>
      </div>
    </RoleGuard>
  );
}
