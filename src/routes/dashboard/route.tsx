import { createFileRoute, Outlet } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { SidebarProvider } from "@/components/shell/sidebar-context";
import { Topbar } from "@/components/shell/topbar";
import { CommandPaletteProvider } from "@/components/ds/command-palette";
import { Toaster } from "@/components/ui/sonner";
import { Atalhos } from "@/components/shell/atalhos";
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
      <SidebarProvider>
        <CommandPaletteProvider>
          <TooltipProvider delayDuration={150}>
            {/* Altura travada na viewport (dvh acompanha a barra do navegador no
                celular): a sidebar fica parada e só o conteúdo rola. */}
            <div className="flex h-[100dvh] overflow-hidden bg-canvas">
              <Atalhos />
              <AppSidebar />
              <div className="flex min-w-0 flex-1 flex-col">
                <Topbar />
                <main className="surface-canvas flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-6 sm:px-8 sm:pt-8 lg:px-10 lg:pt-10">
                  <Outlet />
                </main>
              </div>
              <Toaster />
            </div>
          </TooltipProvider>
        </CommandPaletteProvider>
      </SidebarProvider>
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
