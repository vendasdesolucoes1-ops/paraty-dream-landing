import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Lock, MessageCircle, Search, SearchX, UserCheck, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/hooks/use-profile";
import type { Cliente } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ds/avatar";
import { Chip } from "@/components/ds/chip";
import { Pill } from "@/components/ds/pill";
import { QueryState } from "@/components/ds/query-state";
import { Reveal, atraso } from "@/components/ds/reveal";
import { ClienteFichaSheet } from "@/components/clientes/cliente-ficha-sheet";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ResumoFaixa } from "@/components/documentos/resumo-faixa";
import { formatNumero, formatTelefone, linkWhatsapp } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Moradas de Paraty" }] }),
  component: ClientesPage,
});

type ClienteComContagem = Cliente & { compras: { count: number }[] };

type Filtro = "todos" | "um" | "varios" | "sem";

const FILTROS: { valor: Filtro; rotulo: string; casa: (lotes: number) => boolean }[] = [
  { valor: "todos", rotulo: "Todos", casa: () => true },
  { valor: "um", rotulo: "Um lote", casa: (n) => n === 1 },
  { valor: "varios", rotulo: "Mais de um lote", casa: (n) => n > 1 },
  { valor: "sem", rotulo: "Sem lote", casa: (n) => n === 0 },
];

const COLUNAS =
  "md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.9fr)_minmax(0,1.1fr)_6.5rem_5rem] md:items-center md:gap-5";

const mesAno = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" });

const totalLotes = (c: ClienteComContagem) => c.compras?.[0]?.count ?? 0;

