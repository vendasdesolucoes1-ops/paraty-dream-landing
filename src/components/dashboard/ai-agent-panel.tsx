import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, FileText, BookOpen, MessageSquare, Send, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BOLHA_LEAD, CHAT_BG } from "@/components/whatsapp/chat-theme";
import { ChatBubble } from "@/components/whatsapp/chat-ui";
import type { AiAgent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

const DEFAULT_AGENT_NAME = "Agente Moradas de Paraty";
const DEFAULT_TRANSFER_KEYWORDS = ["atendente", "humano", "falar com alguém", "corretor"];
const RAG_KEY = "rag_conhecimento";

/** Só o horário, para o carimbo dentro da bolha. */
function formatHoraTeste(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

interface ChatMessage {
  role: "user" | "agent";
  text: string;
  /** ISO do envio, para o carimbo de hora na bolha. Ausente em conversas
      salvas antes deste campo existir. */
  at?: string;
}

export function AiAgentPanel({ instanceId }: { instanceId: string }) {
  const queryClient = useQueryClient();

  const { data: agent, isLoading } = useQuery({
    queryKey: ["ai-agent", instanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("*")
        .eq("instance_id", instanceId)
        .maybeSingle();
      if (error) throw error;
      return data as AiAgent | null;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ai_agents").insert({
        name: DEFAULT_AGENT_NAME,
        instance_id: instanceId,
        is_active: true,
        transfer_keywords: DEFAULT_TRANSFER_KEYWORDS,
        transfer_to_human_enabled: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agente IA criado e ativado.");
      queryClient.invalidateQueries({ queryKey: ["ai-agent", instanceId] });
    },
    onError: () => toast.error("Erro ao criar o agente IA."),
  });

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-display text-primary flex items-center gap-2">
          <Bot className="h-5 w-5 text-gold" />
          Agente IA
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Configure o comportamento do assistente comercial
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !agent ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Nenhum agente configurado para esta instância. Crie o agente para começar a qualificar
              leads automaticamente pelo WhatsApp.
            </p>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Criando..." : "Criar Agente"}
            </Button>
          </div>
        ) : (
          // Navegação vertical: a lista de abas vira uma barra lateral à
          // esquerda do conteúdo. "Testar Agente" é a aba padrão — é o que se
          // usa no dia a dia; as outras três são configuração.
          <Tabs defaultValue="testar" className="flex flex-col gap-4 sm:flex-row">
            <TabsList className="h-auto w-full shrink-0 flex-row justify-start gap-1 overflow-x-auto bg-transparent p-0 sm:w-52 sm:flex-col sm:overflow-visible">
              <TabsTrigger
                value="testar"
                className="w-full justify-start gap-2 data-[state=active]:bg-muted"
              >
                <MessageSquare className="h-4 w-4" />
                Testar Agente
              </TabsTrigger>
              <TabsTrigger
                value="rag"
                className="w-full justify-start gap-2 data-[state=active]:bg-muted"
              >
                <BookOpen className="h-4 w-4" />
                Base de Conhecimento
              </TabsTrigger>
              <TabsTrigger
                value="geral"
                className="w-full justify-start gap-2 data-[state=active]:bg-muted"
              >
                <Bot className="h-4 w-4" />
                Geral
              </TabsTrigger>
            </TabsList>

            <div className="min-w-0 flex-1">
              <TabsContent value="testar" className="mt-0">
                <TestAgentTab agent={agent} instanceId={instanceId} />
              </TabsContent>
              <TabsContent value="rag" className="mt-0">
                <KnowledgeBaseTab />
              </TabsContent>
              <TabsContent value="geral" className="mt-0">
                <GeneralTab agent={agent} instanceId={instanceId} />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function GeneralTab({ agent, instanceId }: { agent: AiAgent; instanceId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    mensagem_boas_vindas: agent.mensagem_boas_vindas ?? "",
    is_active: agent.is_active,
    keywordsInput: (agent.transfer_keywords ?? []).join(", "),
  });

  useEffect(() => {
    setForm({
      mensagem_boas_vindas: agent.mensagem_boas_vindas ?? "",
      is_active: agent.is_active,
      keywordsInput: (agent.transfer_keywords ?? []).join(", "),
    });
  }, [agent]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const keywords = form.keywordsInput
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      const { error } = await supabase
        .from("ai_agents")
        .update({
          mensagem_boas_vindas: form.mensagem_boas_vindas || null,
          is_active: form.is_active,
          transfer_keywords: keywords,
        })
        .eq("id", agent.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações do agente salvas.");
      queryClient.invalidateQueries({ queryKey: ["ai-agent", instanceId] });
    },
    onError: () => toast.error("Erro ao salvar as configurações."),
  });

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">Status do agente</p>
          <p className="text-xs text-muted-foreground">
            {form.is_active
              ? "Respondendo leads automaticamente"
              : "Pausado — mensagens não serão respondidas pela IA"}
          </p>
        </div>
        <Switch
          checked={form.is_active}
          onCheckedChange={(checked) => setForm((f) => ({ ...f, is_active: checked }))}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="welcome_message">Mensagem de boas-vindas</Label>
        <Input
          id="welcome_message"
          placeholder="Olá! Vim pelo site do Moradas de Paraty..."
          value={form.mensagem_boas_vindas}
          onChange={(e) => setForm((f) => ({ ...f, mensagem_boas_vindas: e.target.value }))}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="transfer_keywords">Palavras-chave de transferência para humano</Label>
        <Input
          id="transfer_keywords"
          placeholder="atendente, humano, corretor"
          value={form.keywordsInput}
          onChange={(e) => setForm((f) => ({ ...f, keywordsInput: e.target.value }))}
        />
        <p className="text-xs text-muted-foreground">
          Separe por vírgula. Quando o lead usar uma dessas palavras, a conversa é transferida para
          um atendente humano.
        </p>
      </div>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? "Salvando..." : "Salvar configurações"}
      </Button>
    </div>
  );
}

