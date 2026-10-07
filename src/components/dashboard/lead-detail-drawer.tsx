import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  CalendarCheck,
  CalendarClock,
  Check,
  ChevronsUpDown,
  Cog,
  ExternalLink,
  FileText,
  Headset,
  History,
  Mail,
  MapPin,
  MapPinned,
  MessageCircle,
  Phone,
  Plus,
  Send,
  StickyNote,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn, readFunctionError, whatsappLink } from "@/lib/utils";
import { CHAT_BG } from "@/components/whatsapp/chat-theme";
import { ChatBubble, ChatDateSeparator } from "@/components/whatsapp/chat-ui";
import {
  LEAD_ORIGEM_OPTIONS,
  LEAD_STATUS_COLUMNS,
  type Interacao,
  type Lead,
  type LeadOrigem,
  type LeadStatus,
  type Lote,
  type Vendedor,
  type VisitaWithRelations,
  type WhatsappMessage,
} from "@/lib/types";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ds/avatar";
import { Kbd } from "@/components/ds/kbd";
import { Pill } from "@/components/ds/pill";
import { SkeletonRows } from "@/components/ds/query-state";
import { atraso } from "@/components/ds/reveal";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Campo, ComIcone, Secao } from "@/components/crm/ficha";
import { EtapaDot, EtapaPill } from "@/components/crm/etapa-pill";
import { tempoRelativo } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { LoteStatusBadge } from "@/components/dashboard/status-badge";
import { VisitaFormDialog } from "@/components/agenda/visita-form-dialog";
import { VisitaCard } from "@/components/agenda/visita-card";
import { DocumentoUploadDialog } from "@/components/documentos/documento-upload-dialog";
import { DocumentoCard } from "@/components/documentos/documento-card";
import { DocumentoPreviewDialog } from "@/components/documentos/documento-preview-dialog";
import { LeadClienteSection } from "@/components/clientes/lead-cliente-section";
import { useProfile } from "@/hooks/use-profile";
import type { DocumentoWithLead } from "@/lib/types";

const NO_VENDEDOR = "nenhum";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Só o horário, para o carimbo dentro da bolha da conversa. */
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Separador de dia da conversa: "Hoje"/"Ontem" e a data cheia no resto. */
function formatDateSeparator(iso: string) {
  const data = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);

  if (data.toDateString() === hoje.toDateString()) return "Hoje";
  if (data.toDateString() === ontem.toDateString()) return "Ontem";
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const INTERACAO_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  ligacao: "Ligação",
  email: "E-mail",
  visita: "Visita",
  nota: "Nota manual",
  sistema: "Sistema",
};

const INTERACAO_ICONES: Record<string, LucideIcon> = {
  whatsapp: MessageCircle,
  ligacao: Phone,
  email: Mail,
  visita: CalendarCheck,
  nota: StickyNote,
  sistema: Cog,
};

const ORIGEM_ROTULO = Object.fromEntries(LEAD_ORIGEM_OPTIONS.map((o) => [o.value, o.label]));

function formDoLead(lead: Lead) {
  return {
    nome: lead.nome,
    telefone: lead.telefone ?? "",
    cidade: lead.cidade ?? "",
    email: lead.email ?? "",
    origem: (lead.origem ?? "lp") as LeadOrigem,
    metragem_interesse: lead.metragem_interesse != null ? String(lead.metragem_interesse) : "",
    tipo_lote_interesse: lead.tipo_lote_interesse ?? "",
    score: String(lead.score),
    status_crm: lead.status_crm,
    vendedor_id: lead.vendedor_id ?? NO_VENDEDOR,
  };
}

