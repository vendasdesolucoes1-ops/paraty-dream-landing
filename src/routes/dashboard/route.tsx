import { createFileRoute, Outlet } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { DashboardThemeProvider } from "@/hooks/use-dashboard-theme";
import { DashboardThemeToggle } from "@/components/dashboard/dashboard-theme-toggle";

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
      <div className="min-h-screen flex bg-muted/30">
        <DashboardSidebar />
        <main className="flex-1 min-w-0 p-6 md:p-8">
          <div className="hidden md:flex justify-end mb-4">
            <DashboardThemeToggle />
          </div>
          <Outlet />
        </main>
        <Toaster />
      </div>
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
