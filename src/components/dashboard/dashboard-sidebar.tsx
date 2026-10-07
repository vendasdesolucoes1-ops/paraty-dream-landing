/**
 * Navegação lateral do painel: fixa no desktop, gaveta no celular.
 * A lista de itens e as regras de acesso vêm de ./nav (a busca ⌘K lê de lá).
 */
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Menu, Moon, Search, Sun } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ds/avatar";
import { useCommandPalette } from "@/components/ds/command-palette";
import { Kbd } from "@/components/ds/kbd";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PAPEL_LABEL, itemAtivo, navDoPerfil } from "@/components/dashboard/nav";
import { useDashboardTheme } from "@/hooks/use-dashboard-theme";
import { useProfile } from "@/hooks/use-profile";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/** ⌘ no Mac, Ctrl nos outros: só afeta o que está desenhado no botão. */
const ATALHO =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

const ACAO_RODAPE =
  "flex h-9 w-9 items-center justify-center rounded-md text-ivory/70 transition-colors hover:bg-ivory/10 hover:text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold";

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile } = useProfile();
  const { theme, toggle: alternarTema } = useDashboardTheme();
  const { abrir: abrirBusca } = useCommandPalette();

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  const grupos = navDoPerfil(profile?.role);

  return (
    <div className="flex h-full flex-col bg-forest-deep text-ivory">
      <div className="flex shrink-0 items-center gap-3 px-5 pb-4 pt-5">
        <Logo variante="emblema" className="h-10 w-10 shrink-0" />
        <div className="min-w-0 leading-tight">
          <p className="font-display text-xl tracking-wide text-ivory">Moradas</p>
          <p className="text-[0.62rem] uppercase tracking-[0.28em] text-gold">de Paraty</p>
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3">
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            abrirBusca();
          }}
          className="flex w-full items-center gap-2.5 rounded-md border border-ivory/15 bg-ivory/5 px-3 py-2 text-left text-sm text-ivory/65 transition-colors hover:border-ivory/30 hover:bg-ivory/10 hover:text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <Search className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">Buscar…</span>
          <span className="hidden items-center gap-0.5 md:flex">
            <Kbd className="border-ivory/20 bg-transparent text-ivory/60">{ATALHO}</Kbd>
            <Kbd className="border-ivory/20 bg-transparent text-ivory/60">K</Kbd>
          </span>
        </button>
      </div>

      <nav aria-label="Principal" className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {grupos.map((grupo) => (
          <div key={grupo.label} className="space-y-0.5">
            <p className="px-3 pb-1 text-[0.65rem] font-medium uppercase tracking-[0.18em] text-ivory/40">
              {grupo.label}
            </p>
            {grupo.items.map((item) => {
              const Icon = item.icon;
              const ativo = itemAtivo(item.to, pathname);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  aria-current={ativo ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                    ativo
                      ? "bg-ivory/10 font-medium text-ivory"
                      : "text-ivory/70 hover:bg-ivory/5 hover:text-ivory",
                  )}
                >
                  {ativo ? (
                    <span
                      aria-hidden
                      className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-gold"
                    />
                  ) : null}
                  <Icon className={cn("h-4 w-4", ativo && "text-gold")} aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-2 border-t border-ivory/10 px-3 py-3">
        <Avatar nome={profile?.nome ?? profile?.email} className="bg-ivory/10 text-ivory" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm text-ivory">{profile?.nome ?? profile?.email ?? "…"}</p>
          <p className="truncate text-[0.72rem] text-ivory/55">
            {profile ? PAPEL_LABEL[profile.role] : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={alternarTema}
          className={ACAO_RODAPE}
          aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
          title={theme === "dark" ? "Tema claro" : "Tema escuro"}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" aria-hidden />
          ) : (
            <Moon className="h-4 w-4" aria-hidden />
          )}
        </button>
        <button type="button" onClick={sair} className={ACAO_RODAPE} aria-label="Sair" title="Sair">
          <LogOut className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function DashboardSidebar() {
  const [aberta, setAberta] = useState(false);
  const { abrir: abrirBusca } = useCommandPalette();

  return (
    <>
      {/* h-full (não min-h-screen): o pai já está travado em h-screen, então a
          sidebar ocupa exatamente a viewport e nunca cresce com o conteúdo. */}
      <aside className="hidden h-full w-60 shrink-0 md:block">
        <SidebarContent />
      </aside>

      <div className="flex h-14 shrink-0 items-center justify-between bg-forest-deep px-3 text-ivory md:hidden">
        <Sheet open={aberta} onOpenChange={setAberta}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-ivory hover:bg-ivory/10 hover:text-ivory"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 border-0 p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SidebarContent onNavigate={() => setAberta(false)} />
          </SheetContent>
        </Sheet>

        <span className="flex items-center gap-2">
          <Logo variante="emblema" className="h-7 w-7" />
          <span className="font-display text-lg">Moradas de Paraty</span>
        </span>

        <Button
          variant="ghost"
          size="icon"
          onClick={abrirBusca}
          className="text-ivory hover:bg-ivory/10 hover:text-ivory"
          aria-label="Buscar"
        >
          <Search className="h-5 w-5" aria-hidden />
        </Button>
      </div>
    </>
  );
}
