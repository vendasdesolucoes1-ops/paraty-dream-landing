// Tema claro/escuro só do dashboard, só em memória. De propósito sem
// localStorage/cookie/banco: um F5 sempre volta para claro, e a landing pública
// nunca é afetada porque a classe .dark só é aplicada dentro deste provider.
import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type DashboardTheme = "light" | "dark";

const DashboardThemeContext = createContext<{
  theme: DashboardTheme;
  toggle: () => void;
} | null>(null);

export function DashboardThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<DashboardTheme>("light");
  const toggle = () => setTheme((current) => (current === "light" ? "dark" : "light"));

  return (
    <DashboardThemeContext.Provider value={{ theme, toggle }}>
      {/* bg/text aqui, não só no layout interno: a classe .dark reescreve as
          variáveis --background/--foreground, e precisa de um elemento nesta
          árvore usando essas variáveis para o fundo realmente virar escuro. */}
      <div className={cn("min-h-screen bg-background text-foreground", theme === "dark" && "dark")}>
        {children}
      </div>
    </DashboardThemeContext.Provider>
  );
}

export function useDashboardTheme() {
  const ctx = useContext(DashboardThemeContext);
  if (!ctx) throw new Error("useDashboardTheme deve ser usado dentro de DashboardThemeProvider");
  return ctx;
}
