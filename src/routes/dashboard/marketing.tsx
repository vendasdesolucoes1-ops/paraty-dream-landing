import { createFileRoute } from "@tanstack/react-router";
import { GeneratePostCard } from "@/components/marketing/generate-post-card";
import { PostsHistoryTable } from "@/components/marketing/posts-history-table";
import { InstagramSettingsCard } from "@/components/marketing/instagram-settings-card";

export const Route = createFileRoute("/dashboard/marketing")({
  head: () => ({ meta: [{ title: "Marketing — Moradas de Paraty" }] }),
  component: MarketingPage,
});

function MarketingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display text-primary">Marketing</h1>
        <p className="text-muted-foreground">
          Crie e publique conteúdo para o Instagram do Moradas de Paraty
        </p>
      </div>

      <GeneratePostCard />
      <PostsHistoryTable />
      <InstagramSettingsCard />
    </div>
  );
}
