import { useNavigate } from "@tanstack/react-router";
import { LogOut, Moon, Sun } from "lucide-react";
import { Avatar } from "@/components/ds/avatar";
import { PAPEL_LABEL } from "@/components/dashboard/nav";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDashboardTheme } from "@/hooks/use-dashboard-theme";
import { useProfile } from "@/hooks/use-profile";
import { supabase } from "@/lib/supabase";

/** Quem está logado: nome, perfil, tema e sair. Saiu da sidebar para ela ficar só com navegação. */
export function UserMenu() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { theme, toggle } = useDashboardTheme();
  const nome = profile?.nome ?? profile?.email ?? "Conta";

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Conta de ${nome}`}
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Avatar nome={nome} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="space-y-0.5 font-normal">
          <p className="truncate text-sm font-medium text-foreground">{nome}</p>
          {profile?.email && profile.email !== nome ? (
            <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
          ) : null}
          {profile ? (
            <p className="text-xs text-muted-foreground">{PAPEL_LABEL[profile.role]}</p>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={toggle} className="gap-2">
          {theme === "dark" ? (
            <Sun className="h-4 w-4" aria-hidden />
          ) : (
            <Moon className="h-4 w-4" aria-hidden />
          )}
          {theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={sair} className="gap-2">
          <LogOut className="h-4 w-4" aria-hidden />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
