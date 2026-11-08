import {
  BarChart3,
  Calendar,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  Map,
  Megaphone,
  Repeat,
  Settings,
  Shuffle,
  UserCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { podeAcessar, type Modulo } from "@/lib/acessos";
import type { Profile, ProfileRole } from "@/lib/types";

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
    | "/dashboard/relatorios"
    | "/dashboard/cadencias"
    | "/dashboard/rodizio"
    | "/dashboard/configuracoes";
  label: string;
  icon: LucideIcon;
  /** Perfis que NÃO veem este item. */
  hideFor?: ProfileRole[];
  /** Tela sujeita aos acessos do vendedor (ver lib/acessos). */
  modulo?: Modulo;
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
        modulo: "inicio",
        palavras: "dashboard resumo home",
      },
      {
        to: "/dashboard/crm",
        label: "CRM",
        icon: LayoutGrid,
        modulo: "crm",
        palavras: "leads funil kanban",
      },
      // Carteira de comprador: pós-venda é responsabilidade de admin/gestor.
      {
        to: "/dashboard/clientes",
        label: "Clientes",
        icon: UserCheck,
        hideFor: ["vendedor"],
        palavras: "compradores contratos",
      },
      {
        to: "/dashboard/agenda",
        label: "Agenda",
        icon: Calendar,
        modulo: "agenda",
        palavras: "visitas calendário",
      },
      {
        to: "/dashboard/lotes",
        label: "Lotes",
        icon: Map,
        modulo: "lotes",
        palavras: "terrenos estoque mapa planta 3d",
      },
      // Conversão da equipe inteira e cadastro de metas: visão de gestão.
      {
        to: "/dashboard/relatorios",
        label: "Relatórios",
        icon: BarChart3,
        hideFor: ["vendedor"],
        palavras: "metas conversão funil desempenho vendedores",
      },
      // Cadências, aprovação dos rascunhos da IA e regras de envio: gestão.
      {
        to: "/dashboard/cadencias",
        label: "Follow-up",
        icon: Repeat,
        hideFor: ["vendedor"],
        palavras: "cadências follow-up aprovação regras de envio fila lembretes",
      },
      // Fila de distribuição dos leads novos: gestão.
      {
        to: "/dashboard/rodizio",
        label: "Rodízio",
        icon: Shuffle,
        hideFor: ["vendedor"],
        palavras: "round robin fila distribuição vendedores leads em espera consultor",
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
        palavras:
          "instagram posts anúncios campanhas meta ads tráfego custo por lead seguidores stories",
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

/**
 * Grupos já filtrados pelo perfil de quem está logado: o papel esconde as
 * telas de gestão e, para o vendedor, os acessos liberam as telas extras.
 */
export function navDoPerfil(
  perfil: (Pick<Profile, "role"> & { acessos?: string[] | null }) | null | undefined,
): NavGroup[] {
  const papel = perfil?.role;
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (!perfil) return !i.hideFor?.length;
      if (papel && i.hideFor?.includes(papel)) return false;
      if (papel === "vendedor") return i.modulo ? podeAcessar(perfil, i.modulo) : false;
      return true;
    }),
  })).filter((g) => g.items.length > 0);
}

export function itemAtivo(to: NavItem["to"], pathname: string): boolean {
  return to === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(to);
}