function DadosLeadTab({ lead }: { lead: Lead }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => formDoLead(lead));

  useEffect(() => {
    setForm(formDoLead(lead));
  }, [lead]);

  // Só para avisar "alterações não salvas": o botão segue sempre disponível.
  const alterado = JSON.stringify(form) !== JSON.stringify(formDoLead(lead));

  const { data: vendedores } = useQuery({
    queryKey: ["vendedores-ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendedores")
        .select("*")
        .eq("ativo", true)
        .order("nome", { ascending: true });
      if (error) throw error;
      return data as Vendedor[];
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("leads")
        .update({
          nome: form.nome,
          telefone: form.telefone || null,
          cidade: form.cidade || null,
          email: form.email || null,
          origem: form.origem,
          metragem_interesse: form.metragem_interesse ? Number(form.metragem_interesse) : null,
          tipo_lote_interesse: form.tipo_lote_interesse || null,
          score: Number(form.score) || 0,
          status_crm: form.status_crm,
          vendedor_id: form.vendedor_id !== NO_VENDEDOR ? form.vendedor_id : null,
        })
        .eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead atualizado.");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: () => toast.error("Erro ao salvar as alterações."),
  });

  return (
    <div className="space-y-8">
      <Secao titulo="Contato">
        <Campo id="nome" label="Nome">
          <Input
            id="nome"
            value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
          />
        </Campo>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="telefone" label="Telefone">
            <ComIcone icone={Phone}>
              <Input
                id="telefone"
                type="tel"
                inputMode="tel"
                className="pl-9"
                value={form.telefone}
                onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
              />
            </ComIcone>
          </Campo>
          <Campo id="cidade" label="Cidade">
            <ComIcone icone={MapPin}>
              <Input
                id="cidade"
                className="pl-9"
                value={form.cidade}
                onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))}
              />
            </ComIcone>
          </Campo>
        </div>

        <Campo id="email" label="E-mail">
          <ComIcone icone={Mail}>
            <Input
              id="email"
              type="email"
              className="pl-9"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </ComIcone>
        </Campo>
      </Secao>

      <Secao titulo="Interesse">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="origem" label="Origem">
            <Select
              value={form.origem}
              onValueChange={(v: LeadOrigem) => setForm((f) => ({ ...f, origem: v }))}
            >
              <SelectTrigger id="origem">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_ORIGEM_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo id="score" label="Score">
            <Input
              id="score"
              type="number"
              className="tabular-nums"
              value={form.score}
              onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))}
            />
          </Campo>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="metragem_interesse" label="Metragem de interesse">
            <div className="relative">
              <Input
                id="metragem_interesse"
                type="number"
                step="0.01"
                className="pr-10 tabular-nums"
                value={form.metragem_interesse}
                onChange={(e) => setForm((f) => ({ ...f, metragem_interesse: e.target.value }))}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[0.8125rem] text-muted-foreground"
              >
                m²
              </span>
            </div>
          </Campo>
          <Campo id="tipo_lote_interesse" label="Tipo de lote de interesse">
            <Input
              id="tipo_lote_interesse"
              value={form.tipo_lote_interesse}
              onChange={(e) => setForm((f) => ({ ...f, tipo_lote_interesse: e.target.value }))}
            />
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Funil">
        <Campo id="status_crm" label="Status CRM">
          <Select
            value={form.status_crm}
            onValueChange={(v: LeadStatus) => setForm((f) => ({ ...f, status_crm: v }))}
          >
            <SelectTrigger id="status_crm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_STATUS_COLUMNS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="inline-flex items-center gap-2">
                    <EtapaDot etapa={opt.value} />
                    {opt.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>

        <Campo id="vendedor_id" label="Vendedor responsável">
          <Select
            value={form.vendedor_id}
            onValueChange={(v) => setForm((f) => ({ ...f, vendedor_id: v }))}
          >
            <SelectTrigger id="vendedor_id">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_VENDEDOR}>Nenhum</SelectItem>
              {(vendedores ?? []).map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
      </Secao>

      <div className="sticky bottom-0 z-10 -mx-7 flex items-center justify-between gap-3 border-t border-border bg-card/95 px-7 py-4 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <p
          className={cn(
            "flex items-center gap-2 text-[0.8125rem] text-muted-foreground transition-opacity duration-200",
            alterado ? "opacity-100" : "opacity-0",
          )}
          aria-live="polite"
        >
          {alterado ? (
            <>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />
              Alterações não salvas
            </>
          ) : null}
        </p>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}

