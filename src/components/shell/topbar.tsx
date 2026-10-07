import { useRouterState } from "@tanstack/react-router";
import { Menu, Moon, PanelLeft, Search, Sun } from "lucide-react";
import { useState } from "react";
import { useCommandPalette } from "@/components/ds/command-palette";
import { Kbd } from "@/components/ds/kbd";
import { NAV_GROUPS, itemAtivo } from "@/components/dashboard/nav";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDashboardTheme } from "@/hooks/use-dashboard-theme";
import { Marca, ListaNav } from "./app-sidebar";
import { useSidebar } from "./sidebar-context";
import { UserMenu } from "./user-menu";

const ATALHO =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

const BOTAO_ICONE =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-[color,background-color,transform] duration-150 active:scale-95 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Barra superior: menu, onde estou, busca, tema e conta. Fixa no topo; o conteúdo rola por baixo. */
export function Topbar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { aberta, alternar } = useSidebar();
  const { abrir: abrirBusca } = useCommandPalette();
  const { theme, toggle: alternarTema } = useDashboardTheme();
  const [menuMobile, setMenuMobile] = useState(false);

  const atual = NAV_GROUPS.flatMap((g) => g.items.map((item) => ({ grupo: g.label, item }))).find(
    ({ item }) => itemAtivo(item.to, pathname),
  );

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background/85 px-3 backdrop-blur-md sm:px-6">
      {/* Celular: abre o menu em gaveta. */}
      <button
        type="button"
        onClick={() => setMenuMobile(true)}
        aria-label="Abrir menu"
        className={`${BOTAO_ICONE} md:hidden`}
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      <Sheet open={menuMobile} onOpenChange={setMenuMobile}>
        <SheetContent
          side="left"
          className="w-[272px] border-0 bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="flex h-full flex-col">
            <Marca recolhida={false} />
            <ListaNav recolhida={false} aoNavegar={() => setMenuMobile(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop: recolhe e expande a sidebar. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={alternar}
            aria-label={aberta ? "Recolher menu" : "Expandir menu"}
            aria-expanded={aberta}
            className={`${BOTAO_ICONE} hidden md:flex`}
          >
            <PanelLeft className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {aberta ? "Recolher menu" : "Expandir menu"} <Kbd className="ml-1">[</Kbd>
        </TooltipContent>
      </Tooltip>

      <nav aria-label="Você está em" className="hidden min-w-0 items-center gap-2 text-sm sm:flex">
        {atual ? (
          <>
            <span className="text-muted-foreground">{atual.grupo}</span>
            <span aria-hidden className="text-border">
              /
            </span>
            <span className="truncate font-medium text-foreground">{atual.item.label}</span>
          </>
        ) : null}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={abrirBusca}
          className="hidden h-9 w-72 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground shadow-sm transition-[color,border-color,box-shadow] duration-150 hover:border-foreground/25 hover:text-foreground hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex"
        >
          <Search className="h-4 w-4" aria-hidden />
          <span className="flex-1 text-left">Buscar lead ou tela…</span>
          <Kbd>{ATALHO}</Kbd>
          <Kbd>K</Kbd>
        </button>
        <button
          type="button"
          onClick={abrirBusca}
          aria-label="Buscar"
          className={`${BOTAO_ICONE} md:hidden`}
        >
          <Search className="h-[18px] w-[18px]" aria-hidden />
        </button>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={alternarTema}
              aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
              className={BOTAO_ICONE}
            >
              {theme === "dark" ? (
                <Sun className="h-[18px] w-[18px]" aria-hidden />
              ) : (
                <Moon className="h-[18px] w-[18px]" aria-hidden />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>{theme === "dark" ? "Tema claro" : "Tema escuro"}</TooltipContent>
        </Tooltip>

        <UserMenu />
      </div>
    </header>
  );
}
