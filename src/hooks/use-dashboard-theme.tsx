// Tema claro/escuro do painel.
//
// A classe .dark vai no <html>, não numa div do layout. Diálogos, gavetas,
// selects, popovers e toasts são renderizados em portal, direto no <body>,
// fora da árvore do painel: com a classe numa div eles ficavam sempre claros,
// mesmo com o painel escuro. No <html> tudo herda.
//
// A classe só existe enquanto o painel está montado (sai junto com ele), então
// a landing pública nunca fica escura. A escolha fica no navegador de quem
// escolheu; se o armazenamento estiver bloqueado, o tema vale só para a sessão.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type DashboardTheme = "light" | "dark";

const CHAVE = "moradas-painel-tema";

function lerTemaSalvo(): DashboardTheme {
  try {
    return window.localStorage.getItem(CHAVE) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

const DashboardThemeContext = createContext<{
  theme: DashboardTheme;
  toggle: () => void;
} | null>(null);

export function DashboardThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<DashboardTheme>(lerTemaSalvo);

  useEffect(() => {
    const raiz = document.documentElement;
    raiz.classList.toggle("dark", theme === "dark");
    raiz.style.colorScheme = theme;
    return () => {
      raiz.classList.remove("dark");
      raiz.style.colorScheme = "";
    };
  }, [theme]);

  const toggle = useCallback(() => {
    const proximo: DashboardTheme = theme === "dark" ? "light" : "dark";
    try {
      window.localStorage.setItem(CHAVE, proximo);
    } catch {
      // Sem armazenamento: o tema muda, só não é lembrado depois.
    }
    setTheme(proximo);
  }, [theme]);

  return (
    <DashboardThemeContext.Provider value={{ theme, toggle }}>
      <div className="min-h-screen bg-background text-foreground">{children}</div>
    </DashboardThemeContext.Provider>
  );
}

export function useDashboardTheme() {
  const ctx = useContext(DashboardThemeContext);
  if (!ctx) throw new Error("useDashboardTheme deve ser usado dentro de DashboardThemeProvider");
  return ctx;
}
