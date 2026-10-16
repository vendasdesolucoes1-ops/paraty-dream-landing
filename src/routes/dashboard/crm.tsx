import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AlertCircle, Inbox, SearchX, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { LEAD_ORIGEM_OPTIONS, LEAD_STATUS_COLUMNS, type Lead, type LeadStatus } from "@/lib/types";
import {
  TAMANHO_PAGINA_KANBAN,
  leadsDaColuna,
  limparTermoBusca,
  type ContagensKanban,
  type FiltrosKanban,
} from "@/lib/kanban-leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ds/chip";
import { QueryState } from "@/components/ds/query-state";
import { Reveal, atraso } from "@/components/ds/reveal";
import { EtapaDot } from "@/components/crm/etapa-pill";
import { ETAPA_COR } from "@/components/crm/etapas";
import { ExportarLeads } from "@/components/crm/exportar-leads";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useContagem } from "@/hooks/use-contagem";
import { useMontado } from "@/hooks/use-montado";
import { LeadCard, LeadCardView } from "@/components/dashboard/lead-card";
import { LeadFormDialog } from "@/components/dashboard/lead-form-dialog";
import { LeadDetailDrawer } from "@/components/dashboard/lead-detail-drawer";
import { VisitaFormDialog } from "@/components/agenda/visita-form-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { useProfile } from "@/hooks/use-profile";
import {
  aplicarLeadNoCache,
  useColunaKanban,
  useContagensKanban,
  useLeadFicha,
  useLeadsRealtime,
  useResumoKanban,
} from "@/hooks/use-kanban-leads";