function LoteInteresseTab({ lead }: { lead: Lead }) {
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");

  const { data: lote, isLoading } = useQuery({
    queryKey: ["lote-interesse", lead.lote_interesse_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lotes")
        .select("*")
        .eq("id", lead.lote_interesse_id!)
        .maybeSingle();
      if (error) throw error;
      return data as Lote | null;
    },
    enabled: !!lead.lote_interesse_id,
  });

  const { data: lotesDisponiveis } = useQuery({
    queryKey: ["lotes-disponiveis-search", search],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lotes")
        .select("*")
        .eq("status", "disponivel")
        .ilike("numero_lote", `%${search}%`)
        .limit(10);
      if (error) throw error;
      return data as Lote[];
    },
    enabled: picking,
  });

  const linkMutation = useMutation({
    mutationFn: async (loteId: string) => {
      const { error } = await supabase
        .from("leads")
        .update({ lote_interesse_id: loteId })
        .eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lote vinculado ao lead.");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lote-interesse"] });
      setPicking(false);
    },
    onError: () => toast.error("Erro ao vincular o lote."),
  });

  if (!lead.lote_interesse_id) {
    return (
      <EmptyState
        icon={MapPinned}
        title="Nenhum lote vinculado"
        description="Nenhum lote vinculado a este lead ainda."
        action={
          picking ? (
            <Popover open onOpenChange={setPicking}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-64 justify-between font-normal">
                  Buscar lote disponível...
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Digite o número do lote..."
                    value={search}
                    onValueChange={setSearch}
                  />
                  <CommandList>
                    <CommandEmpty>Nenhum lote disponível encontrado.</CommandEmpty>
                    <CommandGroup>
                      {(lotesDisponiveis ?? []).map((l) => (
                        <CommandItem
                          key={l.id}
                          value={l.id}
                          onSelect={() => linkMutation.mutate(l.id)}
                        >
                          <Check className="mr-2 h-4 w-4 opacity-0" aria-hidden />
                          Lote {l.numero_lote}
                          {l.quadra ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              Quadra {l.quadra}
                            </span>
                          ) : null}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          ) : (
            <Button onClick={() => setPicking(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Vincular lote
            </Button>
          )
        }
      />
    );
  }

  if (isLoading) return <SkeletonRows rows={1} className="h-44" />;

  if (!lote) {
    return (
      <EmptyState
        icon={MapPinned}
        title="Lote não encontrado"
        description="Lote vinculado não encontrado."
      />
    );
  }

  const valor = lote.valor
    ? lote.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";

  return (
    <Card className="animate-swap overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <MapPinned className="h-5 w-5" aria-hidden />
            </span>
            <p className="font-sans text-[1.0625rem] font-semibold tracking-[-0.014em] text-foreground">
              Lote {lote.numero_lote}
            </p>
          </div>
          <LoteStatusBadge status={lote.status} />
        </div>
        <dl className="grid grid-cols-3 gap-px bg-border">
          {[
            ["Quadra", lote.quadra ?? "—"],
            ["Metragem", lote.metragem ? `${lote.metragem} m²` : "—"],
            ["Valor", valor],
          ].map(([rotulo, texto]) => (
            <div key={rotulo} className="bg-card px-5 py-4">
              <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {rotulo}
              </dt>
              <dd className="num mt-1.5 text-[0.9375rem] text-foreground">{texto}</dd>
            </div>
          ))}
        </dl>
        <div className="p-4">
          <Button variant="outline" asChild className="w-full">
            <Link to="/dashboard/lotes">Ver na página de Lotes</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoricoTab({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  const { data: interacoes, isLoading } = useQuery({
    queryKey: ["interacoes", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interacoes")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Interacao[];
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("interacoes").insert({
        lead_id: leadId,
        tipo: "nota",
        canal: "manual",
        conteudo: note,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nota adicionada.");
      queryClient.invalidateQueries({ queryKey: ["interacoes", leadId] });
      setNote("");
      setNoteOpen(false);
    },
    onError: () => toast.error("Erro ao adicionar a nota."),
  });

  return (
    <div className="space-y-6">
      {noteOpen ? (
        <div className="animate-swap space-y-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <Textarea
            autoFocus
            rows={4}
            placeholder="Descreva a interação..."
            aria-label="Nota manual"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                if (note.trim() && !mutation.isPending) mutation.mutate();
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd> salvar
            </span>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setNoteOpen(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => mutation.mutate()}
                disabled={!note.trim() || mutation.isPending}
              >
                {mutation.isPending ? "Salvando..." : "Salvar nota"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setNoteOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Adicionar nota manual
        </Button>
      )}

      {isLoading ? (
        <SkeletonRows rows={4} className="h-16" />
      ) : !interacoes || interacoes.length === 0 ? (
        <EmptyState
          icon={History}
          title="Sem histórico"
          description="Nenhuma interação registrada ainda."
        />
      ) : (
        <ol className="relative space-y-5 before:absolute before:bottom-3 before:left-[0.9375rem] before:top-3 before:w-px before:bg-border">
          {interacoes.map((item, i) => {
            const Icon = INTERACAO_ICONES[item.tipo ?? ""] ?? Cog;
            const sistema = item.tipo === "sistema";
            return (
              <li
                key={item.id}
                style={atraso(i, 40, 360)}
                className="animate-swap relative flex gap-3.5"
              >
                <span className="relative z-10 flex h-[1.875rem] w-[1.875rem] shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 pb-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    <p className="text-[0.8125rem] font-semibold text-foreground">
                      {INTERACAO_LABELS[item.tipo ?? ""] ?? item.tipo ?? "—"}
                    </p>
                    <time
                      dateTime={item.created_at}
                      title={formatDateTime(item.created_at)}
                      className="text-xs tabular-nums text-muted-foreground"
                    >
                      {formatDateTime(item.created_at)}
                    </time>
                  </div>
                  {item.conteudo ? (
                    <p
                      className={cn(
                        "mt-1.5 whitespace-pre-line break-words text-[0.875rem] leading-relaxed",
                        sistema
                          ? "text-muted-foreground"
                          : "rounded-xl bg-muted/60 px-3 py-2 text-foreground",
                      )}
                    >
                      {item.conteudo}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function WhatsappTab({
  leadId,
  nome,
  telefone,
}: {
  leadId: string;
  nome: string;
  telefone: string | null;
}) {
  const queryClient = useQueryClient();
  const linkWhatsapp = whatsappLink(telefone);
  const [rascunho, setRascunho] = useState("");

  const {
    data: messages,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["whatsapp-messages", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select(
          "id, instance_id, contact_id, lead_id, remote_jid, message_id, from_me, message_type, content, status, created_at",
        )
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as WhatsappMessage[];
    },
  });

  // Estado da pausa vem da edge function: as tabelas ai_agent_* só têm policy
  // de service_role, então o cliente do painel não consegue lê-las direto.
  const { data: iaStatus } = useQuery({
    queryKey: ["ia-pausada", leadId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("crm-send-whatsapp-message", {
        body: { action: "status", lead_id: leadId },
      });
      if (error || !data?.ok) return { ia_pausada: false };
      return data as { ia_pausada: boolean };
    },
  });

  const enviar = useMutation({
    mutationFn: async (texto: string) => {
      const { data, error } = await supabase.functions.invoke("crm-send-whatsapp-message", {
        body: { action: "send_text", lead_id: leadId, text: texto },
      });
      if (error) throw new Error(await readFunctionError(error));
      if (!data?.ok) throw new Error(data?.error ?? "Falha ao enviar.");
      return data;
    },
    onSuccess: () => {
      setRascunho("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-messages", leadId] });
      queryClient.invalidateQueries({ queryKey: ["ia-pausada", leadId] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível enviar a mensagem."),
  });

  const reativarIA = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("crm-send-whatsapp-message", {
        body: { action: "resume_ai", lead_id: leadId },
      });
      if (error) throw new Error(await readFunctionError(error));
      if (!data?.ok) throw new Error(data?.error ?? "Falha ao reativar.");
      return data;
    },
    onSuccess: () => {
      toast.success("Agente de IA reativado para este lead.");
      queryClient.invalidateQueries({ queryKey: ["ia-pausada", leadId] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível reativar a IA."),
  });

  const temMensagens = Boolean(messages && messages.length > 0);

  // Conversa longa deve abrir no fim, como qualquer app de mensagem — sem isso
  // o vendedor cai no início do histórico e precisa rolar até embaixo.
  const fimDaConversa = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (temMensagens) fimDaConversa.current?.scrollIntoView({ block: "end" });
  }, [temMensagens, messages]);

  function submeter(e: React.FormEvent) {
    e.preventDefault();
    const texto = rascunho.trim();
    if (!texto || enviar.isPending) return;
    enviar.mutate(texto);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
      {/* Header estilo WhatsApp. Sem indicador de presença: a Evolution até
          emite presence.update, mas não assinamos esse evento nem guardamos
          o "visto por último" — exibir algo aqui seria inventar dado. */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <Avatar nome={nome} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.875rem] font-semibold leading-tight">{nome}</p>
          <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
            {telefone ?? "sem telefone"}
          </p>
        </div>
        {linkWhatsapp ? (
          <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="Abrir no WhatsApp">
            <a href={linkWhatsapp} target="_blank" rel="noreferrer" aria-label="Abrir no WhatsApp">
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          </Button>
        ) : null}
      </div>

      {iaStatus?.ia_pausada ? (
        <div className="animate-swap flex flex-wrap items-center justify-between gap-2 border-b border-border bg-warning-soft px-4 py-2.5 text-xs text-warning">
          <span className="flex items-center gap-2 font-medium">
            <Headset className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Agente de IA pausado — um humano assumiu esta conversa.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            disabled={reativarIA.isPending}
            onClick={() => reativarIA.mutate()}
          >
            {reativarIA.isPending ? "Reativando..." : "Reativar IA"}
          </Button>
        </div>
      ) : null}

      <div
        className="h-[min(30rem,calc(100dvh-26rem))] min-h-72 overflow-y-auto p-3"
        style={{ background: CHAT_BG }}
      >
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : isError ? (
          <p className="rounded-lg bg-background/90 p-2.5 text-sm text-danger">
            Erro ao carregar as mensagens: {error instanceof Error ? error.message : String(error)}
          </p>
        ) : !temMensagens ? (
          <p className="rounded-lg bg-background/90 p-2.5 text-center text-sm text-muted-foreground">
            Nenhuma mensagem sincronizada no CRM ainda.
          </p>
        ) : (
          <div className="space-y-1">
            {messages!.map((message, i) => {
              // Separador de dia: só quando a data muda em relação à mensagem
              // anterior, senão a conversa vira uma parede de carimbos.
              const dia = new Date(message.created_at).toDateString();
              const diaAnterior =
                i > 0 ? new Date(messages![i - 1].created_at).toDateString() : null;

              return (
                <div key={message.id}>
                  {dia !== diaAnterior ? (
                    <ChatDateSeparator label={formatDateSeparator(message.created_at)} />
                  ) : null}

                  <ChatBubble
                    texto={message.content}
                    nossa={message.from_me}
                    horario={formatTime(message.created_at)}
                    status={message.status}
                  />
                </div>
              );
            })}
            <div ref={fimDaConversa} />
          </div>
        )}
      </div>

      {/* Barra de input estilo WhatsApp. Anexo e emoji entram na próxima
          etapa (áudio/arquivo) — ficam de fora agora para não oferecer botão
          que não faz nada. */}
      <form
        onSubmit={submeter}
        className="flex items-center gap-2 border-t border-border bg-card p-3"
      >
        <Input
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          placeholder={telefone ? "Mensagem" : "Lead sem telefone cadastrado"}
          aria-label="Mensagem para o lead"
          disabled={!telefone || enviar.isPending}
          className="rounded-full bg-background px-4"
        />
        <Button
          type="submit"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full"
          disabled={!telefone || !rascunho.trim() || enviar.isPending}
          title="Enviar"
          aria-label="Enviar mensagem"
        >
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </form>
    </div>
  );
}

function VisitasTab({ lead }: { lead: Lead }) {
  const { data: visitas, isLoading } = useQuery({
    queryKey: ["visitas", "lead", lead.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visitas")
        .select("*, lead:leads(id, nome, telefone, is_teste), vendedor:vendedores(id, nome)")
        .eq("lead_id", lead.id)
        .order("data_hora", { ascending: false });
      if (error) throw error;
      return data as unknown as VisitaWithRelations[];
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-muted-foreground">
          {isLoading
            ? "Carregando visitas…"
            : `${visitas?.length ?? 0} ${visitas?.length === 1 ? "visita" : "visitas"}`}
        </p>
        <VisitaFormDialog
          defaultLead={{ id: lead.id, nome: lead.nome, telefone: lead.telefone }}
          trigger={
            <Button>
              <Plus className="h-4 w-4" aria-hidden />
              Agendar nova visita
            </Button>
          }
        />
      </div>

      {isLoading ? (
        <SkeletonRows rows={2} className="h-20" />
      ) : !visitas || visitas.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Sem visitas"
          description="Nenhuma visita agendada para este lead."
        />
      ) : (
        <div className="space-y-2.5">
          {visitas.map((visita, i) => (
            <div key={visita.id} className="animate-swap" style={atraso(i, 50, 300)}>
              <VisitaCard visita={visita} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentosTab({ lead }: { lead: Lead }) {
  const [selectedDocumento, setSelectedDocumento] = useState<DocumentoWithLead | null>(null);

  const { data: documentos, isLoading } = useQuery({
    queryKey: ["documentos", "lead", lead.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documentos")
        .select("*, lead:leads(id, nome)")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as DocumentoWithLead[];
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-muted-foreground">
          {isLoading
            ? "Carregando documentos…"
            : `${documentos?.length ?? 0} ${documentos?.length === 1 ? "documento" : "documentos"}`}
        </p>
        <DocumentoUploadDialog
          defaultLead={{ id: lead.id, nome: lead.nome }}
          trigger={
            <Button>
              <Plus className="h-4 w-4" aria-hidden />
              Enviar documento
            </Button>
          }
        />
      </div>

      {isLoading ? (
        <SkeletonRows rows={2} className="h-20" />
      ) : !documentos || documentos.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sem documentos"
          description="Nenhum documento vinculado a este lead."
        />
      ) : (
        <div className="space-y-2.5">
          {documentos.map((documento, i) => (
            <div key={documento.id} className="animate-swap" style={atraso(i, 50, 300)}>
              <DocumentoCard
                documento={documento}
                onClick={() => setSelectedDocumento(documento)}
              />
            </div>
          ))}
        </div>
      )}

      <DocumentoPreviewDialog
        documento={selectedDocumento}
        open={!!selectedDocumento}
        onOpenChange={(open) => {
          if (!open) setSelectedDocumento(null);
        }}
      />
    </div>
  );
}

// Exclusão real, via RPC transacional. Não é feito daqui com várias chamadas
// por dois motivos: falhar no meio deixaria mensagens órfãs apontando para um
// lead inexistente, e whatsapp_messages / ai_agent_* só têm policy de
// service_role — um DELETE do cliente autenticado não daria erro, apenas
// afetaria zero linhas, e a tela diria "excluído" com tudo intacto no banco.
//
// A autorização (admin/gestor) e a trava de cliente comprador vivem dentro da
// função, não aqui: validação no cliente é sugestão, não garantia.
function LeadDeleteSection({ lead, onDeleted }: { lead: Lead; onDeleted: () => void }) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // Tipos gerados ainda não conhecem a função (a migration é aplicada à mão).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("excluir_lead_definitivo", {
        p_lead_id: lead.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead excluído definitivamente.");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-home"] });
      onDeleted();
    },
    // A mensagem do raise exception (cliente comprador, sem permissão) é o que
    // o usuário precisa ler — um "erro ao excluir" genérico esconderia
    // justamente a informação acionável.
    onError: (error: { message?: string }) =>
      toast.error(error?.message || "Erro ao excluir o lead."),
  });

  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/25 bg-danger-soft/50 p-4">
      <div className="min-w-0">
        <p className="text-[0.8125rem] font-semibold text-foreground">Zona de risco</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Apaga o lead e todo o histórico, sem volta.
        </p>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            className="border-danger/30 text-danger hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Excluir Lead
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {lead.nome} definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação <strong>não pode ser desfeita</strong>. O lead será apagado do banco de
              dados junto com todo o histórico de conversas do WhatsApp, interações, visitas
              agendadas e mensagens na fila de envio. O contato do WhatsApp é mantido, apenas
              desvinculado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir Lead"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Aba em sublinhado: o fio cresce da esquerda ao ativar, em vez de a pílula trocar de lugar. */
const TAB =
  "relative h-11 shrink-0 rounded-none px-3 text-[0.8125rem] after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-foreground after:transition-transform after:duration-300 after:ease-[var(--ease-out)] data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:scale-x-100 motion-reduce:after:transition-none";

export function LeadDetailDrawer({
  lead,
  open,
  onOpenChange,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { profile } = useProfile();
  const canSeeDocumentos = profile?.role === "admin" || profile?.role === "gestor";
  const canDelete = profile?.role === "admin" || profile?.role === "gestor";
  // Carteira de comprador é restrita: vendedor não converte nem enxerga cliente.
  const canSeeClientes = profile?.role === "admin" || profile?.role === "gestor";

  const whatsapp = lead ? whatsappLink(lead.telefone) : null;
  const origem = lead?.origem ? (ORIGEM_ROTULO[lead.origem] ?? lead.origem) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[36rem]"
      >
        {/* Aberta por link (?lead=) antes de a lista carregar: ainda não há lead,
            mas o painel precisa de um título para leitores de tela. */}
        {lead ? null : (
          <>
            <SheetTitle className="sr-only">Carregando lead…</SheetTitle>
            <SheetDescription className="sr-only">Buscando os dados do lead.</SheetDescription>
            <div
              className="flex items-center gap-4 border-b border-border px-7 pb-5 pt-7"
              aria-hidden
            >
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2.5">
                <Skeleton className="h-7 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            </div>
            <div className="space-y-4 px-7 py-6" aria-hidden>
              <SkeletonRows rows={5} className="h-11" />
            </div>
          </>
        )}
        {lead ? (
          <>
            <header className="shrink-0 border-b border-border px-7 pb-5 pr-14 pt-7">
              <div className="flex items-start gap-4">
                <Avatar nome={lead.nome} className="h-12 w-12 text-sm" />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-balance break-words font-display text-[1.85rem] font-medium leading-[1.05] tracking-[-0.01em] text-foreground">
                    {lead.nome}
                  </SheetTitle>
                  <SheetDescription className="mt-1.5 text-[0.8125rem]">
                    {lead.telefone ? (
                      <>
                        <span className="tabular-nums">{lead.telefone}</span>
                        {" · "}
                      </>
                    ) : null}
                    Criado {tempoRelativo(lead.created_at)}
                  </SheetDescription>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <EtapaPill etapa={lead.status_crm} />
                    {origem ? <Pill>{origem}</Pill> : null}
                    <Pill>
                      <span className="num">{lead.score}</span> pts
                    </Pill>
                    {lead.is_teste ? <Pill tone="warning">TESTE</Pill> : null}
                  </div>
                </div>
              </div>
              {whatsapp ? (
                <div className="mt-4">
                  <Button asChild variant="outline" size="sm">
                    <a href={whatsapp} target="_blank" rel="noreferrer" title="Abrir WhatsApp">
                      <MessageCircle className="h-4 w-4" aria-hidden />
                      WhatsApp
                    </a>
                  </Button>
                </div>
              ) : null}
            </header>

            <Tabs defaultValue="dados" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="h-auto w-full shrink-0 justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent px-5 py-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <TabsTrigger value="dados" className={TAB}>
                  <UserRound className="h-3.5 w-3.5" aria-hidden />
                  Dados do Lead
                </TabsTrigger>
                <TabsTrigger value="lote" className={TAB}>
                  <MapPinned className="h-3.5 w-3.5" aria-hidden />
                  Lote de Interesse
                </TabsTrigger>
                <TabsTrigger value="historico" className={TAB}>
                  <History className="h-3.5 w-3.5" aria-hidden />
                  Histórico
                </TabsTrigger>
                <TabsTrigger value="whatsapp" className={TAB}>
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                  Conversas WhatsApp
                </TabsTrigger>
                <TabsTrigger value="visitas" className={TAB}>
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                  Visitas
                </TabsTrigger>
                {canSeeDocumentos ? (
                  <TabsTrigger value="documentos" className={TAB}>
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                    Documentos
                  </TabsTrigger>
                ) : null}
              </TabsList>

              <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
                <TabsContent value="dados" className="mt-0">
                  <DadosLeadTab lead={lead} />
                </TabsContent>
                <TabsContent value="lote" className="mt-0">
                  <LoteInteresseTab lead={lead} />
                </TabsContent>
                <TabsContent value="historico" className="mt-0">
                  <HistoricoTab leadId={lead.id} />
                </TabsContent>
                <TabsContent value="whatsapp" className="mt-0">
                  <WhatsappTab leadId={lead.id} nome={lead.nome} telefone={lead.telefone} />
                </TabsContent>
                {canSeeDocumentos ? (
                  <TabsContent value="documentos" className="mt-0">
                    <DocumentosTab lead={lead} />
                  </TabsContent>
                ) : null}
                <TabsContent value="visitas" className="mt-0">
                  <VisitasTab lead={lead} />
                </TabsContent>

                {canSeeClientes ? <LeadClienteSection lead={lead} /> : null}

                {canDelete ? (
                  <LeadDeleteSection lead={lead} onDeleted={() => onOpenChange(false)} />
                ) : null}
              </div>
            </Tabs>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
