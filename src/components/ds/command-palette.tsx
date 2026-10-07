import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Moon, Sun, User } from "lucide-react";
import { Avatar } from "@/components/ds/avatar";
import { Kbd } from "@/components/ds/kbd";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { navDoPerfil } from "@/components/dashboard/nav";
import { useDashboardTheme } from "@/hooks/use-dashboard-theme";
import { useProfile } from "@/hooks/use-profile";
import { formatTelefone } from "@/lib/format";
import { supabase } from "@/lib/supabase";

const PaletaContext = createContext<{ abrir: () => void } | null>(null);

export function useCommandPalette() {
  const ctx = useContext(PaletaContext);
  if (!ctx) throw new Error("useCommandPalette deve ser usado dentro de CommandPaletteProvider");
  return ctx;
}

/** "João" e "joao" são a mesma busca. */
function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Espera a pessoa parar de digitar antes de consultar o banco. */
function useAtrasado<T>(valor: T, ms: number): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return atrasado;
}

interface LeadBusca {
  id: string;
  nome: string;
  telefone: string | null;
}

/**
 * Busca global do painel (⌘K / Ctrl+K): vai para qualquer tela e acha um lead
 * por nome ou telefone, sem sair de onde está. Quem trabalha o dia inteiro no
 * CRM troca de contexto dezenas de vezes; aqui são duas teclas em vez de
 * navegar menu, abrir o CRM e rolar o Kanban.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [aberta, setAberta] = useState(false);
  const [busca, setBusca] = useState("");
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { theme, toggle } = useDashboardTheme();

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberta((a) => !a);
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  const termo = useAtrasado(busca.trim(), 220);
  const vendedorId = profile?.role === "vendedor" ? (profile.vendedor_id ?? "sem-carteira") : null;

  const leads = useQuery({
    queryKey: ["paleta", "leads", termo, vendedorId],
    enabled: aberta && termo.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<LeadBusca[]> => {
      // Caracteres que têm significado na sintaxe do filtro .or() do PostgREST.
      const limpo = termo.replace(/[,()*%\\]/g, " ").trim();
      const digitos = termo.replace(/\D/g, "");
      const filtros = [`nome.ilike.%${limpo}%`];
      if (digitos.length >= 3) filtros.push(`telefone.ilike.%${digitos}%`);

      let q = supabase
        .from("leads")
        .select("id, nome, telefone")
        .is("deletado_em", null)
        .eq("is_teste", false)
        .or(filtros.join(","))
        .order("created_at", { ascending: false })
        .limit(6);
      if (vendedorId) q = q.eq("vendedor_id", vendedorId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LeadBusca[];
    },
  });

  const paginas = useMemo(() => {
    const itens = navDoPerfil(profile?.role).flatMap((g) => g.items);
    const q = normalizar(busca.trim());
    if (!q) return itens;
    return itens.filter((i) => normalizar(`${i.label} ${i.palavras ?? ""}`).includes(q));
  }, [profile?.role, busca]);

  function fechar() {
    setAberta(false);
    setBusca("");
  }

  const mostrarTema =
    !busca.trim() || normalizar("tema escuro claro modo").includes(normalizar(busca.trim()));

  return (
    <PaletaContext.Provider value={{ abrir: () => setAberta(true) }}>
      {children}
      <Dialog
        open={aberta}
        onOpenChange={(o) => {
          setAberta(o);
          if (!o) setBusca("");
        }}
      >
        <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
          <DialogTitle className="sr-only">Busca e navegação</DialogTitle>
          <DialogDescription className="sr-only">
            Digite para ir a uma tela ou procurar um lead por nome ou telefone.
          </DialogDescription>
          {/* shouldFilter desligado: as páginas são filtradas aqui, com busca
              sem acento, e os leads já chegam filtrados do banco. */}
          <Command
            shouldFilter={false}
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5"
          >
            <CommandInput
              value={busca}
              onValueChange={setBusca}
              placeholder="Ir para uma tela ou buscar lead por nome ou telefone…"
            />
            <CommandList className="max-h-[22rem]">
              {paginas.length === 0 && !leads.data?.length && !leads.isFetching ? (
                <CommandEmpty>Nada encontrado para “{busca.trim()}”.</CommandEmpty>
              ) : null}

              {leads.data && leads.data.length > 0 ? (
                <CommandGroup heading="Leads">
                  {leads.data.map((l) => (
                    <CommandItem
                      key={l.id}
                      value={`lead-${l.id}`}
                      onSelect={() => {
                        fechar();
                        navigate({ to: "/dashboard/crm", search: { lead: l.id } });
                      }}
                      className="gap-3"
                    >
                      <Avatar nome={l.nome} size="sm" />
                      <span className="flex-1 truncate">{l.nome}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatTelefone(l.telefone)}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : termo.length >= 2 && leads.isFetching ? (
                <p className="px-4 py-3 text-xs text-muted-foreground">Buscando leads…</p>
              ) : null}

              {paginas.length > 0 ? (
                <CommandGroup heading="Ir para">
                  {paginas.map((p) => {
                    const Icon = p.icon;
                    return (
                      <CommandItem
                        key={p.to}
                        value={`pagina-${p.to}`}
                        onSelect={() => {
                          fechar();
                          navigate({ to: p.to });
                        }}
                        className="gap-3"
                      >
                        <Icon className="!h-4 !w-4 text-muted-foreground" aria-hidden />
                        {p.label}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ) : null}

              {mostrarTema ? (
                <CommandGroup heading="Ações">
                  <CommandItem
                    value="acao-tema"
                    onSelect={() => {
                      toggle();
                      fechar();
                    }}
                    className="gap-3"
                  >
                    {theme === "dark" ? (
                      <Sun className="!h-4 !w-4 text-muted-foreground" aria-hidden />
                    ) : (
                      <Moon className="!h-4 !w-4 text-muted-foreground" aria-hidden />
                    )}
                    {theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
                  </CommandItem>
                </CommandGroup>
              ) : null}
            </CommandList>
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[0.72rem] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <User className="h-3 w-3" aria-hidden /> Leads por nome ou telefone
              </span>
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> navegar <Kbd>↵</Kbd> abrir <Kbd>esc</Kbd> fechar
              </span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </PaletaContext.Provider>
  );
}