export const Route = createFileRoute("/dashboard/crm")({
  head: () => ({
    meta: [
      { title: "CRM — Moradas de Paraty" },
      {
        name: "description",
        content: "Gerencie os leads e o funil de vendas do Moradas de Paraty.",
      },
      { property: "og:title", content: "CRM — Moradas de Paraty" },
      {
        property: "og:description",
        content: "Gerencie os leads e o funil de vendas do Moradas de Paraty.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // ?lead=<id> abre a ficha daquele lead. É o que permite ir da tela inicial,
  // da busca (⌘K) e das notificações direto para a pessoa certa.
  validateSearch: (search: Record<string, unknown>): { lead?: string } => ({
    lead: typeof search.lead === "string" && search.lead ? search.lead : undefined,
  }),
  component: CrmPage,
});

const STATUS_LABEL_MAP = Object.fromEntries(LEAD_STATUS_COLUMNS.map((c) => [c.value, c.label]));

/** Segura o valor até a digitação parar, para não consultar o banco a cada tecla. */
function useAtrasado<T>(valor: T, ms: number): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return atrasado;
}

function KanbanColumn({
  column,
  total,
  vazia,
  indice,
  rodape,
  children,
}: {
  column: { value: LeadStatus; label: string };
  total: number;
  /** Nada carregado e nada mais a carregar: mostra o "Sem leads". */
  vazia: boolean;
  indice: number;
  rodape?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver, active } = useDroppable({ id: column.value });
  const arrastando = !!active;
  const origemDoArrasto = (active?.data.current?.lead as Lead | undefined)?.status_crm;
  // Só vale como destino a coluna que não é a de origem do cartão arrastado.
  const destino = isOver && arrastando && origemDoArrasto !== column.value;

  return (
    <section
      ref={setNodeRef}
      aria-label={`Etapa ${column.label}`}
      style={atraso(indice, 60, 480)}
      className={cn(
        "animate-rise flex w-[17.5rem] shrink-0 snap-start flex-col rounded-2xl border bg-muted/40 transition-[background-color,border-color,box-shadow] duration-200 ease-[var(--ease-out)]",
        destino
          ? "border-accent bg-accent/10 ring-4 ring-accent/20"
          : arrastando
            ? "border-dashed border-border"
            : "border-border/70",
      )}
    >
      <header className="flex items-center gap-2.5 px-3.5 pb-2.5 pt-3.5">
        <EtapaDot etapa={column.value} className="h-2.5 w-2.5" />
        <h2 className="font-sans text-[0.875rem] font-semibold leading-none tracking-[-0.011em] text-foreground">
          {column.label}
        </h2>
        <span className="num ml-auto min-w-6 rounded-full border border-border bg-card px-2 py-0.5 text-center text-[0.72rem] leading-4 text-muted-foreground">
          {total}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-2.5 px-2.5 pb-2.5">
        {children}
        {vazia ? (
          <div
            className={cn(
              "flex min-h-24 flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-6 text-center transition-colors duration-200",
              destino ? "border-accent text-foreground" : "border-border text-muted-foreground",
            )}
          >
            <Inbox className="h-4 w-4 opacity-70" aria-hidden />
            <p className="text-xs">{destino ? "Solte para mover" : "Sem leads"}</p>
          </div>
        ) : destino ? (
          <div className="animate-swap flex h-14 items-center justify-center rounded-xl border border-dashed border-accent text-xs text-foreground">
            Solte para mover
          </div>
        ) : null}
        {rodape}
      </div>
    </section>
  );
}

/** Barra fina com a proporção de leads por etapa; cresce até o valor ao abrir. */
function FunilBarra({ contagens, total }: { contagens: Map<string, number>; total: number }) {
  const pronto = useMontado(120);
  const descricao = LEAD_STATUS_COLUMNS.map(
    (c) => `${c.label} ${contagens.get(c.value) ?? 0}`,
  ).join(", ");
  return (
    <div
      role="img"
      aria-label={`Distribuição dos leads por etapa: ${descricao}`}
      className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-chart-track"
    >
      {LEAD_STATUS_COLUMNS.map((c) => {
        const n = contagens.get(c.value) ?? 0;
        if (n === 0 || total === 0) return null;
        return (
          <span
            key={c.value}
            className={cn(
              "h-full min-w-1 rounded-full transition-[flex-grow] duration-700 ease-[var(--ease-out)]",
              ETAPA_COR[c.value],
            )}
            style={{ flexGrow: pronto ? n : 0 }}
          />
        );
      })}
    </div>
  );
}

function QuadroEsqueleto() {
  return (
    <div className="flex gap-4 overflow-hidden pb-4" aria-hidden>
      {LEAD_STATUS_COLUMNS.map((c, i) => (
        <div
          key={c.value}
          style={atraso(i, 60, 480)}
          className="animate-rise w-[17.5rem] shrink-0 rounded-2xl border border-border/70 bg-muted/40 p-2.5"
        >
          <div className="flex items-center gap-2.5 px-1 pb-3 pt-1">
            <span className={cn("h-2.5 w-2.5 rounded-full opacity-60", ETAPA_COR[c.value])} />
            <span className="text-[0.875rem] font-semibold text-muted-foreground">{c.label}</span>
          </div>
          <div className="space-y-2.5">
            <CartoesEsqueleto quantidade={i % 3 === 0 ? 3 : 2} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CartoesEsqueleto({ quantidade }: { quantidade: number }) {
  return (
    <>
      {Array.from({ length: quantidade }, (_, k) => (
        <div
          key={k}
          aria-hidden
          className="space-y-3 rounded-xl border border-border bg-card p-3.5 shadow-[var(--shadow-card)]"
        >
          <div className="flex items-center gap-3">
            <div className="skeleton-shimmer h-9 w-9 rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton-shimmer h-3 w-3/4 rounded bg-muted" />
              <div className="skeleton-shimmer h-2.5 w-1/2 rounded bg-muted" />
            </div>
          </div>
          <div className="skeleton-shimmer h-2.5 w-2/3 rounded bg-muted" />
        </div>
      ))}
    </>
  );
}

/**
 * Uma etapa do quadro com a própria consulta paginada: 50 cartões por vez e
 * "Carregar mais" no fim. O número do cabeçalho é o total da etapa no banco,
 * não só o que está na tela.
 */
function ColunaDoQuadro({
  column,
  indice,
  filtros,
  habilitada,
  total,
  podeArrastar,
  temAtendimentoHumano,
  onAbrir,
}: {
  column: { value: LeadStatus; label: string };
  indice: number;
  filtros: FiltrosKanban;
  habilitada: boolean;
  total: number | undefined;
  podeArrastar: (lead: Lead) => boolean;
  temAtendimentoHumano: (lead: Lead) => boolean;
  onAbrir: (id: string) => void;
}) {
  const coluna = useColunaKanban(column.value, filtros, habilitada);
  const leads = useMemo(() => leadsDaColuna(coluna.data), [coluna.data]);
  const totalEtapa = Math.max(total ?? 0, leads.length);
  const vazia = !coluna.isLoading && !coluna.isError && leads.length === 0 && !coluna.hasNextPage;

  let rodape: React.ReactNode = null;
  if (coluna.isError && !coluna.isFetching) {
    rodape = (
      <div
        role="alert"
        className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border px-3 py-3 text-xs"
      >
        <span className="flex items-center gap-1.5 text-foreground">
          <AlertCircle className="h-3.5 w-3.5 text-danger" aria-hidden />
          Não foi possível carregar.
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => coluna.refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  } else if (coluna.hasNextPage) {
    rodape = (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={coluna.isFetchingNextPage}
        onClick={() => coluna.fetchNextPage()}
        className="w-full justify-center gap-1.5 text-[0.8125rem]"
      >
        {coluna.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
        <span className="num text-[0.72rem] text-muted-foreground">
          {leads.length} de {totalEtapa}
        </span>
      </Button>
    );
  }

  return (
    <KanbanColumn column={column} total={totalEtapa} vazia={vazia} indice={indice} rodape={rodape}>
      {coluna.isLoading ? <CartoesEsqueleto quantidade={2} /> : null}
      {leads.map((lead, k) => (
        <LeadCard
          key={lead.id}
          lead={lead}
          indice={k % TAMANHO_PAGINA_KANBAN}
          draggable={podeArrastar(lead)}
          hasHumanTakeover={temAtendimentoHumano(lead)}
          onClick={() => onAbrir(lead.id)}
        />
      ))}
    </KanbanColumn>
  );
}

function CrmPage() {
  const queryClient = useQueryClient();
  const { profile } = useProfile();
  const isVendedor = profile?.role === "vendedor";
  const vendedorId = isVendedor ? (profile?.vendedor_id ?? null) : null;
  const habilitado = !isVendedor || !!profile?.vendedor_id;

  // Cada evento realtime mexe só no lead que mudou (ver use-kanban-leads.ts).
  useLeadsRealtime();

  const { data: activeTakeoverPhones } = useQuery({
    queryKey: ["active-takeover-phones"],
    queryFn: async () => {
      // RPC em vez da tabela: ai_agent_human_takeover não é legível pelo
      // painel (só service_role), e a leitura direta voltava sempre vazia.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("takeovers_abertos");
      if (error) throw error;
      const phones = ((data ?? []) as { session_id: string }[]).map((row) => row.session_id);
      return new Set(phones);
    },
  });

  // Leads de teste ficam visíveis por padrão — é justamente para acompanhar a
  // movimentação automática que eles existem. O filtro serve para limpar a
  // visão quando o funil real é o que importa.
  const [mostrarTestes, setMostrarTestes] = useState(true);

  const [busca, setBusca] = useState("");
  const [origemFiltro, setOrigemFiltro] = useState<string>("todas");
  // A busca vai para o banco (as colunas são paginadas lá), então espera a
  // digitação parar. Ignora acento e caixa: "jose" acha "José" (coluna leads.busca).
  const termo = limparTermoBusca(useAtrasado(busca, 300));

  // Números dos chips: contados no banco com o filtro de testes, sem busca
  // nem origem, para mostrarem o que cada escolha traria.
  const resumo = useResumoKanban(vendedorId, mostrarTestes, habilitado);
  const totalTestes = resumo.data?.testes ?? 0;

  const origensDisponiveis = useMemo(
    () =>
      LEAD_ORIGEM_OPTIONS.filter((o) => (resumo.data?.porOrigem[o.value] ?? 0) > 0).map((o) => ({
        ...o,
        total: resumo.data?.porOrigem[o.value] ?? 0,
      })),
    [resumo.data],
  );

  // Se a origem escolhida some (ex.: o filtro de testes a esvaziou), volta a "todas".
  const origemAtiva = origensDisponiveis.some((o) => o.value === origemFiltro)
    ? origemFiltro
    : "todas";
  const filtrosAtivos = busca.trim() !== "" || origemAtiva !== "todas";

  const filtros = useMemo<FiltrosKanban>(
    () => ({
      vendedorId,
      mostrarTestes,
      origem: origemAtiva === "todas" ? null : origemAtiva,
      termo,
    }),
    [vendedorId, mostrarTestes, origemAtiva, termo],
  );

  const contagens = useContagensKanban(filtros, habilitado);
  const contagensPorEtapa = useMemo(
    () =>
      new Map<string, number>(
        LEAD_STATUS_COLUMNS.map((c) => [c.value, contagens.data?.[c.value] ?? 0]),
      ),
    [contagens.data],
  );
  const totalVisivel = useMemo(
    () => Array.from(contagensPorEtapa.values()).reduce((soma, n) => soma + n, 0),
    [contagensPorEtapa],
  );
  const contagemAnimada = useContagem(contagens.data ? totalVisivel : null);

  const { lead: leadDaUrl } = Route.useSearch();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(leadDaUrl ?? null);
  // Abrir outro lead pela URL com a página já aberta (ex.: pela busca).
  useEffect(() => {
    if (leadDaUrl) setSelectedLeadId(leadDaUrl);
  }, [leadDaUrl]);
  const selectedLead = useLeadFicha(selectedLeadId).data ?? null;

  // Lead being routed through the "Agendado" flow: dragged onto that column,
  // but status_crm only flips once VisitaFormDialog's own mutation succeeds.
  const [pendingAgendamentoLead, setPendingAgendamentoLead] = useState<Lead | null>(null);
  const agendamentoSavedRef = useRef(false);

  // Cartão que segue o cursor durante o arrasto (DragOverlay).
  const [leadArrastado, setLeadArrastado] = useState<Lead | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function canDrag(lead: Lead) {
    if (!profile) return false;
    if (profile.role === "admin" || profile.role === "gestor") return true;
    return lead.vendedor_id === profile.vendedor_id;
  }

  async function logStatusChange(lead: Lead, newStatus: LeadStatus) {
    await supabase.from("interacoes").insert({
      lead_id: lead.id,
      tipo: "sistema",
      canal: "crm_kanban",
      conteudo: `Status alterado manualmente para ${STATUS_LABEL_MAP[newStatus] ?? newStatus} por ${profile?.nome ?? "usuário"}`,
    });
  }

  // O movimento otimista passa pelo mesmo caminho do realtime: tira o cartão
  // da coluna de origem, põe na de destino e ajusta as duas contagens.
  function moveLeadOptimistically(lead: Lead, newStatus: LeadStatus) {
    aplicarLeadNoCache(queryClient, lead.id, { ...lead, status_crm: newStatus }, lead);
  }

  function revertLead(lead: Lead, movedStatus: LeadStatus) {
    aplicarLeadNoCache(queryClient, lead.id, lead, { ...lead, status_crm: movedStatus });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const lead = active.data.current?.lead as Lead | undefined;
    if (!lead) return;

    const newStatus = over.id as LeadStatus;
    const originalStatus = lead.status_crm;
    if (newStatus === originalStatus) return;

    if (!canDrag(lead)) {
      toast.error("Você não tem permissão para mover este lead.");
      return;
    }

    if (newStatus === "agendado") {
      // Optimistic move; only persisted once the visita is actually saved.
      moveLeadOptimistically(lead, newStatus);
      agendamentoSavedRef.current = false;
      setPendingAgendamentoLead(lead);
      return;
    }

    moveLeadOptimistically(lead, newStatus);

    try {
      let salvo: Lead | undefined;
      if (newStatus === "qualificado" && !lead.vendedor_id) {
        const { data: nextVendedorId, error: rrError } = await supabase.rpc(
          "get_next_round_robin_salesperson",
        );
        if (rrError) throw rrError;
        const { data, error } = await supabase
          .from("leads")
          .update({ status_crm: newStatus, vendedor_id: nextVendedorId })
          .eq("id", lead.id)
          .select();
        if (error) throw error;
        salvo = data?.[0] as Lead | undefined;
      } else {
        const { data, error } = await supabase
          .from("leads")
          .update({ status_crm: newStatus })
          .eq("id", lead.id)
          .select();
        if (error) throw error;
        salvo = data?.[0] as Lead | undefined;
      }

      // Em vez de recarregar o quadro, aplica a linha que o banco devolveu
      // (traz o vendedor sorteado no rodízio, por exemplo).
      if (salvo) {
        aplicarLeadNoCache(queryClient, lead.id, salvo, { ...lead, status_crm: newStatus });
      }
      await logStatusChange(lead, newStatus);
    } catch {
      revertLead(lead, newStatus);
      toast.error("Erro ao atualizar o status do lead.");
    }
  }

  function handleAgendamentoDialogChange(open: boolean) {
    if (!open) {
      if (pendingAgendamentoLead && !agendamentoSavedRef.current) {
        // Dialog closed without saving — revert the optimistic move.
        revertLead(pendingAgendamentoLead, "agendado");
      }
      // Salvo, o VisitaFormDialog já invalida ["leads"] e o realtime traz a
      // mudança; sem salvar, desfazer o movimento otimista basta.
      setPendingAgendamentoLead(null);
    }
  }

  async function handleAgendamentoSaved() {
    agendamentoSavedRef.current = true;
    if (pendingAgendamentoLead) {
      await logStatusChange(pendingAgendamentoLead, "agendado");
    }
  }

  return (
    <div className="space-y-6">
      <Reveal ordem={0}>
        <PageHeader
          eyebrow="Relacionamento"
          title="CRM"
          description="Arraste os cartões entre as etapas do funil ou clique para abrir a ficha do lead."
          action={
            <>
              <ExportarLeads filtros={{ busca, origem: origemAtiva, mostrarTestes }} />
              <LeadFormDialog />
            </>
          }
        />
      </Reveal>

      <Reveal ordem={1} className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
          <div className="relative w-full sm:w-72">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, telefone ou cidade"
              aria-label="Buscar lead"
              autoComplete="off"
              className="pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
            />
            {busca ? (
              <button
                type="button"
                onClick={() => setBusca("")}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>

          {origensDisponiveis.length > 1 ? (
            <div role="group" aria-label="Filtrar por origem" className="flex flex-wrap gap-2">
              <Chip
                ativo={origemAtiva === "todas"}
                onClick={() => setOrigemFiltro("todas")}
                contagem={resumo.data?.todas}
              >
                Todas
              </Chip>
              {origensDisponiveis.map((o) => (
                <Chip
                  key={o.value}
                  ativo={origemAtiva === o.value}
                  onClick={() => setOrigemFiltro(o.value)}
                  contagem={o.total}
                >
                  {o.label}
                </Chip>
              ))}
            </div>
          ) : null}

          <div className="ml-auto flex flex-wrap items-center gap-3">
            {totalTestes > 0 ? (
              <Chip
                ativo={mostrarTestes}
                onClick={() => setMostrarTestes((v) => !v)}
                contagem={totalTestes}
              >
                Mostrar leads de teste
              </Chip>
            ) : null}
            <p className="text-[0.8125rem] text-muted-foreground">
              <span aria-hidden className="num text-[0.9375rem] text-foreground">
                {contagemAnimada ?? totalVisivel}
              </span>
              <span className="sr-only">{totalVisivel}</span>{" "}
              {totalVisivel === 1 ? "lead no funil" : "leads no funil"}
            </p>
          </div>
        </div>
        <FunilBarra contagens={contagensPorEtapa} total={totalVisivel} />
      </Reveal>

      <QueryState
        query={{
          data: contagens.data ?? ({} as ContagensKanban),
          isPending: contagens.isLoading,
          isError: contagens.isError,
          refetch: contagens.refetch,
          isRefetching: contagens.isRefetching,
        }}
        skeleton={<QuadroEsqueleto />}
      >
        {() =>
          totalVisivel === 0 && filtrosAtivos ? (
            <EmptyState
              icon={SearchX}
              title="Nenhum lead encontrado"
              description="Nenhum lead combina com a busca e os filtros atuais."
              action={
                <button
                  type="button"
                  onClick={() => {
                    setBusca("");
                    setOrigemFiltro("todas");
                  }}
                  className="inline-flex h-9 items-center rounded-lg border border-input bg-card px-4 text-sm font-medium shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Limpar filtros
                </button>
              }
            />
          ) : (
            <DndContext
              sensors={sensors}
              onDragStart={(event: DragStartEvent) =>
                setLeadArrastado((event.active.data.current?.lead as Lead | undefined) ?? null)
              }
              onDragCancel={() => setLeadArrastado(null)}
              onDragEnd={(event) => {
                setLeadArrastado(null);
                return handleDragEnd(event);
              }}
            >
              <div
                role="region"
                aria-label="Quadro do funil de vendas"
                tabIndex={0}
                className="-mx-1 flex snap-x snap-proximity gap-4 overflow-x-auto rounded-2xl px-1 pb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {LEAD_STATUS_COLUMNS.map((column, i) => (
                  <ColunaDoQuadro
                    key={column.value}
                    column={column}
                    indice={i}
                    filtros={filtros}
                    habilitada={habilitado}
                    total={contagens.data?.[column.value]}
                    podeArrastar={canDrag}
                    temAtendimentoHumano={(lead) =>
                      !!lead.telefone && !!activeTakeoverPhones?.has(lead.telefone)
                    }
                    onAbrir={setSelectedLeadId}
                  />
                ))}
              </div>
              <DragOverlay
                dropAnimation={{ duration: 200, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}
              >
                {leadArrastado ? (
                  <LeadCardView
                    lead={leadArrastado}
                    modo="clone"
                    hasHumanTakeover={
                      !!leadArrastado.telefone && activeTakeoverPhones?.has(leadArrastado.telefone)
                    }
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          )
        }
      </QueryState>

      <LeadDetailDrawer
        lead={selectedLead}
        open={!!selectedLeadId}
        onOpenChange={(open) => {
          if (!open) setSelectedLeadId(null);
        }}
      />

      {pendingAgendamentoLead ? (
        <VisitaFormDialog
          defaultLead={{
            id: pendingAgendamentoLead.id,
            nome: pendingAgendamentoLead.nome,
            telefone: pendingAgendamentoLead.telefone,
          }}
          open={!!pendingAgendamentoLead}
          onOpenChange={handleAgendamentoDialogChange}
          onSaved={handleAgendamentoSaved}
        />
      ) : null}
    </div>
  );
}
