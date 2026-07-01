import { createFileRoute } from "@tanstack/react-router";
import { WhatsappInstanceSettings } from "@/components/dashboard/whatsapp-instance-settings";

export const Route = createFileRoute("/dashboard/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Moradas de Paraty" }] }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow text-muted-foreground">Sistema</p>
        <h1 className="text-3xl font-display text-primary">Configurações</h1>
      </div>

      <WhatsappInstanceSettings />
    </div>
  );
}
