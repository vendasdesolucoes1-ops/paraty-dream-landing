import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Paperclip, Send, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { buscarEmLotes, buscarPorIds } from "@/lib/buscar-em-lotes";
import type { Lead, LeadStatus, WhatsappInstance } from "@/lib/types";
import { COLUNAS_INSTANCIA_PAINEL } from "@/lib/types";
import { LEAD_STATUS_COLUMNS } from "@/lib/types";
import {
  LIMITE_LEADS_CAMPANHA,
  chaveFollowup,
  criarCampanha,
  mensagemDeErro,
  type TipoMidia,
} from "@/lib/cadencias";
import { formatNumero } from "@/lib/format";
import { ToolCard } from "@/components/ferramentas/tool-card";
import { DispatchHistoryPanel } from "@/components/ferramentas/dispatch-history-panel";
import { LeadSelectionList } from "@/components/ferramentas/lead-selection-list";
import {
  AvisoCampanhaServidor,
  CampanhaProgresso,
  CampanhasLista,
} from "@/components/ferramentas/campanha-progresso";
import { TemplateEditor } from "@/components/dashboard/cadencias/template-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Campo, Secao } from "@/components/ajustes/campos";

// Campanha só vai para leads do CRM: a fila envia por inscrição de lead, e é
// o lead que carrega opt-out, base legal e takeover. CSV e lista manual saíram
// junto com o laço do navegador.
type ContactSource = "crm" | "selecao";

interface Contact {
  nome: string;
  telefone: string;
  leadId: string;
}

const BUCKET_MIDIA = "disparos-midia";

/**
 * Validade da URL assinada do anexo. O worker usa a URL como veio, e uma
 * campanha grande, presa ao limite diário e à janela de envio, pode levar
 * dias: 30 dias cobrem com folga sem deixar o link vivo para sempre.
 */
const TTL_URL_MIDIA = 30 * 24 * 60 * 60;

/** O que a Evolution precisa saber sobre o anexo, deduzido do MIME do arquivo. */
function tipoDeMidia(file: File): TipoMidia {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}

