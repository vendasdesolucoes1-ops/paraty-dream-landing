/**
 * Componente de navegação lateral do dashboard.
 * Exibe o menu de seções do sistema em uma sidebar fixa no desktop e em um drawer no mobile.
 */
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import {
  LayoutDashboard,
  LayoutGrid,
  Calendar,
  Map,
  FileText,
  Wrench,
  Megaphone,
  Settings,
  UserCheck,
  LogOut,
  Menu,
  Moon,
  Sun,
} from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/use-profile";
import { useDashboardTheme } from "@/hooks/use-dashboard-theme";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

// Agrupado por área de trabalho — antes era uma lista plana de 9 itens sem
// nenhuma hierarquia visual, o que obrigava a ler item por item pra achar
// algo. Os grupos espelham o fluxo real: vender, depois operar, depois
// configurar o sistema em si.
const NAV_GROUPS = [
  {
    label: "Vendas",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/dashboard/crm", label: "CRM", icon: LayoutGrid },
      // Carteira de comprador: pós-venda é responsabilidade de admin/gestor.
      { to: "/dashboard/clientes", label: "Clientes", icon: UserCheck, hideFor: ["vendedor"] },
      { to: "/dashboard/agenda", label: "Agenda", icon: Calendar },
      { to: "/dashboard/lotes", label: "Lotes", icon: Map },
    ],
  },
  {
    label: "Operação",
    items: [
      { to: "/dashboard/documentos", label: "Documentos", icon: FileText, hideFor: ["vendedor"] },
      { to: "/dashboard/ferramentas", label: "Ferramentas", icon: Wrench, hideFor: ["vendedor"] },
      { to: "/dashboard/marketing", label: "Marketing", icon: Megaphone, hideFor: ["vendedor"] },
    ],
  },
  {
    label: "Sistema",
    items: [
      {
        to: "/dashboard/configuracoes",
        label: "Configurações",
        icon: Settings,
        hideFor: ["gestor", "vendedor"],
      },
    ],
  },
] as const;

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile } = useProfile();
  const { theme, toggle: toggleTheme } = useDashboardTheme();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  const navGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (!("hideFor" in item) || !profile) return true;
      return !(item.hideFor as readonly string[]).includes(profile.role);
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col h-full bg-forest-deep text-ivory">
      {/* O logo fica solto sobre o fundo escuro, sem placa. O wordmark do
          arquivo é #0F2A4A, quase idêntico ao bg-forest-deep daqui — sem o
          override de fill ele simplesmente sumiria. Recolorir por CSS mantém o
          SVG original intocado: só a renderização se adapta ao fundo escuro. */}
      {/* Altura fixa e shrink-0: com w-full o logo ocupava ~180px e, somado ao
          menu, estourava a viewport — a sidebar passava a rolar e o rodapé
          ("Modo escuro" / "Sair") ficava fora de vista. Limitar a altura aqui
          é o que devolve o menu inteiro à tela sem depender de scroll. */}
      <div className="shrink-0 px-6 py-5 border-b border-ivory/10">
        <Logo variante="compacto" className="mx-auto h-24 w-auto [&_text]:fill-ivory" />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navGroups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-3 text-[0.65rem] font-medium tracking-[0.18em] uppercase text-ivory/40">
              {group.label}
            </p>
            {group.items.map((item) => {
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
          </div>
        ))}
      </nav>

      <div className="px-3 py-6 border-t border-ivory/10 space-y-1">
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-ivory/80 hover:bg-ivory/10 hover:text-ivory transition-colors"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === "dark" ? "Modo claro" : "Modo escuro"}
        </button>
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

function MobileThemeToggle() {
  const { theme, toggle } = useDashboardTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="text-ivory hover:bg-ivory/10 hover:text-ivory"
      aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
    >
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}

export function DashboardSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* h-full (não min-h-screen): o pai já está travado em h-screen, então
          h-full faz a sidebar ocupar exatamente a viewport e nunca crescer
          com o conteúdo. overflow-y-auto dá scroll próprio se o menu um dia
          ficar mais alto que a tela — sem arrastar o conteúdo principal. */}
      <aside className="hidden md:block w-64 shrink-0 h-full overflow-y-auto">
        <SidebarContent />
      </aside>

      <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between bg-forest-deep text-ivory px-4 py-3">
        <span className="flex items-center gap-2">
          {/* Só o emblema: a barra mobile tem ~44px de altura e o anel dourado
              se destaca sozinho no fundo escuro, sem precisar de placa. */}
          <Logo variante="emblema" className="h-8 w-8" />
          <span className="font-display text-lg">Moradas de Paraty</span>
        </span>
        <div className="flex items-center gap-1">
          <MobileThemeToggle />
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
      </div>
      <div className="md:hidden h-14" />
    </>
  );
}