// Ações do prompt, dentro da aba de teste. A aba "Prompt do Sistema" com
// textarea editável foi removida de propósito: gravar em ai_agents.system_prompt
// desliga o buildSystemPrompt() do código, que é onde o prompt real vive
// versionado — foi exatamente essa porta que fez a Sophia rodar sem base de
// conhecimento. "Resetar para o padrão" fica como rede de segurança, caso um
// system_prompt seja gravado por fora (SQL manual, por exemplo).
function PromptActions({ agent, instanceId }: { agent: AiAgent; instanceId: string }) {
  const queryClient = useQueryClient();
  const [promptAtual, setPromptAtual] = useState<string | null>(null);
  const [previewAberto, setPreviewAberto] = useState(false);

  const previewMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-agent-chat", {
        body: { action: "preview_prompt", agent_id: agent.id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Falha ao montar o prompt.");
      return data as { prompt: string; usa_prompt_customizado: boolean };
    },
    onSuccess: (data) => {
      setPromptAtual(data.prompt);
      setPreviewAberto(true);
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível carregar o prompt atual."),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ai_agents")
        .update({ system_prompt: null })
        .eq("id", agent.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Prompt do sistema restaurado para o padrão do código.");
      queryClient.invalidateQueries({ queryKey: ["ai-agent", instanceId] });
    },
    onError: () => toast.error("Erro ao restaurar o prompt padrão."),
  });

  const temPromptCustomizado = Boolean(agent.system_prompt?.trim());

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dialog open={previewAberto} onOpenChange={setPreviewAberto}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={previewMutation.isPending}
            onClick={(e) => {
              // O clique dispara a busca; o Dialog só abre no onSuccess, senão
              // o modal apareceria vazio enquanto carrega.
              e.preventDefault();
              previewMutation.mutate();
            }}
          >
            <FileText className="h-4 w-4 mr-1.5" />
            {previewMutation.isPending ? "Carregando..." : "Ver Prompt Atual"}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display">Prompt ativo agora</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Isto é o prompt ativo agora, somente para conferência. Ele é montado a partir do código
            (buildSystemPrompt), mais os lotes disponíveis em tempo real e a base de conhecimento.
            Para alterá-lo, edite o código.
          </p>
          <pre className="max-h-[60vh] overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
            {promptAtual ?? ""}
          </pre>
        </DialogContent>
      </Dialog>

      {/* Só aparece quando há de fato um prompt customizado gravado — sem isso
          o botão seria uma ação sem efeito na maior parte do tempo. */}
      {temPromptCustomizado ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-amber-700"
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? "Restaurando..." : "Resetar para o padrão"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display">
                Restaurar o prompt padrão?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Existe um prompt customizado gravado no banco para este agente, e ele desliga o
                prompt padrão do código — inclusive as regras de preço e a base de conhecimento.
                Restaurar apaga esse texto e devolve o comportamento versionado. Não pode ser
                desfeito.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => resetMutation.mutate()}>
                Restaurar padrão
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}

