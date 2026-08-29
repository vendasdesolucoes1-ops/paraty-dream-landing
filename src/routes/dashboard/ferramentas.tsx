import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/page-header";
import { MassDispatcherCard } from "@/components/ferramentas/mass-dispatcher-card";
import { GroupExtractorCard } from "@/components/ferramentas/group-extractor-card";
import { ContactExtractorCard } from "@/components/ferramentas/contact-extractor-card";
import { GooglePlacesCard } from "@/components/ferramentas/google-places-card";

export const Route = createFileRoute("/dashboard/ferramentas")({
  head: () => ({ meta: [{ title: "Ferramentas — Moradas de Paraty" }] }),
  component: FerramentasPage,
});

function FerramentasPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação"
        title="Ferramentas"
        description="Automações e extração de dados via WhatsApp"
      />

      <div className="space-y-4">
        <MassDispatcherCard />
        <GroupExtractorCard />
        <ContactExtractorCard />
        <GooglePlacesCard />
      </div>
    </div>
  );
}
