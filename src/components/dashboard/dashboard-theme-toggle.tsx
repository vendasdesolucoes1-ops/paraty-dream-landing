// Botão de alternância claro/escuro visível no topo do conteúdo do dashboard.
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardTheme } from "@/hooks/use-dashboard-theme";

export function DashboardThemeToggle() {
  const { theme, toggle } = useDashboardTheme();
  return (
    <Button variant="outline" size="sm" onClick={toggle} className="gap-2">
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {theme === "dark" ? "Modo claro" : "Modo escuro"}
    </Button>
  );
}
