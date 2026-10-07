import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { navDoPerfil } from "@/components/dashboard/nav";
import { useProfile } from "@/hooks/use-profile";

/** "g" seguido de uma letra leva à tela (estilo Linear/GitHub). */
export const ATALHOS_DE_TELA: Record<string, string> = {
  "/dashboard": "i",
  "/dashboard/crm": "c",
  "/dashboard/clientes": "l",
  "/dashboard/agenda": "a",
  "/dashboard/lotes": "t",
};

function digitando(alvo: EventTarget | null) {
  const el = alvo as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/**
 * Atalhos de navegação: `g` e, em até 1,2 s, a letra da tela. Só vale para
 * telas a que o perfil tem acesso e nunca enquanto a pessoa está digitando ou
 * com um diálogo aberto.
 */
export function Atalhos() {
  const navigate = useNavigate();
  const { profile } = useProfile();

  useEffect(() => {
    const permitidas = new Set(navDoPerfil(profile?.role).flatMap((g) => g.items.map((i) => i.to)));
    let armado = 0;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || digitando(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const k = e.key.toLowerCase();
      if (Date.now() < armado) {
        armado = 0;
        const destino = Object.entries(ATALHOS_DE_TELA).find(([, letra]) => letra === k)?.[0];
        if (destino && permitidas.has(destino as never)) {
          e.preventDefault();
          navigate({ to: destino });
        }
        return;
      }
      if (k === "g") armado = Date.now() + 1200;
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [navigate, profile?.role]);

  return null;
}
