import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export const Route = createFileRoute("/dashboard/marketing")({
  head: () => ({ meta: [{ title: "Marketing — Moradas de Paraty" }] }),
  component: () => <ComingSoon title="Marketing" />,
});
