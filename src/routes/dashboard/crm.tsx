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
import { Inbox, SearchX, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { LEAD_ORIGEM_OPTIONS, LEAD_STATUS_COLUMNS, type Lead, type LeadStatus } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ds/chip";
import { QueryState } from "@/components/ds/query-state";
import { Reveal, atraso } from "@/components/ds/reveal";
import { EtapaDot } from "@/components/crm/etapa-pill";
import { ETAPA_COR } from "@/components/crm/etapas";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useContagem } from "@/hooks/use-contagem";
import { useMontado } from "@/hooks/use-montado";
import { LeadCard, LeadCardView } from "@/components/dashboard/lead-card";
import { LeadFormDialog } from "@/components/dashboard/lead-form-dialog";
import { LeadDetailDrawer } from "@/components/dashboard/lead-detail-drawer";
import { VisitaFormDialog } from "@/components/agenda/visita-form-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { useProfile } from "@/hooks/use-profile";

export const Route = createFileRoute("/dashboard/crm")({
  head: () => ({ meta: [{ title: "CRM — Moradas de Paraty" }] }),
  // ?lead=<id> abre a ficha daquele lead. É o que permite ir da tela inicial,
  // da busca (⌘K) e das notificações direto para a pessoa certa.
  validateSearch: (search: Record<string, unknown>): { lead?: string } => ({
    lead: typeof search.lead === "string" && search.lead ? search.lead : undefined,
  }),
  component: CrmPage,
});

const STATUS_LABEL_MAP = Object.fromEntries(LEAD_STATUS_COLUMNS.map((c) => [c.value, c.label]));

