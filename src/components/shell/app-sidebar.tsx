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

/** Item de navegação. `recolhida` mostra só o ícone, com o nome numa dica. */
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
        "group/nav relative flex h-9 items-center gap-3 rounded-lg text-[0.875rem] transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        recolhida ? "justify-center px-0" : "px-2.5",
        ativo
          ? "bg-sidebar-active font-semibold text-sidebar-foreground shadow-[0_1px_2px_oklch(0.2_0.03_250/0.08),0_0_0_1px_oklch(0.2_0.03_250/0.06)]"
          : "font-medium text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-[17px] w-[17px] shrink-0 transition-transform duration-200 ease-[var(--ease-out)] group-hover/nav:scale-110",
          ativo && "text-accent-foreground",
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
      className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-3 py-3"
    >
      {grupos.map((grupo, i) => (
        <div key={grupo.label} className="space-y-0.5">
          {recolhida ? (
            i > 0 ? (
              <div aria-hidden className="mx-2 mb-2 h-px bg-sidebar-line" />
            ) : null
          ) : (
            <p className="px-2.5 pb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-sidebar-muted/70">
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
        "flex h-16 shrink-0 items-center gap-3 px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        recolhida && "justify-center px-0",
      )}
    >
      <Logo variante="emblema" className="h-9 w-9 shrink-0" />
      {recolhida ? null : (
        <span className="min-w-0 leading-none">
          <span className="block font-display text-[1.4rem] font-medium tracking-wide text-sidebar-foreground">
            Moradas
          </span>
          <span className="mt-1 block text-[0.58rem] font-medium uppercase tracking-[0.3em] text-sidebar-muted">
            de Paraty
          </span>
        </span>
      )}
    </Link>
  );
}

/** Menu lateral do desktop: 236 px aberto, 68 px recolhido (só ícones). Sem fundo próprio: apoia no canvas. */
export function AppSidebar() {
  const { aberta, alternar } = useSidebar();
  const recolhida = !aberta;

  return (
    <aside
      aria-label="Menu lateral"
      className={cn(
        "hidden h-full shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex",
        recolhida ? "w-[68px]" : "w-[236px]",
      )}
    >
      <Marca recolhida={recolhida} />
      <ListaNav recolhida={recolhida} />

      <div className="shrink-0 p-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={alternar}
              aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
              aria-expanded={aberta}
              className={cn(
                "flex h-9 w-full items-center gap-3 rounded-lg text-[0.875rem] font-medium text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                recolhida ? "justify-center" : "px-2.5",
              )}
            >
              {recolhida ? (
                <ChevronsRight className="h-[17px] w-[17px]" aria-hidden />
              ) : (
                <>
                  <ChevronsLeft className="h-[17px] w-[17px]" aria-hidden />
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
