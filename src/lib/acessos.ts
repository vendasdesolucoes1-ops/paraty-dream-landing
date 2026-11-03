import type { Profile, ProfileRole } from "@/lib/types";

/**
 * Telas que dependem de permissão. Admin e gestor veem todas (as restrições
 * de gestão continuam em nav.ts, via `hideFor`). O vendedor vê só o CRM e o
 * que a gestão marcar no cadastro dele (profiles.acessos).
 */
export type Modulo = "inicio" | "crm" | "agenda" | "lotes" | "lotes_3d";

/** Os acessos que podem ser liberados ao vendedor, na ordem da tela. */
export const ACESSOS_OPCIONAIS: {
  valor: Exclude<Modulo, "inicio" | "crm">;
  rotulo: string;
  descricao: string;
}[] = [
  { valor: "agenda", rotulo: "Agenda", descricao: "As visitas agendadas dele." },
  {
    valor: "lotes",
    rotulo: "Lotes",
    descricao: "Quais lotes estão disponíveis, na tabela e na planta. Sem preço e sem edição.",
  },
  { valor: "lotes_3d", rotulo: "Planta 3D", descricao: "A visualização 3D do loteamento." },
];

export const ROTULO_ACESSO = Object.fromEntries(ACESSOS_OPCIONAIS.map((a) => [a.valor, a.rotulo]));

type PerfilDeAcesso = Pick<Profile, "role"> & { acessos?: string[] | null };

export function ehGestao(papel: ProfileRole | null | undefined): boolean {
  return papel === "admin" || papel === "gestor";
}

/** Se a pessoa logada pode abrir a tela do módulo. */
export function podeAcessar(perfil: PerfilDeAcesso | null | undefined, modulo: Modulo): boolean {
  if (!perfil) return false;
  if (ehGestao(perfil.role)) return true;
  if (modulo === "crm") return true;
  if (modulo === "inicio") return false;
  const acessos = perfil.acessos ?? [];
  // A tela de Lotes abre com qualquer uma das duas visões liberada.
  if (modulo === "lotes") return acessos.includes("lotes") || acessos.includes("lotes_3d");
  return acessos.includes(modulo);
}
