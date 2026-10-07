import {
  Calendar,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  Map,
  Megaphone,
  Settings,
  UserCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ProfileRole } from "@/lib/types";

export interface NavItem {
  to:
    | "/dashboard"
    | "/dashboard/crm"
    | "/dashboard/clientes"
    | "/dashboard/agenda"
    | "/dashboard/lotes"
    | "/dashboard/documentos"
    | "/dashboard/ferramentas"
    | "/dashboard/marketing"
    | "/dashboard/configuracoes";
  label: string;
  icon: LucideIcon;
  /** Perfis que NÃO veem este item. */
  hideFor?: ProfileRole[];
  /** Palavras que também levam a este item na busca (⌘K). */
  palavras?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Agrupado pelo fluxo real: vender, operar, configurar. Fonte única da
// navegação — a sidebar e a busca global (⌘K) leem daqui, então um item novo
// aparece nos dois ao mesmo tempo e com as mesmas regras de acesso.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Vendas",
    items: [
      {
        to: "/dashboard",
        label: "Início",
        icon: LayoutDashboard,
        palavras: "dashboard resumo home",
      },
      { to: "/dashboard/crm", label: "CRM", icon: LayoutGrid, palavras: "leads funil kanban" },
      // Carteira de comprador: pós-venda é responsabilidade de admin/gestor.
      {
        to: "/dashboard/clientes",
        label: "Clientes",
        icon: UserCheck,
        hideFor: ["vendedor"],
        palavras: "compradores contratos",
      },
      { to: "/dashboard/agenda", label: "Agenda", icon: Calendar, palavras: "visitas calendário" },
      {
        to: "/dashboard/lotes",
        label: "Lotes",
        icon: Map,
        palavras: "terrenos estoque mapa planta",
      },
    ],
  },
  {
    label: "Operação",
    items: [
      {
        to: "/dashboard/documentos",
        label: "Documentos",
        icon: FileText,
        hideFor: ["vendedor"],
        palavras: "contratos arquivos",
      },
      {
        to: "/dashboard/ferramentas",
        label: "Ferramentas",
        icon: Wrench,
        hideFor: ["vendedor"],
        palavras: "disparo extrator google maps",
      },
      {
        to: "/dashboard/marketing",
        label: "Marketing",
        icon: Megaphone,
        hideFor: ["vendedor"],
        palavras: "instagram posts",
      },
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
        palavras: "equipe whatsapp agente sophia",
      },
    ],
  },
];

export const PAPEL_LABEL: Record<ProfileRole, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  vendedor: "Vendedor",
};

/** Grupos já filtrados pelo perfil de quem está logado. */
export function navDoPerfil(papel: ProfileRole | null | undefined): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !papel || !i.hideFor?.includes(papel)),
  })).filter((g) => g.items.length > 0);
}

export function itemAtivo(to: NavItem["to"], pathname: string): boolean {
  return to === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(to);
}