function tamanhoLegivel(bytes: number): string {
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function nomePadrao(): string {
  const agora = new Date();
  return `Campanha ${agora.toLocaleDateString("pt-BR")} ${agora.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function MassDispatcherCard() {
  const queryClient = useQueryClient();
  const [instanceId, setInstanceId] = useState<string>("");
  const [nomeCampanha, setNomeCampanha] = useState("");
  const [message, setMessage] = useState("");
  const [source, setSource] = useState<ContactSource>("crm");
  const [crmStatusFilter, setCrmStatusFilter] = useState<LeadStatus | "todos">("todos");
  // Seleção manual de leads (fonte "selecao"): ids escolhidos a dedo, em vez de
  // aceitar todo mundo que casa com um filtro de status.
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  // Anexo da campanha: um arquivo só, enviado a todos os contatos. Sobe uma
  // vez na criação e a URL assinada vai junto na etapa da campanha.
  const [midia, setMidia] = useState<File | null>(null);
  const [criando, setCriando] = useState(false);
  // Campanha recém-criada (aba Disparar) e a aberta na lista (aba Campanhas).
  const [criada, setCriada] = useState<{ id: string; nome: string } | null>(null);
  const [abertaId, setAbertaId] = useState<string | null>(null);

  const { data: instances } = useQuery({
    queryKey: ["whatsapp-instances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select(COLUNAS_INSTANCIA_PAINEL)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as WhatsappInstance[];
    },
  });

  // Quantos leads do CRM já chegaram, para mostrar o andamento da leitura.
  const [crmCarregados, setCrmCarregados] = useState(0);

  // Em lotes: uma consulta só voltava no máximo 1.000 leads (teto do
  // PostgREST) e o disparo saía para menos gente do que o filtro prometia.
  const { data: crmLeads, isFetching: carregandoCrm } = useQuery({
    queryKey: ["ferramentas-crm-leads", crmStatusFilter],
    queryFn: async () => {
      setCrmCarregados(0);
      return buscarEmLotes<Pick<Lead, "id" | "nome" | "telefone">>(
        (de, ate) => {
          let query = supabase
            .from("leads")
            .select("id, nome, telefone")
            .is("deletado_em", null)
            .not("telefone", "is", null);
          if (crmStatusFilter !== "todos") query = query.eq("status_crm", crmStatusFilter);
          return query
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(de, ate);
        },
        { aoProgredir: setCrmCarregados },
      );
    },
    enabled: source === "crm",
  });

  // Os leads escolhidos vêm de outra consulta que não a do filtro por status:
  // a seleção é por id e ignora status, então reaproveitar `crmLeads` traria
  // só os que casam com o filtro atual da outra fonte.
  const { data: leadsSelecionados } = useQuery({
    queryKey: ["disparador-leads-selecionados", [...selectedLeadIds].sort().join(",")],
    queryFn: async () => {
      if (selectedLeadIds.size === 0) return [];
      // Em pedaços: milhares de ids num `.in()` só estouram a URL e, mesmo
      // cabendo, a resposta pararia nas 1.000 linhas do PostgREST.
      return buscarPorIds<Pick<Lead, "id" | "nome" | "telefone">>([...selectedLeadIds], (ids) =>
        supabase.from("leads").select("id, nome, telefone").in("id", ids),
      );
    },
    enabled: source === "selecao" && selectedLeadIds.size > 0,
  });

  const contacts: Contact[] = useMemo(() => {
    const origem = source === "crm" ? crmLeads : leadsSelecionados;
    return (origem ?? [])
      .filter((l) => l.telefone)
      .map((l) => ({ nome: l.nome, telefone: l.telefone as string, leadId: l.id }));
  }, [source, crmLeads, leadsSelecionados]);

  const selectedInstance = instances?.find((i) => i.id === instanceId);
  const acimaDoLimite = contacts.length > LIMITE_LEADS_CAMPANHA;

  async function criar() {
    if (!selectedInstance) {
      toast.error("Selecione uma instância.");
      return;
    }
    if (!message.trim() && !midia) {
      toast.error("Escreva uma mensagem ou anexe um arquivo.");
      return;
    }
    if (contacts.length === 0) {
      toast.error("Nenhum contato para disparar.");
      return;
    }
    if (acimaDoLimite) {
      toast.error(
        `Uma campanha vai para no máximo ${formatNumero(LIMITE_LEADS_CAMPANHA)} leads. Filtre mais a lista.`,
      );
      return;
    }

    setCriando(true);
    try {
      let midiaCampanha: { url: string; tipo: TipoMidia; nome: string } | null = null;
      if (midia) {
        const caminho = `${crypto.randomUUID()}-${midia.name.replace(/[^\w.-]/g, "_")}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET_MIDIA)
          .upload(caminho, midia, { contentType: midia.type || "application/octet-stream" });
        if (uploadError) {
          toast.error(`Não foi possível subir o anexo: ${uploadError.message}`);
          return;
        }
        const { data: assinada, error: urlError } = await supabase.storage
          .from(BUCKET_MIDIA)
          .createSignedUrl(caminho, TTL_URL_MIDIA);
        if (urlError || !assinada?.signedUrl) {
          toast.error("Anexo subiu, mas não foi possível gerar o link de envio.");
          return;
        }
        midiaCampanha = { url: assinada.signedUrl, tipo: tipoDeMidia(midia), nome: midia.name };
      }

      const nome = nomeCampanha.trim() || nomePadrao();
      const id = await criarCampanha({
        nome,
        template: message,
        leadIds: [...new Set(contacts.map((c) => c.leadId))],
        instanceId: selectedInstance.id,
        midia: midiaCampanha,
      });
      setCriada({ id, nome });
      setNomeCampanha("");
      queryClient.invalidateQueries({ queryKey: chaveFollowup });
      toast.success("Campanha criada. Os envios começam em instantes.");
    } catch (e) {
      toast.error(mensagemDeErro(e, "Não foi possível criar a campanha."));
    } finally {
      setCriando(false);
    }
  }

  return (
    <ToolCard
      icon={Send}
      title="Disparador em massa"
      subtitle="Campanhas de WhatsApp para leads do CRM, enviadas pelo servidor"
    >
      {/* A campanha roda no worker da fila, não neste componente: trocar de
          aba, fechar a gaveta ou a página não interrompe nada. */}
      <Tabs defaultValue="disparar">
        <TabsList>
          <TabsTrigger value="disparar">Disparar</TabsTrigger>
          <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
          <TabsTrigger value="historico">Histórico antigo</TabsTrigger>
        </TabsList>

        <TabsContent value="disparar" className="mt-6 space-y-8">
          <AvisoCampanhaServidor />

          <Secao titulo="Origem">
            <div className="grid gap-4 md:grid-cols-2">
              <Campo label="Instância">
                <Select value={instanceId} onValueChange={setInstanceId} disabled={criando}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a instância" />
                  </SelectTrigger>
                  <SelectContent>
                    {(instances ?? []).map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.instance_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>

              <Campo label="Fonte dos contatos">
                <Select
                  value={source}
                  onValueChange={(v: ContactSource) => setSource(v)}
                  disabled={criando}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crm">Leads do CRM (por status)</SelectItem>
                    <SelectItem value="selecao">Escolher leads</SelectItem>
                  </SelectContent>
                </Select>
              </Campo>
            </div>
          </Secao>

          <Secao titulo="Mensagem">
            <Campo id="campanha-nome" label="Nome da campanha" dica="Para achar depois na lista.">
              <Input
                id="campanha-nome"
                maxLength={120}
                placeholder={nomePadrao()}
                value={nomeCampanha}
                onChange={(e) => setNomeCampanha(e.target.value)}
                disabled={criando}
              />
            </Campo>

            <Campo
              id="mass-message"
              label="Mensagem"
              dica={
                <>
                  Variável disponível: <code>{"{{primeiro_nome}}"}</code>. Use <code>||</code> para
                  quebrar em mais de uma mensagem.
                </>
              }
            >
              <TemplateEditor
                id="mass-message"
                value={message}
                onChange={setMessage}
                disabled={criando}
                variaveis={["primeiro_nome"]}
                placeholder="Oi {{primeiro_nome}}, temos novidades sobre o Moradas de Paraty..."
              />
            </Campo>

            {/* Anexo: um arquivo por campanha, o mesmo para todos os contatos.
              Com texto preenchido saem duas mensagens (texto e depois a mídia),
              porque legenda em documento o WhatsApp ignora e em imagem trunca. */}
            <Campo
              id="midia-upload"
              label="Anexo (opcional)"
              dica="Imagem, vídeo, áudio ou PDF. Áudio vai como mensagem de voz, não como arquivo anexado."
            >
              {midia ? (
                <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)]">
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{midia.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {tipoDeMidia(midia) === "audio"
                        ? "Áudio — enviado como mensagem de voz"
                        : tipoDeMidia(midia)}{" "}
                      · {tamanhoLegivel(midia.size)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setMidia(null)}
                    disabled={criando}
                    aria-label="Remover anexo"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Input
                  id="midia-upload"
                  type="file"
                  accept="image/*,video/*,audio/*,.pdf"
                  onChange={(e) => setMidia(e.target.files?.[0] ?? null)}
                  disabled={criando}
                />
              )}
            </Campo>
          </Secao>

          <Secao titulo="Contatos">
            {source === "crm" ? (
              <Campo label="Filtrar por status do lead" className="max-w-xs">
                <Select
                  value={crmStatusFilter}
                  onValueChange={(v: LeadStatus | "todos") => setCrmStatusFilter(v)}
                  disabled={criando}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    {LEAD_STATUS_COLUMNS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
            ) : (
              <LeadSelectionList
                selectedIds={selectedLeadIds}
                onChange={setSelectedLeadIds}
                disabled={criando}
              />
            )}

            {source === "crm" && carregandoCrm ? (
              <p
                role="status"
                className="flex items-center gap-2 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground"
              >
                Carregando leads do CRM…
                <span className="num tabular-nums">{crmCarregados}</span>
              </p>
            ) : (
              <p
                className={
                  acimaDoLimite
                    ? "flex flex-wrap items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger"
                    : "flex items-center gap-2 rounded-xl bg-muted px-4 py-3 text-sm"
                }
              >
                <span className="num text-base font-semibold tabular-nums">
                  {formatNumero(contacts.length)}
                </span>
                {acimaDoLimite
                  ? `leads: acima do máximo de ${formatNumero(LIMITE_LEADS_CAMPANHA)} por campanha.`
                  : "leads entram na campanha"}
              </p>
            )}
          </Secao>

          <div className="space-y-5 border-t border-border pt-6">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={
                    criando ||
                    contacts.length === 0 ||
                    acimaDoLimite ||
                    (!message.trim() && !midia) ||
                    !instanceId ||
                    (source === "crm" && carregandoCrm)
                  }
                >
                  {criando ? "Criando campanha…" : "Criar campanha"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmar campanha</AlertDialogTitle>
                  <AlertDialogDescription>
                    {formatNumero(contacts.length)} leads entram na campanha. O servidor envia aos
                    poucos, dentro do horário de envio e do limite diário do número, mesmo com esta
                    aba fechada. Confirmar?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => criar()}>Confirmar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {criada ? (
              <CampanhaProgresso campanha={criada} onFechar={() => setCriada(null)} />
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="campanhas" className="mt-6">
          <CampanhasLista abertaId={abertaId} onAbrir={setAbertaId} />
        </TabsContent>

        {/* Disparos feitos pelo navegador antes das campanhas no servidor. */}
        <TabsContent value="historico" className="mt-6">
          <DispatchHistoryPanel />
        </TabsContent>
      </Tabs>
    </ToolCard>
  );
}
