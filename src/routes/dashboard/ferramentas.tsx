import { createFileRoute } from "@tanstack/react-router";
import { MassDispatcherCard } from "@/components/ferramentas/mass-dispatcher-card";
import { DispatchHistoryCard } from "@/components/ferramentas/dispatch-history-card";
import { GroupExtractorCard } from "@/components/ferramentas/group-extractor-card";
import { GooglePlacesCard } from "@/components/ferramentas/google-places-card";

export const Route = createFileRoute("/dashboard/ferramentas")({
  head: () => ({ meta: [{ title: "Ferramentas — Moradas de Paraty" }] }),
  component: FerramentasPage,
});

function FerramentasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display text-primary">Ferramentas</h1>
        <p className="text-muted-foreground">Automações e extração de dados via WhatsApp</p>
      </div>

      <div className="space-y-4">
        <MassDispatcherCard />
        <DispatchHistoryCard />
        <GroupExtractorCard />
        <GooglePlacesCard />
      </div>
    </div>
  );
}
