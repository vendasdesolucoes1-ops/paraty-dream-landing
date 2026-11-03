import type { ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SkeletonRows } from "@/components/ds/query-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/hooks/use-profile";
import { podeAcessar, type Modulo } from "@/lib/acessos";
import type { ProfileRole } from "@/lib/types";

/**
 * Bloqueia o conteúdo de uma rota para papéis sem permissão, cobrindo o acesso
 * direto por URL (esconder o link no menu não protege nada).
 *
 * É defesa de interface: quem impede de fato a leitura dos dados é a RLS. As
 * duas camadas precisam concordar sobre quem pode o quê.
 */
export function RoleGuard({ allow, children }: { allow: ProfileRole[]; children: ReactNode }) {
  const { profile, loading } = useProfile();

  if (loading) {
    return (
      <div className="space-y-6" aria-hidden>
        <Skeleton className="h-14 w-72 rounded-xl" />
        <SkeletonRows rows={1} className="h-64" />
      </div>
    );
  }

  if (!profile || !allow.includes(profile.role)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Acesso restrito"
        description="Esta área é exclusiva para administradores e gestores."
      />
    );
  }

  return <>{children}</>;
}

/**
 * Mesma ideia do RoleGuard, pelo acesso do módulo: o vendedor só abre a tela
 * se ela estiver liberada no cadastro dele. Sem acesso, vai para o CRM.
 */
export function ModuloGuard({ modulo, children }: { modulo: Modulo; children: ReactNode }) {
  const { profile, loading } = useProfile();

  if (loading) {
    return (
      <div className="space-y-6" aria-hidden>
        <Skeleton className="h-14 w-72 rounded-xl" />
        <SkeletonRows rows={1} className="h-64" />
      </div>
    );
  }

  if (!profile) return null;
  if (!podeAcessar(profile, modulo)) return <Navigate to="/dashboard/crm" replace />;
  return <>{children}</>;
}
