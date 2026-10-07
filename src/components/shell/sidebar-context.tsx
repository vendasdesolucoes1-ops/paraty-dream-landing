import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const CHAVE = "moradas-sidebar";
/** Abaixo disto a sidebar nasce recolhida: conteúdo primeiro em tela estreita. */
const LARGURA_PARA_ABRIR = 1280;

function estadoInicial(): boolean {
  try {
    const salvo = window.localStorage.getItem(CHAVE);
    if (salvo === "aberta") return true;
    if (salvo === "fechada") return false;
  } catch {
    // Sem armazenamento: cai no padrão por largura.
  }
  return window.innerWidth >= LARGURA_PARA_ABRIR;
}

const Contexto = createContext<{
  aberta: boolean;
  alternar: () => void;
} | null>(null);

/** Vale a escolha da pessoa; sem escolha, a largura da tela decide. */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [aberta, setAberta] = useState(estadoInicial);

  const alternar = useCallback(() => {
    setAberta((atual) => {
      const proxima = !atual;
      try {
        window.localStorage.setItem(CHAVE, proxima ? "aberta" : "fechada");
      } catch {
        // Sem armazenamento: o menu muda, só não é lembrado depois.
      }
      return proxima;
    });
  }, []);

  // "[" alterna o menu, como em editores e no Linear. Não age enquanto a
  // pessoa digita num campo.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const digitando =
        alvo?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo?.tagName ?? "");
      if (digitando || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "[") {
        e.preventDefault();
        alternar();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [alternar]);

  const valor = useMemo(() => ({ aberta, alternar }), [aberta, alternar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSidebar() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useSidebar deve ser usado dentro de SidebarProvider");
  return ctx;
}
