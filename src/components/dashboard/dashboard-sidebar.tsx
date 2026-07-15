/**
 * Componente de navegação lateral do dashboard.
 * Exibe o menu de seções do sistema em uma sidebar fixa no desktop e em um drawer no mobile.
 */
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  LayoutGrid,
  Calendar,
  Map,
  FileText,
  Wrench,
  Megaphone,
  Settings,
  LogOut,
  Menu,
} from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/use-profile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/dashboard/crm", label: "CRM", icon: LayoutGrid },
  { to: "/dashboard/agenda", label: "Agenda", icon: Calendar },
  { to: "/dashboard/lotes", label: "Lotes", icon: Map },
  {
    to: "/dashboard/documentos",
    label: "Documentos",
    icon: FileText,
    hideFor: ["vendedor"],
  },
  { to: "/dashboard/ferramentas", label: "Ferramentas", icon: Wrench, hideFor: ["vendedor"] },
  { to: "/dashboard/marketing", label: "Marketing", icon: Megaphone, hideFor: ["vendedor"] },
  {
    to: "/dashboard/configuracoes",
    label: "Configurações",
    icon: Settings,
    hideFor: ["gestor", "vendedor"],
  },
] as const;

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile } = useProfile();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  const navItems = NAV_ITEMS.filter((item) => {
    if (!("hideFor" in item) || !profile) return true;
    return !(item.hideFor as readonly string[]).includes(profile.role);
  });

  return (
    <div className="flex flex-col h-full bg-forest-deep text-ivory">
      <div className="px-6 py-8 border-b border-ivory/10">
        <p className="eyebrow text-gold">Moradas de</p>
        <h1 className="text-2xl font-display text-ivory">Paraty</h1>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.to === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                isActive
                  ? "bg-gold text-forest-deep font-medium"
                  : "text-ivory/80 hover:bg-ivory/10 hover:text-ivory",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-6 border-t border-ivory/10">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-ivory/80 hover:bg-ivory/10 hover:text-ivory transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </div>
  );
}

export function DashboardSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside className="hidden md:block w-64 shrink-0 min-h-screen">
        <SidebarContent />
      </aside>

      <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between bg-forest-deep text-ivory px-4 py-3">
        <span className="font-display text-lg">Moradas de Paraty</span>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-ivory hover:bg-ivory/10 hover:text-ivory"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 border-0">
            <SidebarContent onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
      <div className="md:hidden h-14" />
    </>
  );
}