const ACAO =
  "relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-card hover:text-foreground hover:shadow-sm active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ClientesPage() {
  const { profile } = useProfile();
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [selecionado, setSelecionado] = useState<Cliente | null>(null);
  // Última lista carregada: enquanto a busca nova chega, a anterior fica na
  // tela (esmaecida) em vez de piscar o esqueleto a cada tecla.
  const [ultimos, setUltimos] = useState<ClienteComContagem[] | undefined>(undefined);

  const podeVer = profile?.role === "admin" || profile?.role === "gestor";

  const query = useQuery({
    queryKey: ["clientes", search],
    queryFn: async () => {
      let query = supabase.from("clientes").select("*, compras(count)").order("nome");
      if (search.trim()) {
        const termo = search.trim();
        query = query.or(`nome.ilike.%${termo}%,cpf.ilike.%${termo}%,telefone.ilike.%${termo}%`);
      }
      const { data, error } = await query;
      if (error) {
        console.error("[clientes] falha ao carregar:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }
      return data as unknown as ClienteComContagem[];
    },
    enabled: podeVer,
  });

  useEffect(() => {
    if (query.data) setUltimos(query.data);
  }, [query.data]);

  const dados = query.data ?? ultimos;
  const desatualizado = query.data === undefined && dados !== undefined;
  const estado = {
    data: dados,
    isPending: dados === undefined && query.isPending,
    isError: query.isError,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  };

  const resumo = useMemo(() => {
    const lista = dados ?? [];
    return {
      clientes: lista.length,
      lotes: lista.reduce((s, c) => s + totalLotes(c), 0),
      varios: lista.filter((c) => totalLotes(c) > 1).length,
    };
  }, [dados]);

  // O RLS já bloqueia no banco; isto evita a tela de erro para quem não deveria
  // sequer ver o item no menu.
  if (profile && !podeVer) {
    return (
      <EmptyState
        icon={Lock}
        title="Acesso restrito"
        description="Esta área é restrita a administradores e gestores."
      />
    );
  }

  const buscando = search.trim().length > 0;

  return (
    <div className="space-y-8">
      <Reveal ordem={0}>
        <PageHeader
          eyebrow="Pós-venda"
          title="Clientes"
          description="Compradores, seus lotes e a documentação de cada contrato."
        />
      </Reveal>

      <Reveal ordem={1}>
        <ResumoFaixa
          rotulo="Resumo dos clientes"
          carregando={dados === undefined}
          itens={[
            {
              rotulo: "Clientes",
              valor: resumo.clientes,
              rodape: buscando ? "na busca" : "cadastrados",
            },
            { rotulo: "Lotes", valor: resumo.lotes, rodape: "comprados" },
            { rotulo: "Recorrentes", valor: resumo.varios, rodape: "com mais de um lote" },
          ]}
        />
      </Reveal>

      <Reveal ordem={2} className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="relative w-full sm:w-96">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              className="pl-9 pr-9"
              type="search"
              placeholder="Buscar por nome, CPF ou telefone"
              aria-label="Buscar cliente por nome, CPF ou telefone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>

          <div
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
            role="group"
            aria-label="Filtrar clientes por lotes"
          >
            {FILTROS.map((f) => (
              <Chip
                key={f.valor}
                ativo={filtro === f.valor}
                onClick={() => setFiltro(f.valor)}
                contagem={dados ? dados.filter((c) => f.casa(totalLotes(c))).length : undefined}
              >
                {f.rotulo}
              </Chip>
            ))}
          </div>
        </div>

        <div
          className={cn(
            "transition-opacity duration-200",
            desatualizado && "pointer-events-none opacity-60",
          )}
          aria-busy={desatualizado}
        >
          <QueryState
            query={estado}
            skeleton={<EsqueletoLista />}
            isEmpty={(d) => d.length === 0}
            empty={
              <EmptyState
                icon={buscando ? SearchX : UserCheck}
                title={buscando ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
                description={
                  buscando
                    ? "Ajuste os termos da busca e tente novamente."
                    : "Converta um lead em cliente pelo CRM."
                }
              />
            }
          >
            {(lista) => <ListaClientes lista={lista} filtro={filtro} onAbrir={setSelecionado} />}
          </QueryState>
        </div>
      </Reveal>

      <ClienteFichaSheet
        cliente={selecionado}
        open={Boolean(selecionado)}
        onOpenChange={(v) => {
          if (!v) setSelecionado(null);
        }}
      />
    </div>
  );
}

function ListaClientes({
  lista,
  filtro,
  onAbrir,
}: {
  lista: ClienteComContagem[];
  filtro: Filtro;
  onAbrir: (cliente: Cliente) => void;
}) {
  const casa = FILTROS.find((f) => f.valor === filtro)?.casa ?? (() => true);
  const visiveis = lista.filter((c) => casa(totalLotes(c)));

  if (visiveis.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="Nenhum cliente neste filtro"
        description="Escolha outro filtro para ver os demais clientes."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div
        aria-hidden
        className={cn(
          "hidden border-b border-border bg-muted/40 px-6 py-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
          COLUNAS,
        )}
      >
        <span>Cliente</span>
        <span>Contato</span>
        <span>CPF</span>
        <span>Lotes</span>
        <span />
      </div>
      <ul
        key={filtro}
        aria-label="Clientes"
        className="divide-y divide-border animate-in fade-in-0 duration-200"
      >
        {visiveis.map((cliente, i) => (
          <LinhaCliente key={cliente.id} cliente={cliente} indice={i} onAbrir={onAbrir} />
        ))}
      </ul>
      <p className="border-t border-border bg-muted/30 px-4 py-2.5 text-[0.75rem] tabular-nums text-muted-foreground md:px-6">
        {formatNumero(visiveis.length)} {visiveis.length === 1 ? "cliente" : "clientes"}
      </p>
    </div>
  );
}

function LinhaCliente({
  cliente,
  indice,
  onAbrir,
}: {
  cliente: ClienteComContagem;
  indice: number;
  onAbrir: (cliente: Cliente) => void;
}) {
  const lotes = totalLotes(cliente);
  const telefone = formatTelefone(cliente.telefone);
  const wa = linkWhatsapp(cliente.telefone);
  const local = [cliente.cidade, cliente.uf].filter(Boolean).join("/");
  const contato = [telefone, cliente.email].filter(Boolean).join(" · ");

  return (
    <li
      style={atraso(indice, 40, 360)}
      className={cn(
        "animate-swap group/linha relative flex items-center gap-4 px-4 py-3.5 transition-colors duration-150 hover:bg-muted/50 focus-within:bg-muted/50 md:px-6",
        COLUNAS,
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-2 left-0 w-[3px] origin-center scale-y-0 rounded-full bg-accent transition-transform duration-200 ease-[var(--ease-out)] group-hover/linha:scale-y-100 group-focus-within/linha:scale-y-100"
      />

      <div className="flex min-w-0 flex-1 items-center gap-3.5 md:flex-none">
        <Avatar nome={cliente.nome} className="h-10 w-10 text-[0.8rem]" />
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onAbrir(cliente)}
            aria-label={`Abrir a ficha de ${cliente.nome}`}
            className="block max-w-full truncate text-left text-[0.9375rem] font-semibold leading-tight text-foreground after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
          >
            {cliente.nome}
          </button>
          <p className="mt-1 truncate text-[0.8125rem] text-muted-foreground md:hidden">
            {contato || "Sem dados de contato"}
          </p>
          <p className="mt-1 hidden truncate text-[0.8125rem] text-muted-foreground md:block">
            {local || `Cliente desde ${mesAno.format(new Date(cliente.created_at))}`}
          </p>
        </div>
      </div>

      <div className="hidden min-w-0 text-[0.8125rem] md:block">
        {telefone || cliente.email ? (
          <>
            {telefone ? <p className="truncate tabular-nums text-foreground">{telefone}</p> : null}
            {cliente.email ? (
              <p
                className={cn(
                  "truncate text-muted-foreground",
                  telefone && "mt-0.5",
                  !telefone && "text-foreground",
                )}
              >
                {cliente.email}
              </p>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground">Sem dados de contato</span>
        )}
      </div>

      <p className="hidden truncate text-[0.8125rem] tabular-nums text-muted-foreground md:block">
        {cliente.cpf || "—"}
      </p>

      <div className="shrink-0">
        <Pill tone={lotes > 0 ? "success" : "neutral"} dot={lotes > 0}>
          {lotes} lote{lotes === 1 ? "" : "s"}
        </Pill>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-0.5">
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className={ACAO}
            aria-label={`Abrir conversa com ${cliente.nome} no WhatsApp`}
            title="WhatsApp"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
          </a>
        ) : null}
        <ChevronRight
          aria-hidden
          className="h-4 w-4 text-muted-foreground/60 transition-[transform,color] duration-200 ease-[var(--ease-out)] group-hover/linha:translate-x-0.5 group-hover/linha:text-foreground"
        />
      </div>
    </li>
  );
}

function EsqueletoLista() {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]"
      aria-hidden
    >
      <div className="divide-y divide-border">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3.5 px-4 py-3.5 md:px-6">
            <div className="skeleton-shimmer h-10 w-10 shrink-0 rounded-full bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div
                className="skeleton-shimmer h-3.5 rounded bg-muted"
                style={{ width: `${48 - (i % 3) * 8}%` }}
              />
              <div className="skeleton-shimmer h-3 w-1/3 rounded bg-muted" />
            </div>
            <div className="skeleton-shimmer h-5 w-16 shrink-0 rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
