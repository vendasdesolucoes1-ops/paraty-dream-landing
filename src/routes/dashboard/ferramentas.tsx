import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/page-header";
import { atraso } from "@/components/ds/reveal";
import { MassDispatcherCard } from "@/components/ferramentas/mass-dispatcher-card";
import { GroupExtractorCard } from "@/components/ferramentas/group-extractor-card";
import { ContactExtractorCard } from "@/components/ferramentas/contact-extractor-card";
import { GooglePlacesCard } from "@/components/ferramentas/google-places-card";

export const Route = createFileRoute("/dashboard/ferramentas")({
  head: () => ({ meta: [
      { title: "Ferramentas — Moradas de Paraty" },
      { name: "description", content: "Gerencie as ferramentas de atendimento do Moradas de Paraty." },
      { property: "og:title", content: "Ferramentas — Moradas de Paraty" },
      { property: "og:description", content: "Gerencie as ferramentas de atendimento do Moradas de Paraty." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ] }),
  component: FerramentasPage,
});

const FERRAMENTAS = [
  MassDispatcherCard,
  GroupExtractorCard,
  ContactExtractorCard,
  GooglePlacesCard,
];

function FerramentasPage() {
  return (
    <div className="space-y-8">
      <div className="animate-rise">
        <PageHeader
          eyebrow="Operação"
          title="Ferramentas"
          description="Automações e extração de dados via WhatsApp"
        />
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {FERRAMENTAS.map((Ferramenta, i) => (
          <li key={i} className="animate-rise" style={atraso(i + 1, 70, 400)}>
            <Ferramenta />
          </li>
        ))}
      </ul>
    </div>
  );
}
