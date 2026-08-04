import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, FileText, BookOpen, MessageSquare, Send, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AiAgent, AiAgentModelo, AiAgentTomVoz } from "@/lib/types";
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

const TOM_VOZ_OPTIONS: { value: AiAgentTomVoz; label: string }[] = [
  { value: "profissional", label: "Profissional" },
  { value: "amigavel", label: "Amigável" },
  { value: "formal", label: "Formal" },
  { value: "informal", label: "Informal" },
];

const MODELO_OPTIONS: { value: AiAgentModelo; label: string }[] = [
  { value: "gpt-4o-mini", label: "gpt-4o-mini" },
  { value: "gpt-4o", label: "gpt-4o" },
];

interface ChatMessage {
  role: "user" | "agent";
  text: string;
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
          <Tabs defaultValue="geral">
            <TabsList>
              <TabsTrigger value="geral" className="gap-1.5">
                <Bot className="h-4 w-4" />
                Geral
              </TabsTrigger>
              <TabsTrigger value="prompt" className="gap-1.5">
                <FileText className="h-4 w-4" />
                Prompt do Sistema
              </TabsTrigger>
              <TabsTrigger value="rag" className="gap-1.5">
                <BookOpen className="h-4 w-4" />
                Base de Conhecimento
              </TabsTrigger>
              <TabsTrigger value="testar" className="gap-1.5">
                <MessageSquare className="h-4 w-4" />
                Testar Agente
              </TabsTrigger>
            </TabsList>

            <TabsContent value="geral" className="pt-4">
              <GeneralTab agent={agent} instanceId={instanceId} />
            </TabsContent>
            <TabsContent value="prompt" className="pt-4">
              <SystemPromptTab agent={agent} instanceId={instanceId} />
            </TabsContent>
            <TabsContent value="rag" className="pt-4">
              <KnowledgeBaseTab />
            </TabsContent>
            <TabsContent value="testar" className="pt-4">
              <TestAgentTab agent={agent} />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function GeneralTab({ agent, instanceId }: { agent: AiAgent; instanceId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: agent.name,
    modelo: agent.modelo,
    mensagem_boas_vindas: agent.mensagem_boas_vindas ?? "",
    tom_voz: agent.tom_voz,
    usar_emojis: agent.usar_emojis,
    ser_breve: agent.ser_breve,
    is_active: agent.is_active,
    keywordsInput: (agent.transfer_keywords ?? []).join(", "),
  });

  useEffect(() => {
    setForm({
      name: agent.name,
      modelo: agent.modelo,
      mensagem_boas_vindas: agent.mensagem_boas_vindas ?? "",
      tom_voz: agent.tom_voz,
      usar_emojis: agent.usar_emojis,
      ser_breve: agent.ser_breve,
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
          name: form.name,
          modelo: form.modelo,
          mensagem_boas_vindas: form.mensagem_boas_vindas || null,
          tom_voz: form.tom_voz,
          usar_emojis: form.usar_emojis,
          ser_breve: form.ser_breve,
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
        <Label htmlFor="agent_name">Nome do agente</Label>
        <Input
          id="agent_name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </div>

      <div className="space-y-2">
        <Label>Modelo de IA</Label>
        <Select
          value={form.modelo}
          onValueChange={(v: AiAgentModelo) => setForm((f) => ({ ...f, modelo: v }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODELO_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Label>Tom de voz</Label>
        <Select
          value={form.tom_voz}
          onValueChange={(v: AiAgentTomVoz) => setForm((f) => ({ ...f, tom_voz: v }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TOM_VOZ_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="usar_emojis">Usar emojis</Label>
        <Switch
          id="usar_emojis"
          checked={form.usar_emojis}
          onCheckedChange={(checked) => setForm((f) => ({ ...f, usar_emojis: checked }))}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="ser_breve">Ser breve nas respostas</Label>
        <Switch
          id="ser_breve"
          checked={form.ser_breve}
          onCheckedChange={(checked) => setForm((f) => ({ ...f, ser_breve: checked }))}
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

function SystemPromptTab({ agent, instanceId }: { agent: AiAgent; instanceId: string }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(agent.system_prompt ?? "");

  useEffect(() => {
    setText(agent.system_prompt ?? "");
  }, [agent]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ai_agents")
        .update({ system_prompt: text })
        .eq("id", agent.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Prompt do sistema salvo.");
      queryClient.invalidateQueries({ queryKey: ["ai-agent", instanceId] });
    },
    onError: () => toast.error("Erro ao salvar o prompt do sistema."),
  });

  // Zerar system_prompt devolve o agente ao prompt padrão do código. Era a
  // única forma de sair de um prompt customizado ruim e estava desabilitada,
  // o que deixou o agente preso a um prompt sem base de conhecimento.
  const resetMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ai_agents")
        .update({ system_prompt: null })
        .eq("id", agent.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Prompt do sistema restaurado para o padrão.");
      setText("");
      queryClient.invalidateQueries({ queryKey: ["ai-agent", instanceId] });
    },
    onError: () => toast.error("Erro ao restaurar o prompt padrão."),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Este é o prompt interno que define como o agente se comporta, incluindo lógica de
        qualificação e estágios do funil. Edite com cuidado.
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
          {saveMutation.isPending ? "Salvando..." : "Salvar Prompt do Sistema"}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={resetMutation.isPending}>
              {resetMutation.isPending ? "Restaurando..." : "Resetar para o padrão"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display">
                Restaurar o prompt padrão?
              </AlertDialogTitle>
              <AlertDialogDescription>
                O prompt customizado atual será apagado e o agente volta a usar o prompt padrão do
                sistema. A base de conhecimento continua sendo aplicada nos dois casos. Esta ação
                não pode ser desfeita — copie o texto antes se quiser guardá-lo.
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
      </div>
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

function TestAgentTab({ agent }: { agent: AiAgent }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId] = useState(() => `test_${Date.now()}`);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
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
          lead_id: null,
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
        setMessages((prev) => [...prev, { role: "agent", text }]);
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
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
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
          onClick={() => setMessages([])}
          disabled={messages.length === 0}
        >
          <Trash2 className="h-4 w-4 mr-1.5" />
          Limpar conversa
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="rounded-lg border bg-muted/30 p-4 overflow-y-auto space-y-3"
        style={{ height: 350 }}
      >
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            Envie uma mensagem para começar a testar o agente.
          </p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[80%] rounded-lg px-3 py-2 text-sm bg-forest-deep text-ivory"
                    : "max-w-[80%] rounded-lg px-3 py-2 text-sm bg-background border"
                }
              >
                {m.text}
              </div>
            </div>
          ))
        )}
        {sendMutation.isPending ? (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm bg-background border text-muted-foreground">
              Digitando...
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Digite uma mensagem..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
        />
        <Button onClick={handleSend} disabled={sendMutation.isPending || !input.trim()}>
          <Send className="h-4 w-4 mr-1.5" />
          Enviar
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Este é um ambiente de teste. As mensagens não são enviadas pelo WhatsApp nem salvas no CRM.
      </p>
    </div>
  );
}
