import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, ChevronsUpDown, MessageCircle, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn, whatsappLink } from "@/lib/utils";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
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

const INTERACAO_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  ligacao: "Ligação",
  email: "E-mail",
  visita: "Visita",
  nota: "Nota manual",
  sistema: "Sistema",
};

function DadosLeadTab({ lead }: { lead: Lead }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
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
  });

  useEffect(() => {
    setForm({
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
    });
  }, [lead]);

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
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nome">Nome</Label>
        <Input
          id="nome"
          value={form.nome}
          onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="telefone">Telefone</Label>
          <Input
            id="telefone"
            value={form.telefone}
            onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cidade">Cidade</Label>
          <Input
            id="cidade"
            value={form.cidade}
            onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Origem</Label>
          <Select
            value={form.origem}
            onValueChange={(v: LeadOrigem) => setForm((f) => ({ ...f, origem: v }))}
          >
            <SelectTrigger>
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
        </div>
        <div className="space-y-2">
          <Label htmlFor="score">Score</Label>
          <Input
            id="score"
            type="number"
            value={form.score}
            onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="metragem_interesse">Metragem de interesse</Label>
          <Input
            id="metragem_interesse"
            type="number"
            step="0.01"
            value={form.metragem_interesse}
            onChange={(e) => setForm((f) => ({ ...f, metragem_interesse: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tipo_lote_interesse">Tipo de lote de interesse</Label>
          <Input
            id="tipo_lote_interesse"
            value={form.tipo_lote_interesse}
            onChange={(e) => setForm((f) => ({ ...f, tipo_lote_interesse: e.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Status CRM</Label>
        <Select
          value={form.status_crm}
          onValueChange={(v: LeadStatus) => setForm((f) => ({ ...f, status_crm: v }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEAD_STATUS_COLUMNS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Vendedor responsável</Label>
        <Select
          value={form.vendedor_id}
          onValueChange={(v) => setForm((f) => ({ ...f, vendedor_id: v }))}
        >
          <SelectTrigger>
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
      </div>

      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="w-full">
        {mutation.isPending ? "Salvando..." : "Salvar alterações"}
      </Button>
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
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Nenhum lote vinculado a este lead ainda.</p>
        {picking ? (
          <Popover open onOpenChange={setPicking}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between font-normal">
                Buscar lote disponível...
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]">
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
                        <Check className="mr-2 h-4 w-4 opacity-0" />
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
            <Plus className="h-4 w-4 mr-2" />
            Vincular lote
          </Button>
        )}
      </div>
    );
  }

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  if (!lote) {
    return <p className="text-sm text-muted-foreground">Lote vinculado não encontrado.</p>;
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-display text-lg text-primary">Lote {lote.numero_lote}</p>
          <LoteStatusBadge status={lote.status} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
          <p>Quadra: {lote.quadra ?? "—"}</p>
          <p>Metragem: {lote.metragem ? `${lote.metragem} m²` : "—"}</p>
          <p>
            Valor:{" "}
            {lote.valor
              ? lote.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
              : "—"}
          </p>
        </div>
        <Button variant="outline" asChild className="w-full">
          <Link to="/dashboard/lotes">Ver na página de Lotes</Link>
        </Button>
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
    <div className="space-y-4">
      {noteOpen ? (
        <div className="space-y-2 border rounded-lg p-3">
          <Textarea
            placeholder="Descreva a interação..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setNoteOpen(false)}>
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
      ) : (
        <Button variant="outline" onClick={() => setNoteOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar nota manual
        </Button>
      )}

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !interacoes || interacoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma interação registrada ainda.</p>
      ) : (
        <div className="space-y-3">
          {interacoes.map((item) => (
            <div key={item.id} className="border-l-2 border-primary/30 pl-3 py-1">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs font-normal">
                  {INTERACAO_LABELS[item.tipo ?? ""] ?? item.tipo ?? "—"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(item.created_at)}
                </span>
              </div>
              {item.conteudo ? <p className="text-sm mt-1">{item.conteudo}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WhatsappTab({ leadId, telefone }: { leadId: string; telefone: string | null }) {
  const linkWhatsapp = whatsappLink(telefone);
  const {
    data: messages,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["whatsapp-messages", leadId],
    queryFn: async () => {
      const query = supabase
        .from("whatsapp_messages")
        .select(
          "id, instance_id, contact_id, lead_id, remote_jid, message_id, from_me, message_type, content, status, created_at",
        )
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true });

      console.debug("[LeadDetailDrawer] whatsapp_messages query", {
        table: "whatsapp_messages",
        filter: { lead_id: leadId },
        order: "created_at asc",
      });

      const { data, error, status, statusText } = await query;

      if (error) {
        console.error("[LeadDetailDrawer] whatsapp_messages query failed", {
          leadId,
          status,
          statusText,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        throw error;
      }

      console.debug("[LeadDetailDrawer] whatsapp_messages query result", {
        leadId,
        count: data?.length ?? 0,
      });

      return data as WhatsappMessage[];
    },
  });

  return (
    <div className="space-y-3">
      {/* Fora do bloco condicional de propósito: o histórico inline depende da
          sincronização do whatsapp_messages, que hoje costuma vir vazia. O
          botão é o caminho garantido pra conversa de verdade — precisa
          aparecer com ou sem mensagens sincronizadas. */}
      {linkWhatsapp ? (
        <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
          <a href={linkWhatsapp} target="_blank" rel="noreferrer">
            <MessageCircle className="h-4 w-4 mr-2" />
            Abrir no WhatsApp
          </a>
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Este lead não tem um telefone válido cadastrado.
        </p>
      )}

      <div className="space-y-2 max-h-[28rem] overflow-y-auto">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : isError ? (
          <p className="text-sm text-destructive">
            Erro ao carregar as mensagens: {error instanceof Error ? error.message : String(error)}
          </p>
        ) : !messages || messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma mensagem sincronizada no CRM. Use o botão acima para ver a conversa no WhatsApp.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex", message.from_me ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                  message.from_me ? "bg-forest-deep text-ivory" : "bg-muted text-foreground",
                )}
              >
                {message.content}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function VisitasTab({ lead }: { lead: Lead }) {
  const { data: visitas, isLoading } = useQuery({
    queryKey: ["visitas", "lead", lead.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visitas")
        .select("*, lead:leads(id, nome, telefone), vendedor:vendedores(id, nome)")
        .eq("lead_id", lead.id)
        .order("data_hora", { ascending: false });
      if (error) throw error;
      return data as unknown as VisitaWithRelations[];
    },
  });

  return (
    <div className="space-y-4">
      <VisitaFormDialog
        defaultLead={{ id: lead.id, nome: lead.nome, telefone: lead.telefone }}
        trigger={
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Agendar nova visita
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : !visitas || visitas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma visita agendada para este lead.</p>
      ) : (
        <div className="space-y-2">
          {visitas.map((visita) => (
            <VisitaCard key={visita.id} visita={visita} />
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
    <div className="space-y-4">
      <DocumentoUploadDialog
        defaultLead={{ id: lead.id, nome: lead.nome }}
        trigger={
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Enviar documento
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : !documentos || documentos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum documento vinculado a este lead.</p>
      ) : (
        <div className="space-y-2">
          {documentos.map((documento) => (
            <DocumentoCard
              key={documento.id}
              documento={documento}
              onClick={() => setSelectedDocumento(documento)}
            />
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

// Soft delete: never a physical DELETE (leads with whatsapp_messages /
// interacoes / visitas would violate the NO ACTION foreign keys). Stamps
// deletado_em so the lead drops out of every active listing while its history
// is preserved. Admin/gestor only.
function LeadDeleteSection({ lead, onDeleted }: { lead: Lead; onDeleted: () => void }) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("leads")
        .update({ deletado_em: new Date().toISOString() })
        .eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead excluído do CRM.");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-home"] });
      onDeleted();
    },
    onError: () => toast.error("Erro ao excluir o lead."),
  });

  return (
    <div className="mt-8 pt-6 border-t">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Excluir Lead
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o lead {lead.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o lead {lead.nome}? Ele deixará de aparecer no CRM, mas
              o histórico de conversas e visitas será preservado internamente.
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        {lead ? (
          <>
            <SheetHeader>
              <SheetTitle className="font-display text-2xl text-primary flex items-center gap-2">
                {lead.nome}
                {whatsappLink(lead.telefone) ? (
                  <a
                    href={whatsappLink(lead.telefone)!}
                    target="_blank"
                    rel="noreferrer"
                    title="Abrir WhatsApp"
                  >
                    <MessageCircle className="h-4 w-4 text-muted-foreground hover:text-primary" />
                  </a>
                ) : null}
              </SheetTitle>
            </SheetHeader>

            <Tabs defaultValue="dados" className="mt-4">
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="dados">Dados do Lead</TabsTrigger>
                <TabsTrigger value="lote">Lote de Interesse</TabsTrigger>
                <TabsTrigger value="historico">Histórico</TabsTrigger>
                <TabsTrigger value="whatsapp">Conversas WhatsApp</TabsTrigger>
                <TabsTrigger value="visitas">Visitas</TabsTrigger>
                {canSeeDocumentos ? <TabsTrigger value="documentos">Documentos</TabsTrigger> : null}
              </TabsList>

              <TabsContent value="dados" className="pt-4">
                <DadosLeadTab lead={lead} />
              </TabsContent>
              <TabsContent value="lote" className="pt-4">
                <LoteInteresseTab lead={lead} />
              </TabsContent>
              <TabsContent value="historico" className="pt-4">
                <HistoricoTab leadId={lead.id} />
              </TabsContent>
              <TabsContent value="whatsapp" className="pt-4">
                <WhatsappTab leadId={lead.id} telefone={lead.telefone} />
              </TabsContent>
              {canSeeDocumentos ? (
                <TabsContent value="documentos" className="pt-4">
                  <DocumentosTab lead={lead} />
                </TabsContent>
              ) : null}
              <TabsContent value="visitas" className="pt-4">
                <VisitasTab lead={lead} />
              </TabsContent>
            </Tabs>

            {canSeeClientes ? <LeadClienteSection lead={lead} /> : null}

            {canDelete ? (
              <LeadDeleteSection lead={lead} onDeleted={() => onOpenChange(false)} />
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