function KnowledgeBaseTab() {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const originalRef = useRef("");

  const { data, isLoading } = useQuery({
    queryKey: ["rag-conhecimento"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracoes")
        .select("valor")
        .eq("chave", RAG_KEY)
        .maybeSingle();
      if (error) throw error;
      return data?.valor ?? "";
    },
  });

  useEffect(() => {
    if (data != null) {
      setText(data);
      originalRef.current = data;
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("configuracoes")
        .update({ valor: text })
        .eq("chave", RAG_KEY);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Base de conhecimento salva.");
      originalRef.current = text;
      queryClient.invalidateQueries({ queryKey: ["rag-conhecimento"] });
    },
    onError: () => toast.error("Erro ao salvar a base de conhecimento."),
  });

  function handleReset() {
    setText(originalRef.current);
  }

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Esta é a base de conhecimento que o agente consulta a cada conversa. Inclua informações
        sobre lotes, preços, condições de pagamento e diferenciais do empreendimento.
      </p>

      <div className="relative">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ minHeight: 400 }}
          className="resize-y"
        />
        <span className="absolute bottom-2 right-3 text-xs text-muted-foreground bg-background/80 px-1 rounded">
          {text.length} caracteres
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Salvando..." : "Salvar base de conhecimento"}
        </Button>
        <Button variant="outline" onClick={handleReset}>
          Resetar para o padrão
        </Button>
      </div>
    </div>
  );
}

// Mesma fórmula do intervalo humanizado do whatsapp-webhook (piso/teto e
// ms/caractere) — duplicada porque um é Deno edge function e o outro é
// frontend, sem módulo comum entre os dois runtimes. O painel precisa
// simular esse ritmo, senão o "Testar Agente" não reflete o envio real: lá
// as bolhas saem em sequência com pausa, aqui elas apareciam todas juntas.
const INTER_MESSAGE_DELAY_MIN_MS = 1000;
const INTER_MESSAGE_DELAY_MAX_MS = 3000;
const INTER_MESSAGE_DELAY_MS_PER_CHAR = 35;

