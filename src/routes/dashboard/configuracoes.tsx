import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export const Route = createFileRoute("/dashboard/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Moradas de Paraty" }] }),
  component: () => <ComingSoon title="Configurações" />,
});