/** Tira acento e caixa para a busca achar "Jose" em "José". */
function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function KanbanColumn({
  column,
  total,
  indice,
  children,
}: {
  column: { value: LeadStatus; label: string };
  total: number;
  indice: number;
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
        {total === 0 ? (
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
            {Array.from({ length: i % 3 === 0 ? 3 : 2 }, (_, k) => (
              <div
                key={k}
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
          </div>
        </div>
      ))}
    </div>
  );
}

function CrmPage() {
  const queryClient = useQueryClient();
  const { profile } = useProfile();
  const isVendedor = profile?.role === "vendedor";

  const leadsQueryKey = ["leads", isVendedor ? profile?.vendedor_id : "all"];

  const {
    data: leads,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: leadsQueryKey,
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("*")
        .is("deletado_em", null)
        .order("created_at", { ascending: false });
      if (isVendedor && profile?.vendedor_id) {
        query = query.eq("vendedor_id", profile.vendedor_id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as Lead[];
    },
    enabled: !isVendedor || !!profile?.vendedor_id,
  });

  useEffect(() => {
    const channel = supabase
      .channel("leads-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        queryClient.invalidateQueries({ queryKey: ["leads"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: activeTakeoverPhones } = useQuery({
    queryKey: ["active-takeover-phones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agent_human_takeover")
        .select("conversation_id, ai_agent_conversations(session_id)")
        .is("resolved_at", null);
      if (error) throw error;
      const phones = (data ?? []).flatMap((row) => {
        const conversations = row.ai_agent_conversations as
          | { session_id: string }
          | { session_id: string }[]
          | null;
        if (!conversations) return [];
        return Array.isArray(conversations)
          ? conversations.map((c) => c.session_id)
          : [conversations.session_id];
      });
      return new Set(phones);
    },
  });

  // Leads de teste ficam visíveis por padrão — é justamente para acompanhar a
  // movimentação automática que eles existem. O filtro serve para limpar a
  // visão quando o funil real é o que importa.
  const [mostrarTestes, setMostrarTestes] = useState(true);

  const totalTestes = useMemo(() => (leads ?? []).filter((l) => l.is_teste).length, [leads]);

  const [busca, setBusca] = useState("");
  const [origemFiltro, setOrigemFiltro] = useState<string>("todas");

  // Base do quadro: o que sobra depois do filtro de testes. As contagens de
  // origem saem daqui para os chips mostrarem o que cada escolha traria.
  const base = useMemo(
    () => (leads ?? []).filter((l) => mostrarTestes || !l.is_teste),
    [leads, mostrarTestes],
  );

  const origensDisponiveis = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const l of base) if (l.origem) contagem.set(l.origem, (contagem.get(l.origem) ?? 0) + 1);
    return LEAD_ORIGEM_OPTIONS.filter((o) => contagem.has(o.value)).map((o) => ({
      ...o,
      total: contagem.get(o.value) ?? 0,
    }));
  }, [base]);

  // Se a origem escolhida some (ex.: o filtro de testes a esvaziou), volta a "todas".
  const origemAtiva = origensDisponiveis.some((o) => o.value === origemFiltro)
    ? origemFiltro
    : "todas";
  const filtrosAtivos = busca.trim() !== "" || origemAtiva !== "todas";

  const columns = useMemo(() => {
    const termo = normalizar(busca.trim());
    const digitos = busca.replace(/\D/g, "");
    const grouped = new Map<string, Lead[]>();
    for (const column of LEAD_STATUS_COLUMNS) grouped.set(column.value, []);
    for (const lead of base) {
      if (origemAtiva !== "todas" && lead.origem !== origemAtiva) continue;
      if (termo) {
        const bate =
          normalizar(lead.nome).includes(termo) ||
          normalizar(lead.cidade ?? "").includes(termo) ||
          normalizar(lead.email ?? "").includes(termo) ||
          (digitos.length >= 3 && (lead.telefone ?? "").replace(/\D/g, "").includes(digitos));
        if (!bate) continue;
      }
      grouped.get(lead.status_crm)?.push(lead);
    }
    return grouped;
  }, [base, busca, origemAtiva]);

  const totalVisivel = useMemo(
    () => Array.from(columns.values()).reduce((soma, lista) => soma + lista.length, 0),
    [columns],
  );
  const contagemAnimada = useContagem(leads ? totalVisivel : null);
  const contagensPorEtapa = useMemo(
    () => new Map(Array.from(columns.entries()).map(([etapa, lista]) => [etapa, lista.length])),
    [columns],
  );

  const { lead: leadDaUrl } = Route.useSearch();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(leadDaUrl ?? null);
  // Abrir outro lead pela URL com a página já aberta (ex.: pela busca).
  useEffect(() => {
    if (leadDaUrl) setSelectedLeadId(leadDaUrl);
  }, [leadDaUrl]);
  const selectedLead = useMemo(
    () => leads?.find((lead) => lead.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  );

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

  function moveLeadOptimistically(leadId: string, newStatus: LeadStatus) {
    queryClient.setQueryData<Lead[]>(leadsQueryKey, (old) =>
      old?.map((l) => (l.id === leadId ? { ...l, status_crm: newStatus } : l)),
    );
  }

  function revertLead(leadId: string, originalStatus: LeadStatus) {
    queryClient.setQueryData<Lead[]>(leadsQueryKey, (old) =>
      old?.map((l) => (l.id === leadId ? { ...l, status_crm: originalStatus } : l)),
    );
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
      moveLeadOptimistically(lead.id, newStatus);
      agendamentoSavedRef.current = false;
      setPendingAgendamentoLead(lead);
      return;
    }

    moveLeadOptimistically(lead.id, newStatus);

    try {
      if (newStatus === "qualificado" && !lead.vendedor_id) {
        const { data: nextVendedorId, error: rrError } = await supabase.rpc(
          "get_next_round_robin_salesperson",
        );
        if (rrError) throw rrError;
        const { error } = await supabase
          .from("leads")
          .update({ status_crm: newStatus, vendedor_id: nextVendedorId })
          .eq("id", lead.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("leads")
          .update({ status_crm: newStatus })
          .eq("id", lead.id);
        if (error) throw error;
      }

      await logStatusChange(lead, newStatus);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    } catch {
      revertLead(lead.id, originalStatus);
      toast.error("Erro ao atualizar o status do lead.");
    }
  }

  function handleAgendamentoDialogChange(open: boolean) {
    if (!open) {
      if (pendingAgendamentoLead && !agendamentoSavedRef.current) {
        // Dialog closed without saving — revert the optimistic move.
        revertLead(pendingAgendamentoLead.id, pendingAgendamentoLead.status_crm);
      }
      setPendingAgendamentoLead(null);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
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
          action={<LeadFormDialog />}
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
                contagem={base.length}
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
        query={{ data: leads ?? [], isPending: isLoading, isError, refetch, isRefetching }}
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
                {LEAD_STATUS_COLUMNS.map((column, i) => {
                  const columnLeads = columns.get(column.value) ?? [];
                  return (
                    <KanbanColumn
                      key={column.value}
                      column={column}
                      total={columnLeads.length}
                      indice={i}
                    >
                      {columnLeads.map((lead, k) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          indice={k}
                          draggable={canDrag(lead)}
                          hasHumanTakeover={
                            !!lead.telefone && activeTakeoverPhones?.has(lead.telefone)
                          }
                          onClick={() => setSelectedLeadId(lead.id)}
                        />
                      ))}
                    </KanbanColumn>
                  );
                })}
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
