import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { Kbd } from "@/components/ds/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { itemAtivo, navDoPerfil, type NavItem } from "@/components/dashboard/nav";
import { useProfile } from "@/hooks/use-profile";
import { cn } from "@/lib/utils";
import { ATALHOS_DE_TELA } from "./atalhos";
import { useSidebar } from "./sidebar-context";

/** Lista de navegação. `recolhida` mostra só ícones, com o nome numa dica. */
function ItemNav({
  item,
  recolhida,
  aoNavegar,
}: {
  item: NavItem;
  recolhida: boolean;
  aoNavegar?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ativo = itemAtivo(item.to, pathname);
  const Icon = item.icon;

  const link = (
    <Link
      to={item.to}
      onClick={aoNavegar}
      aria-label={recolhida ? item.label : undefined}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "group/nav relative flex h-10 items-center gap-3 rounded-lg text-sm transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
        recolhida ? "justify-center px-0" : "px-3",
        ativo
          ? "bg-sidebar-active font-medium text-sidebar-foreground"
          : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
      )}
    >
      {ativo ? (
        <span
          aria-hidden
          className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-gold animate-in fade-in-0 slide-in-from-left-1 duration-300"
        />
      ) : null}
      <Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-transform duration-200 ease-[var(--ease-out)] group-hover/nav:scale-110",
          ativo && "text-gold",
        )}
        aria-hidden
      />
      {recolhida ? null : <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (!recolhida) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {ATALHOS_DE_TELA[item.to] ? (
          <Kbd className="ml-2 border-white/20 bg-white/10 text-primary-foreground">
            G {ATALHOS_DE_TELA[item.to].toUpperCase()}
          </Kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

export function ListaNav({ recolhida, aoNavegar }: { recolhida: boolean; aoNavegar?: () => void }) {
  const { profile } = useProfile();
  const grupos = navDoPerfil(profile?.role);
  return (
    <nav
      aria-label="Principal"
      className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 py-2"
    >
      {grupos.map((grupo, i) => (
        <div key={grupo.label} className="space-y-0.5">
          {recolhida ? (
            i > 0 ? (
              <div aria-hidden className="mx-2 mb-2 h-px bg-sidebar-line" />
            ) : null
          ) : (
            <p className="px-3 pb-1 pt-1 text-[0.66rem] font-medium uppercase tracking-[0.16em] text-sidebar-muted/80">
              {grupo.label}
            </p>
          )}
          {grupo.items.map((item) => (
            <ItemNav key={item.to} item={item} recolhida={recolhida} aoNavegar={aoNavegar} />
          ))}
        </div>
      ))}
    </nav>
  );
}

export function Marca({ recolhida }: { recolhida: boolean }) {
  return (
    <Link
      to="/dashboard"
      aria-label="Moradas de Paraty — início"
      className={cn(
        "flex h-14 shrink-0 items-center gap-3 px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
        recolhida && "justify-center px-0",
      )}
    >
      <Logo variante="emblema" className="h-9 w-9 shrink-0" />
      {recolhida ? null : (
        <span className="min-w-0 leading-none">
          <span className="block font-display text-[1.35rem] tracking-wide text-sidebar-foreground">
            Moradas
          </span>
          <span className="mt-1 block text-[0.6rem] uppercase tracking-[0.3em] text-gold">
            de Paraty
          </span>
        </span>
      )}
    </Link>
  );
}

/** Menu lateral do desktop: 248 px aberto, 68 px recolhido (só ícones). */
export function AppSidebar() {
  const { aberta, alternar } = useSidebar();
  const recolhida = !aberta;

  return (
    <aside
      aria-label="Menu lateral"
      className={cn(
        "hidden h-full shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex",
        recolhida ? "w-[68px]" : "w-[248px]",
      )}
    >
      <Marca recolhida={recolhida} />
      <ListaNav recolhida={recolhida} />

      <div className="shrink-0 border-t border-sidebar-line p-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={alternar}
              aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
              aria-expanded={aberta}
              className={cn(
                "flex h-10 w-full items-center gap-3 rounded-lg text-sm text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                recolhida ? "justify-center" : "px-3",
              )}
            >
              {recolhida ? (
                <ChevronsRight className="h-[18px] w-[18px]" aria-hidden />
              ) : (
                <>
                  <ChevronsLeft className="h-[18px] w-[18px]" aria-hidden />
                  <span className="flex-1 text-left">Recolher</span>
                  <Kbd className="border-sidebar-line bg-transparent text-sidebar-muted">[</Kbd>
                </>
              )}
            </button>
          </TooltipTrigger>
          {recolhida ? (
            <TooltipContent side="right">
              Expandir menu <Kbd className="ml-1">[</Kbd>
            </TooltipContent>
          ) : null}
        </Tooltip>
      </div>
    </aside>
  );
}
