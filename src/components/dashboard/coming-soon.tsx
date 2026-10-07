import { Hourglass } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="py-10">
      <EmptyState
        icon={Hourglass}
        title={`${title} — em breve`}
        description="Este módulo está em desenvolvimento e estará disponível em breve."
      />
    </div>
  );
}
