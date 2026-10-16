import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { tempoRelativo } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/**
 * Linha de `notifications` como o painel enxerga. `lida_em` veio na migration
 * 20261017000400 e ainda não está nos tipos gerados, por isso o tipo local.
 */
interface Notificacao {
  id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  link: string | null;
  lida_em: string | null;
  created_at: string;
}

// Mais recentes que o sino mostra; o contador conta todas as não lidas.
const LIMITE = 20;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Sino do cabeçalho: avisos das Edge Functions (handoff, lead atribuído, falha de envio…). */
export function Notificacoes({ className }: { className?: string }) {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);

  const chave = ["notificacoes", userId];

  const { data } = useQuery({
    queryKey: chave,
    enabled: !!userId,
    queryFn: async () => {
      // A RLS já limita às próprias; o filtro explícito usa o índice.
      const [lista, naoLidas] = await Promise.all([
        db
          .from("notifications")
          .select("id, type, title, body, link, lida_em, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(LIMITE),
        db
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .is("lida_em", null),
      ]);
      if (lista.error) throw lista.error;
      if (naoLidas.error) throw naoLidas.error;
      return {
        itens: (lista.data ?? []) as Notificacao[],
        naoLidas: (naoLidas.count ?? 0) as number,
      };
    },
  });

  // Tempo real: aviso novo (ou lido em outra aba) atualiza o sino na hora.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notificacoes-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notificacoes", userId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const marcarLidas = useMutation({
    mutationFn: async (ids: string[] | "todas") => {
      let query = db
        .from("notifications")
        .update({ read: true, lida_em: new Date().toISOString() })
        .eq("user_id", userId)
        .is("lida_em", null);
      if (ids !== "todas") query = query.in("id", ids);
      const { error } = await query;
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notificacoes", userId] }),
  });

  if (!userId) return null;

  const itens = data?.itens ?? [];
  const naoLidas = data?.naoLidas ?? 0;
  const rotuloContador = naoLidas > 99 ? "99+" : String(naoLidas);

  function abrir(n: Notificacao) {
    if (!n.lida_em) marcarLidas.mutate([n.id]);
    setAberto(false);
    // Só links internos do painel (ex.: /dashboard/crm?lead=…).
    if (n.link?.startsWith("/")) navigate({ href: n.link });
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={naoLidas > 0 ? `Notificações: ${naoLidas} não lida(s)` : "Notificações"}
          className={cn("relative", className)}
        >
          <Bell className="h-[18px] w-[18px]" aria-hidden />
          {naoLidas > 0 ? (
            <span
              aria-hidden
              className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.625rem] font-semibold leading-none text-destructive-foreground tabular-nums"
            >
              {rotuloContador}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
          <p className="text-sm font-medium text-foreground">Notificações</p>
          <button
            type="button"
            onClick={() => marcarLidas.mutate("todas")}
            disabled={naoLidas === 0 || marcarLidas.isPending}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5" aria-hidden />
            Marcar todas como lidas
          </button>
        </div>

        {itens.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhuma notificação por aqui.
          </p>
        ) : (
          <ul className="max-h-[min(26rem,70vh)] divide-y divide-border/60 overflow-y-auto">
            {itens.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => abrir(n)}
                  className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      n.lida_em ? "bg-transparent" : "bg-accent",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm",
                        n.lida_em ? "text-muted-foreground" : "font-medium text-foreground",
                      )}
                    >
                      {n.title ?? "Aviso"}
                      {n.lida_em ? null : <span className="sr-only"> (não lida)</span>}
                    </span>
                    {n.body ? (
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                        {n.body}
                      </span>
                    ) : null}
                    <span className="mt-1 block text-[0.7rem] text-muted-foreground/80">
                      {tempoRelativo(n.created_at)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
