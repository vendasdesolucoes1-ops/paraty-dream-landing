import { createFileRoute, Outlet } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { CommandPaletteProvider } from "@/components/ds/command-palette";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardThemeProvider } from "@/hooks/use-dashboard-theme";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      return { user: null };
    }

    return { user: data.user };
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  const { user } = Route.useRouteContext();

  if (!user) {
    return <LoginPrompt />;
  }

  return (
    <DashboardThemeProvider>
      <CommandPaletteProvider>
        <TooltipProvider delayDuration={200}>
          {/* Altura travada na viewport (dvh, que acompanha a barra do
              navegador no celular): sidebar e conteúdo rolam cada um por
              conta própria. No celular a barra superior vira uma faixa no
              fluxo, e o conteúdo ocupa o resto. */}
          <div className="flex h-[100dvh] flex-col overflow-hidden bg-background md:flex-row">
            <DashboardSidebar />
            <main className="min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 lg:p-8">
              <Outlet />
            </main>
            <Toaster />
          </div>
        </TooltipProvider>
      </CommandPaletteProvider>
    </DashboardThemeProvider>
  );
}

function LoginPrompt() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-2">
          <p className="eyebrow text-muted-foreground">Acesso restrito</p>
          <h1 className="text-4xl text-primary">Moradas de Paraty</h1>
          <p className="text-muted-foreground">Faça login para acessar o sistema.</p>
        </div>
        <a
          href="/login"
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Ir para login
        </a>
      </div>
      <Toaster />
    </div>
  );
}
