import { createFileRoute } from "@tanstack/react-router";
import { CreatePostTab } from "@/components/marketing/create-post-tab";
import { PostsGalleryTab } from "@/components/marketing/posts-gallery-tab";
import { BrandAssetsPanel } from "@/components/marketing/brand-assets-panel";
import { AcervoPanel } from "@/components/marketing/acervo-panel";
import { InstagramSettingsCard } from "@/components/marketing/instagram-settings-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoleGuard } from "@/components/dashboard/role-guard";

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
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display text-primary">Marketing</h1>
          <p className="text-muted-foreground">
            Imagery Engine — do briefing à publicação no Instagram do Moradas de Paraty
          </p>
        </div>

        <Tabs defaultValue="criar" className="space-y-6">
          <TabsList>
            <TabsTrigger value="criar">Criar post</TabsTrigger>
            <TabsTrigger value="galeria">Galeria</TabsTrigger>
            <TabsTrigger value="marca">Marca</TabsTrigger>
          </TabsList>

          <TabsContent value="criar">
            <CreatePostTab />
          </TabsContent>

          <TabsContent value="galeria">
            <PostsGalleryTab />
          </TabsContent>

          <TabsContent value="marca" className="space-y-6">
            <AcervoPanel />
            <BrandAssetsPanel />
            <InstagramSettingsCard />
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  );
}
