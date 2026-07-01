import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      throw redirect({ to: "/login" });
    }

    return { session: data.session };
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
    </div>
  );
}
