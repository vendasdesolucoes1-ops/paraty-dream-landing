import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      throw redirect({ to: "/login" });
    }

    return { user: data.user };
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  return (
    <div className="min-h-screen flex bg-muted/30">
      <DashboardSidebar />
      <main className="flex-1 min-w-0 p-6 md:p-8">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
