import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/hooks/use-profile";
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
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!profile || !allow.includes(profile.role)) {
    return (
      <Card>
        <CardContent className="p-10 text-center space-y-2">
          <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="font-medium">Acesso restrito</p>
          <p className="text-sm text-muted-foreground">
            Esta área é exclusiva para administradores e gestores.
          </p>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
