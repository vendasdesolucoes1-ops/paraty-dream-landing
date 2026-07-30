// Botão de alternância claro/escuro do dashboard — discreto, apenas ícone.
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardTheme } from "@/hooks/use-dashboard-theme";

export function DashboardThemeToggle() {
  const { theme, toggle } = useDashboardTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
      title={theme === "dark" ? "Modo claro" : "Modo escuro"}
      className="h-8 w-8 text-muted-foreground/60 hover:text-foreground hover:bg-transparent"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