function humanizedDelay(text: string): number {
  const estimated = text.length * INTER_MESSAGE_DELAY_MS_PER_CHAR;
  return Math.min(INTER_MESSAGE_DELAY_MAX_MS, Math.max(INTER_MESSAGE_DELAY_MIN_MS, estimated));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A conversa de teste vive no localStorage, não só no estado do React: sair da
// aba (ou ir conferir a movimentação no CRM e voltar) desmontava o componente e
// apagava tudo, justamente quando é preciso acompanhar os dois lados em
// paralelo. A sessão também é preservada para o histórico continuar coerente.
const TEST_CHAT_STORAGE_KEY = "ai-agent-test-chat";

function carregarConversaSalva(): {
  messages: ChatMessage[];
  sessionId: string;
  leadId: string | null;
} {
  const vazio = { messages: [], sessionId: `test_${Date.now()}`, leadId: null };
  try {
    const bruto = localStorage.getItem(TEST_CHAT_STORAGE_KEY);
    if (!bruto) return vazio;
    const salvo = JSON.parse(bruto);
    if (!Array.isArray(salvo?.messages)) return vazio;
    return {
      messages: salvo.messages,
      sessionId: salvo.sessionId ?? vazio.sessionId,
      leadId: salvo.leadId ?? null,
    };
  } catch {
    // localStorage indisponível ou conteúdo corrompido: começa limpo em vez de
    // derrubar a aba inteira.
    return vazio;
  }
}

function TestAgentTab({ agent, instanceId }: { agent: AiAgent; instanceId: string }) {
  const [salvo] = useState(carregarConversaSalva);
  const [messages, setMessages] = useState<ChatMessage[]>(salvo.messages);
  const [input, setInput] = useState("");
  const [sessionId] = useState(salvo.sessionId);
  // Lead real, marcado com is_teste, para a movimentação automática aparecer no
  // CRM. Fica no storage junto da conversa: o mesmo teste continua no mesmo
  // card quando você volta da aba do CRM.
  const [leadId, setLeadId] = useState<string | null>(salvo.leadId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(TEST_CHAT_STORAGE_KEY, JSON.stringify({ messages, sessionId, leadId }));
    } catch {
      // Cota estourada não pode quebrar o envio da mensagem.
    }
  }, [messages, sessionId, leadId]);

  // Telefone fictício e único: leads.telefone tem índice único, e o prefixo
  // 5500 deixa claro no CRM que não é número de gente.
  async function garantirLeadDeTeste(): Promise<string | null> {
    if (leadId) return leadId;
    const { data, error } = await supabase
      .from("leads")
      .insert({
        nome: "Lead de Teste (painel)",
        telefone: `5500${Date.now().toString().slice(-9)}`,
        origem: "whatsapp",
        status_crm: "novo",
        is_teste: true,
      })
      .select("id")
      .single();
    if (error) {
      // Sem lead o teste ainda funciona como conversa — só não move o CRM.
      toast.error(`Não foi possível criar o lead de teste: ${error.message}`);
      return null;
    }
    setLeadId(data.id);
    return data.id;
  }

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const idDoLead = await garantirLeadDeTeste();
      // Sem lead_id real, ai-agent-chat não tem como buscar histórico no banco
      // (.eq("lead_id", null) nunca casa nada em Postgres) — por isso o painel
      // manda a própria conversa local como histórico explícito.
      const history = messages.map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.text,
      }));
      const { data, error } = await supabase.functions.invoke("ai-agent-chat", {
        body: {
          agent_id: agent.id,
          message,
          contact_phone: "teste_painel",
          contact_name: "Teste",
          lead_id: idDoLead,
          session_id: sessionId,
          history,
        },
      });
      if (error) throw error;
      const result = data as { messages: string[] };

      // Anexa cada bolha com o mesmo intervalo do envio real, em vez de
      // devolver tudo de uma vez — mutationFn só resolve depois da última.
      for (const [index, text] of (result.messages ?? []).entries()) {
        if (index > 0) await sleep(humanizedDelay(text));
        setMessages((prev) => [...prev, { role: "agent", text, at: new Date().toISOString() }]);
      }

      return result;
    },
    onError: () => toast.error("Erro ao consultar o agente."),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || sendMutation.isPending) return;
    setMessages((prev) => [...prev, { role: "user", text: trimmed, at: new Date().toISOString() }]);
    setInput("");
    sendMutation.mutate(trimmed);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Badge variant="outline" className="font-normal">
          Modelo: {agent.modelo}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setMessages([]);
            // Zera o vínculo: o próximo teste nasce num card novo, em vez de
            // continuar movimentando o lead do teste anterior.
            setLeadId(null);
            try {
              localStorage.removeItem(TEST_CHAT_STORAGE_KEY);
            } catch {
              // sem storage, o estado zerado acima já basta
            }
          }}
          disabled={messages.length === 0}
        >
          <Trash2 className="h-4 w-4 mr-1.5" />
          Limpar conversa
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="overflow-y-auto rounded-lg border p-3"
        style={{ height: 380, background: CHAT_BG }}
      >
        {messages.length === 0 ? (
          <p className="rounded bg-background/90 p-2 text-center text-sm text-muted-foreground">
            Envie uma mensagem para começar a conversa com a Sophia.
          </p>
        ) : (
          <div className="space-y-1">
            {messages.map((m, i) => (
              <ChatBubble
                key={i}
                texto={m.text}
                nossa={m.role === "user"}
                horario={m.at ? formatHoraTeste(m.at) : ""}
              />
            ))}
          </div>
        )}
        {sendMutation.isPending ? (
          <div className="flex justify-start pt-1">
            <div
              className="rounded-lg rounded-tl-sm px-2.5 py-1.5 text-sm italic text-neutral-500 shadow-sm"
              style={{ background: BOLHA_LEAD }}
            >
              Digitando...
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 rounded-lg border bg-muted/60 p-2">
        <Input
          placeholder="Mensagem"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          className="rounded-full border-none bg-background shadow-sm focus-visible:ring-1"
        />
        <Button
          onClick={handleSend}
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full"
          disabled={sendMutation.isPending || !input.trim()}
          title="Enviar"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        <PromptActions agent={agent} instanceId={instanceId} />
      </div>

      <p className="text-xs text-muted-foreground">
        Ambiente de teste: nada é enviado pelo WhatsApp do lead. A conversa cria um card marcado
        como TESTE no CRM, para você acompanhar a movimentação automática.
      </p>
    </div>
  );
}
