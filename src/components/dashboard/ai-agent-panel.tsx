import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  ArrowRight,
  Bot,
  BookOpen,
  FileText,
  Hand,
  Loader2,
  MessageSquare,
  Power,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BOLHA_LEAD, CHAT_BG } from "@/components/whatsapp/chat-theme";
import { ChatBubble } from "@/components/whatsapp/chat-ui";
import type { AiAgent, AiAgentAutonomia, AiAgentModelo, AiAgentTomVoz } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Pill } from "@/components/ds/pill";
import { AreaChart } from "@/components/ds/area-chart";
import { PontoVivo } from "@/components/ajustes/ponto-vivo";
import { Campo, LinhaAjuste, Secao, SeloIcone } from "@/components/ajustes/campos";
import { SkeletonRows } from "@/components/ds/query-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
const RAG_MODO_KEY = "rag_modo";

// Mesmas opções aceitas pelas funções (_shared/modelos.ts e estilo-agente.ts).
const MODELOS_AGENTE: { valor: AiAgentModelo; rotulo: string; dica: string }[] = [
  {
    valor: "gpt-4o-mini",
    rotulo: "GPT-4o mini (padrão)",
    dica: "Rápido e barato. É o modelo em que os evals da Sophia passam hoje.",
  },
  {
    valor: "gpt-4o",
    rotulo: "GPT-4o",
    dica: "Entende melhor conversas difíceis, mas custa cerca de 15 vezes mais por resposta.",
  },
];
const TONS_AGENTE: { valor: AiAgentTomVoz; rotulo: string; exemplo: string }[] = [
  {
    valor: "profissional",
    rotulo: "Profissional (padrão)",
    exemplo: "Oi, Mariana! Temos lotes de 360 m² na quadra C. Quer conhecer no sábado?",
  },
  {
    valor: "amigavel",
    rotulo: "Amigável",
    exemplo: "Oi, Mariana, que bom te ver por aqui! Separei uns lotes lindos na quadra C pra você.",
  },
  {
    valor: "formal",
    rotulo: "Formal",
    exemplo:
      "Boa tarde, Mariana. Dispomos de lotes de 360 m² na quadra C. Gostaria de agendar uma visita?",
  },
  {
    valor: "informal",
    rotulo: "Informal",
    exemplo: "Opa, Mariana! Tem uns lotes massa na quadra C, bora marcar uma visita?",
  },
];

// ai_agents.autonomia (supabase/functions/_shared/ferramentas-sophia.ts).
const AUTONOMIAS: { valor: AiAgentAutonomia; rotulo: string; resumo: string; faz: string[] }[] = [
  {
    valor: "responder",
    rotulo: "Só conversa",
    resumo: "Atende, tira dúvidas e pré-qualifica. Não mexe no CRM.",
    faz: [
      "Responde dúvidas consultando lotes e a base",
      "Descobre nome, cidade, objetivo e tamanho na conversa",
      "Quem quer visitar: avisa o vendedor para combinar",
    ],
  },
  {
    valor: "qualificar",
    rotulo: "Qualifica e registra",
    resumo: "Tudo do anterior, e grava no CRM o que o lead conta.",
    faz: [
      "Preenche cidade, objetivo, tamanho e canal no card do lead",
      "Marca o lead como qualificado e avisa o vendedor com um resumo",
      "Quem quer visitar: avisa o vendedor para combinar",
    ],
  },
  {
    valor: "agendar",
    rotulo: "Qualifica, registra e agenda (padrão)",
    resumo: "Tudo do anterior, e marca a visita sozinha.",
    faz: [
      "Vê horários livres na agenda, dentro dos horários de visita",
      "Oferece 2 ou 3 opções e confirma a visita no CRM",
      "Fora do horário ou em conflito, a visita fica a confirmar",
    ],
  },
];

// ai_agents.temperatura. "padrao" grava nulo e usa o valor do código (0,4).
type Criatividade = "precisa" | "padrao" | "criativa";
const CRIATIVIDADES: {
  valor: Criatividade;
  temperatura: number | null;
  rotulo: string;
  dica: string;
}[] = [
  {
    valor: "precisa",
    temperatura: 0.2,
    rotulo: "Precisa",
    dica: "Respostas mais previsíveis e parecidas entre si. Boa para seguir a base ao pé da letra.",
  },
  {
    valor: "padrao",
    temperatura: null,
    rotulo: "Equilibrada (padrão)",
    dica: "O ajuste em que a Sophia foi testada.",
  },
  {
    valor: "criativa",
    temperatura: 0.7,
    rotulo: "Criativa",
    dica: "Mais variação no jeito de escrever. Pode soar mais natural, mas foge mais do roteiro.",
  },
];

function criatividadeDe(temperatura: number | null): Criatividade {
  if (temperatura == null) return "padrao";
  const t = Number(temperatura);
  if (t <= 0.3) return "precisa";
  if (t >= 0.6) return "criativa";
  return "padrao";
}

const LIMITE_INSTRUCOES = 2000;
const LIMITE_MENSAGEM_TRANSFERENCIA = 500;
const MENSAGEM_TRANSFERENCIA_PADRAO =
  "Claro! Já estou chamando alguém da equipe pra falar com você por aqui.||Só um instantinho.";

function bolhas(texto: string) {
  return texto
    .split("||")
    .map((m) => m.trim())
    .filter(Boolean);
}

/** Classes da navegação vertical das abas. */
const ABA =
  "justify-start gap-2.5 py-2 data-[state=active]:bg-muted data-[state=active]:shadow-none sm:w-full";

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

  const toggleMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      if (!agent) throw new Error("Agente não encontrado.");
      const { data, error } = await supabase
        .from("ai_agents")
        .update({ is_active: isActive })
        .eq("id", agent.id)
        .eq("instance_id", instanceId)
        .select("*")
        .single();
      if (error) throw error;
      if (data.is_active !== isActive) throw new Error("Status não foi atualizado.");
      return data as AiAgent;
    },
    onSuccess: (updatedAgent) => {
      queryClient.setQueryData(["ai-agent", instanceId], updatedAgent);
      void queryClient.invalidateQueries({ queryKey: ["ai-agent", instanceId] });
      toast.success(updatedAgent.is_active ? "IA ativada." : "IA pausada.");
    },
    onError: () => toast.error("Não foi possível alterar o status da IA. Tente novamente."),
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-border p-5">
        <div className="flex min-w-0 items-center gap-3">
          <SeloIcone icone={Bot} />
          <div className="min-w-0">
            <CardTitle className="text-[1.0625rem] leading-snug">Agente IA (Sophia)</CardTitle>
            <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
              Atendimento no WhatsApp, primeiro contato e follow-up desta instância
            </p>
          </div>
        </div>
        {agent ? (
          <div className="flex flex-wrap items-center gap-3">
            <Pill
              tone={agent.is_active ? "success" : "warning"}
              className="gap-2 px-3 py-1 text-xs"
            >
              <PontoVivo
                tom={agent.is_active ? "success" : "warning"}
                vivo={agent.is_active}
                className="h-2 w-2"
              />
              {agent.is_active ? "Ativo" : "Pausado"}
            </Pill>
            {agent.is_active ? (
              // Pausar tem efeito amplo (respostas, fila e cadências): confirma antes.
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={toggleMutation.isPending}>
                    {toggleMutation.isPending ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : (
                      <Power aria-hidden />
                    )}
                    {toggleMutation.isPending ? "Salvando..." : "Pausar IA"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-display">Pausar a IA?</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-2">
                        <p>Enquanto estiver pausada, nesta instância:</p>
                        <ul className="list-disc space-y-1 pl-5">
                          <li>a Sophia não responde os leads;</li>
                          <li>o primeiro contato com leads do site fica na fila;</li>
                          <li>cadências e campanhas de follow-up não enviam.</li>
                        </ul>
                        <p>
                          As mensagens recebidas continuam chegando ao CRM para a equipe responder.
                          Nada se perde: ao reativar, a fila volta a andar.
                        </p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => toggleMutation.mutate(false)}>
                      Pausar IA
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button
                size="sm"
                disabled={toggleMutation.isPending}
                onClick={() => toggleMutation.mutate(true)}
              >
                {toggleMutation.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Power aria-hidden />
                )}
                {toggleMutation.isPending ? "Salvando..." : "Ativar IA"}
              </Button>
            )}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="p-5">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !agent ? (
          <div className="flex animate-swap flex-col items-start gap-4 rounded-xl border border-dashed border-border p-6">
            <p className="max-w-lg text-[0.875rem] leading-relaxed text-muted-foreground">
              Nenhum agente configurado para esta instância. Crie o agente para começar a qualificar
              leads automaticamente pelo WhatsApp.
            </p>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Criando..." : "Criar Agente"}
            </Button>
          </div>
        ) : (
          // Navegação vertical: a lista de abas vira uma barra lateral à
          // esquerda do conteúdo. "Visão geral" abre primeiro: estado, números e
          // regras; as outras são teste e configuração.
          <Tabs defaultValue="visao" className="flex flex-col gap-6 sm:flex-row sm:gap-8">
            <TabsList className="h-auto w-full shrink-0 flex-row justify-start gap-1 overflow-x-auto bg-transparent p-0 sm:w-56 sm:flex-col sm:items-stretch sm:overflow-visible">
              <TabsTrigger value="visao" className={ABA}>
                <Activity className="h-4 w-4" aria-hidden />
                Visão geral
              </TabsTrigger>
              <TabsTrigger value="testar" className={ABA}>
                <MessageSquare className="h-4 w-4" aria-hidden />
                Testar agente
              </TabsTrigger>
              <TabsTrigger value="comportamento" className={ABA}>
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                Comportamento
              </TabsTrigger>
              <TabsTrigger value="transferencia" className={ABA}>
                <Hand className="h-4 w-4" aria-hidden />
                Transferência
              </TabsTrigger>
              <TabsTrigger value="rag" className={ABA}>
                <BookOpen className="h-4 w-4" aria-hidden />
                Base de conhecimento
              </TabsTrigger>
            </TabsList>

            <div className="min-w-0 flex-1">
              <TabsContent value="visao" className="mt-0">
                <VisaoGeralTab agent={agent} />
              </TabsContent>
              <TabsContent value="testar" className="mt-0">
                <TestAgentTab agent={agent} instanceId={instanceId} />
              </TabsContent>
              <TabsContent value="comportamento" className="mt-0">
                <ComportamentoTab agent={agent} instanceId={instanceId} />
              </TabsContent>
              <TabsContent value="transferencia" className="mt-0">
                <TransferenciaTab agent={agent} instanceId={instanceId} />
              </TabsContent>
              <TabsContent value="rag" className="mt-0">
                <KnowledgeBaseTab />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Visão geral

interface LinhaCustoDiario {
  dia: string;
  funcao: string;
  chamadas: number;
  erros: number;
  custo_usd: number;
  latencia_p50_ms: number | null;
}

const ROTULO_FUNCAO: Record<string, string> = {
  sophia: "Atendimento (Sophia)",
  extracao_qualificacao: "Qualificação do lead",
  extracao_visita: "Leitura de visita marcada",
  "followup-classificador": "Classificação de respostas (follow-up)",
  "followup-redator": "Rascunhos de follow-up",
};

const REGRAS_FIXAS: { regra: string; porque: string }[] = [
  {
    regra: "Nunca informa preço, entrada ou parcelas",
    porque: "Valores são apresentados na visita, com o consultor.",
  },
  {
    regra: "Quem pede para sair nunca mais recebe mensagem",
    porque: "Detectado antes da IA; só a gestão desfaz, com justificativa (LGPD).",
  },
  {
    regra: "Passa para uma pessoa quando o lead pede",
    porque: "Pausa a IA naquela conversa e avisa o vendedor.",
  },
  {
    regra: "Marca visita só nos horários disponíveis",
    porque: "Fora deles, a visita fica “a confirmar” para o vendedor.",
  },
  {
    regra: "Não se apresenta como robô, mas não mente",
    porque: "Se perguntarem diretamente, diz que é a assistente digital da equipe.",
  },
  {
    regra: "Só usa informações da base de conhecimento e dos lotes disponíveis",
    porque: "Evita inventar metragem, prazos ou promessas.",
  },
];

function formatarNumero(n: number, casas = 0) {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas });
}

function Indicador({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 font-display text-2xl tabular-nums">{valor}</p>
      {detalhe ? <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p> : null}
    </div>
  );
}

/** O que a Sophia precisa para atender bem: estoque, base e horários. */
function SaudeSophia() {
  const { data } = useQuery({
    queryKey: ["saude-sophia"],
    queryFn: async () => {
      const [lotes, config] = await Promise.all([
        supabase
          .from("lotes")
          .select("id", { count: "exact", head: true })
          .eq("status", "disponivel"),
        supabase
          .from("configuracoes")
          .select("chave, valor")
          .in("chave", [RAG_KEY, "janelas_visita"]),
      ]);
      const porChave = new Map((config.data ?? []).map((c) => [c.chave, c.valor ?? ""]));
      return {
        lotes: lotes.error ? null : (lotes.count ?? 0),
        base: (porChave.get(RAG_KEY) ?? "").trim().length,
        horarios: porChave.has("janelas_visita"),
      };
    },
  });
  if (!data) return null;

  const itens = [
    {
      ok: (data.lotes ?? 0) > 0,
      titulo:
        data.lotes == null
          ? "Não foi possível ler os lotes"
          : data.lotes > 0
            ? `${data.lotes} lotes disponíveis no cadastro`
            : "Nenhum lote disponível no cadastro",
      dica: "Sem estoque, a Sophia não consegue oferecer opções concretas. Atualize em Lotes.",
    },
    {
      ok: data.base >= 500,
      titulo:
        data.base >= 500
          ? `Base de conhecimento com ${data.base.toLocaleString("pt-BR")} caracteres`
          : data.base > 0
            ? "Base de conhecimento muito curta"
            : "Base de conhecimento vazia",
      dica: "É de onde ela tira localização, infraestrutura e diferenciais. Preencha na aba Base de conhecimento.",
    },
    {
      ok: data.horarios,
      titulo: data.horarios ? "Horários de visita configurados" : "Horários de visita no padrão",
      dica: "Ajuste em Horários de visita, nesta página, para ela só oferecer horários reais.",
    },
  ];
  const problemas = itens.filter((i) => !i.ok);

  return (
    <div
      className={`space-y-2 rounded-xl border p-4 ${problemas.length ? "border-warning/40 bg-warning-soft" : "border-border bg-background"}`}
    >
      <p className="text-sm font-medium">
        {problemas.length
          ? `${problemas.length} ${problemas.length === 1 ? "ponto deixa" : "pontos deixam"} a Sophia menos útil`
          : "A Sophia tem o que precisa para atender"}
      </p>
      <ul className="space-y-1.5">
        {itens.map((i) => (
          <li key={i.titulo} className="flex gap-2 text-sm">
            <span aria-hidden className={i.ok ? "text-success" : "text-warning"}>
              {i.ok ? "✓" : "!"}
            </span>
            <span>
              {i.titulo}
              {!i.ok ? <span className="block text-xs text-muted-foreground">{i.dica}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VisaoGeralTab({ agent }: { agent: AiAgent }) {
  const [dias, setDias] = useState(7);

  const {
    data: linhas,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["ai-custo-diario", dias],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC fora dos tipos gerados
      const { data, error } = await (supabase.rpc as any)("ai_custo_diario", { p_dias: dias });
      if (error) throw error;
      return ((data ?? []) as LinhaCustoDiario[]).map((l) => ({
        ...l,
        chamadas: Number(l.chamadas),
        erros: Number(l.erros),
        custo_usd: Number(l.custo_usd),
        latencia_p50_ms: l.latencia_p50_ms == null ? null : Number(l.latencia_p50_ms),
      }));
    },
  });

  const resumo = useMemo(() => {
    const todas = linhas ?? [];
    const sophia = todas.filter((l) => l.funcao === "sophia");
    const respostas = sophia.reduce((s, l) => s + l.chamadas, 0);
    const erros = sophia.reduce((s, l) => s + l.erros, 0);
    // Mediana diária ponderada pelo volume do dia: aproximação da mediana do período.
    const comLatencia = sophia.filter((l) => l.latencia_p50_ms != null && l.chamadas > 0);
    const pesoLatencia = comLatencia.reduce((s, l) => s + l.chamadas, 0);
    const latencia = pesoLatencia
      ? comLatencia.reduce((s, l) => s + (l.latencia_p50_ms ?? 0) * l.chamadas, 0) / pesoLatencia
      : null;
    const custo = todas.reduce((s, l) => s + l.custo_usd, 0);

    const porFuncao = new Map<string, { chamadas: number; erros: number; custo: number }>();
    for (const l of todas) {
      const f = porFuncao.get(l.funcao) ?? { chamadas: 0, erros: 0, custo: 0 };
      f.chamadas += l.chamadas;
      f.erros += l.erros;
      f.custo += l.custo_usd;
      porFuncao.set(l.funcao, f);
    }

    // Um ponto por dia do período, com zero nos dias sem conversa.
    const porDia = new Map(sophia.map((l) => [l.dia, l.chamadas]));
    const serie = Array.from({ length: dias }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (dias - 1 - i));
      const chave = d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      return {
        rotulo: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        valor: porDia.get(chave) ?? 0,
      };
    });

    return {
      respostas,
      taxaErro: respostas ? erros / respostas : 0,
      latencia,
      custo,
      porFuncao: [...porFuncao.entries()].sort((a, b) => b[1].custo - a[1].custo),
      serie,
    };
  }, [linhas, dias]);

  return (
    <div className="space-y-8">
      <div
        className={`rounded-xl border p-4 ${agent.is_active ? "border-border bg-background" : "border-warning/40 bg-warning-soft"}`}
      >
        <LinhaAjuste
          titulo={
            <span className="flex items-center gap-2">
              <PontoVivo tom={agent.is_active ? "success" : "warning"} vivo={agent.is_active} />
              {agent.is_active ? "A Sophia está atendendo" : "A Sophia está pausada"}
            </span>
          }
          descricao={
            agent.is_active
              ? "Responde os leads em segundos, faz o primeiro contato com quem veio do site e envia as cadências de follow-up ligadas."
              : "Ninguém recebe resposta automática, primeiro contato nem follow-up desta instância. As mensagens continuam chegando ao CRM."
          }
          controle={
            <div className="flex flex-wrap justify-end gap-1.5">
              <Pill>
                {AUTONOMIAS.find((a) => a.valor === agent.autonomia)?.rotulo.replace(
                  " (padrão)",
                  "",
                ) ?? "Agenda"}
              </Pill>
              <Pill>{agent.modelo}</Pill>
              <Pill>
                {TONS_AGENTE.find((t) => t.valor === agent.tom_voz)?.rotulo.replace(
                  " (padrão)",
                  "",
                ) ?? agent.tom_voz}
              </Pill>
            </div>
          }
        />
      </div>

      <SaudeSophia />

      <Secao titulo="Desempenho">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.8125rem] text-muted-foreground">
            Números de todas as instâncias, registrados a cada chamada de IA.
          </p>
          <Select value={String(dias)} onValueChange={(v) => setDias(Number(v))}>
            <SelectTrigger className="w-40" aria-label="Período">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <SkeletonRows rows={2} />
        ) : isError ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Não foi possível carregar os números agora. Eles aparecem para admin e gestor depois que
            o banco estiver atualizado.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Indicador
                rotulo="Respostas da Sophia"
                valor={formatarNumero(resumo.respostas)}
                detalhe={`${formatarNumero(resumo.respostas / dias, 1)} por dia`}
              />
              <Indicador
                rotulo="Falhas"
                valor={`${formatarNumero(resumo.taxaErro * 100, 1)}%`}
                detalhe="das respostas (o lead recebe um texto seguro)"
              />
              <Indicador
                rotulo="Tempo para responder"
                valor={
                  resumo.latencia == null ? "—" : `${formatarNumero(resumo.latencia / 1000, 1)} s`
                }
                detalhe="mediano, só a IA"
              />
              <Indicador
                rotulo="Custo de IA"
                valor={`US$ ${formatarNumero(resumo.custo, 2)}`}
                detalhe="todas as funções no período"
              />
            </div>

            {resumo.respostas > 0 ? (
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="mb-3 text-xs text-muted-foreground">Respostas da Sophia por dia</p>
                <AreaChart dados={resumo.serie} rotuloGrafico="Respostas da Sophia por dia" />
              </div>
            ) : null}

            {resumo.porFuncao.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Uso de IA</th>
                      <th className="px-4 py-2 text-right font-medium">Chamadas</th>
                      <th className="px-4 py-2 text-right font-medium">Falhas</th>
                      <th className="px-4 py-2 text-right font-medium">Custo (US$)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {resumo.porFuncao.map(([funcao, v]) => (
                      <tr key={funcao}>
                        <td className="px-4 py-2">{ROTULO_FUNCAO[funcao] ?? funcao}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatarNumero(v.chamadas)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatarNumero(v.erros)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatarNumero(v.custo, 2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma chamada de IA no período.</p>
            )}
          </>
        )}
      </Secao>

      <Secao
        titulo="Regras fixas"
        descricao="Valem sempre, mesmo com as instruções da equipe. Mudar alguma delas exige alteração no código."
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {REGRAS_FIXAS.map((r) => (
            <li
              key={r.regra}
              className="flex gap-3 rounded-xl border border-border bg-background p-3"
            >
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
              <div>
                <p className="text-sm font-medium">{r.regra}</p>
                <p className="text-xs text-muted-foreground">{r.porque}</p>
              </div>
            </li>
          ))}
        </ul>
      </Secao>

      <Secao titulo="Também influencia a Sophia">
        <ul className="space-y-2 text-sm">
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background p-3">
            <span>
              <b className="font-medium">Horários de visita</b>
              <span className="text-muted-foreground"> · quando ela pode marcar visita</span>
            </span>
            <span className="text-xs text-muted-foreground">Nesta página, abaixo</span>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background p-3">
            <span>
              <b className="font-medium">Lotes disponíveis</b>
              <span className="text-muted-foreground"> · o que ela oferece, em tempo real</span>
            </span>
            <span className="text-xs text-muted-foreground">Cadastro de lotes</span>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background p-3">
            <span>
              <b className="font-medium">Cadências e regras de envio</b>
              <span className="text-muted-foreground">
                {" "}
                · follow-up, limite diário e aquecimento
              </span>
            </span>
            <Button asChild variant="ghost" size="sm">
              <Link to="/dashboard/cadencias">
                Abrir Follow-up
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </li>
        </ul>
      </Secao>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comportamento

/** Barra de salvar que mostra quando há alteração pendente. */
function BarraSalvar({
  alterado,
  salvando,
  onSalvar,
  onDescartar,
  rotulo = "Salvar alterações",
}: {
  alterado: boolean;
  salvando: boolean;
  onSalvar: () => void;
  onDescartar: () => void;
  rotulo?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
      <Button onClick={onSalvar} disabled={!alterado || salvando}>
        {salvando ? "Salvando..." : rotulo}
      </Button>
      <Button variant="ghost" onClick={onDescartar} disabled={!alterado || salvando}>
        Descartar
      </Button>
      {alterado ? <span className="text-xs text-warning">Alterações não salvas</span> : null}
    </div>
  );
}

function ComportamentoTab({ agent, instanceId }: { agent: AiAgent; instanceId: string }) {
  const queryClient = useQueryClient();
  const inicial = useMemo(
    () => ({
      mensagem_boas_vindas: agent.mensagem_boas_vindas ?? "",
      modelo: agent.modelo,
      tom_voz: agent.tom_voz,
      usar_emojis: agent.usar_emojis,
      ser_breve: agent.ser_breve,
      criatividade: criatividadeDe(agent.temperatura),
      instrucoes_extras: agent.instrucoes_extras ?? "",
      autonomia: agent.autonomia ?? "agendar",
    }),
    [agent],
  );
  const [form, setForm] = useState(inicial);
  useEffect(() => setForm(inicial), [inicial]);
  const alterado = JSON.stringify(form) !== JSON.stringify(inicial);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ai_agents")
        .update({
          mensagem_boas_vindas: form.mensagem_boas_vindas.trim() || null,
          modelo: form.modelo,
          tom_voz: form.tom_voz,
          usar_emojis: form.usar_emojis,
          ser_breve: form.ser_breve,
          temperatura:
            CRIATIVIDADES.find((c) => c.valor === form.criatividade)?.temperatura ?? null,
          instrucoes_extras: form.instrucoes_extras.trim() || null,
          autonomia: form.autonomia,
        } as never)
        .eq("id", agent.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Comportamento do agente salvo. Vale a partir da próxima mensagem.");
      queryClient.invalidateQueries({ queryKey: ["ai-agent", instanceId] });
    },
    onError: () => toast.error("Erro ao salvar as configurações."),
  });

  const tomAtual = TONS_AGENTE.find((t) => t.valor === form.tom_voz);
  const modeloAtual = MODELOS_AGENTE.find((m) => m.valor === form.modelo);
  const criatividadeAtual = CRIATIVIDADES.find((c) => c.valor === form.criatividade);

  return (
    <div className="max-w-2xl space-y-8">
      <Secao
        titulo="Autonomia"
        descricao="O quanto a Sophia age sozinha. Pedido para sair e transferência para uma pessoa funcionam em todos os níveis."
      >
        <div role="radiogroup" aria-label="Autonomia" className="grid gap-3">
          {AUTONOMIAS.map((a) => {
            const ativo = form.autonomia === a.valor;
            return (
              <button
                key={a.valor}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => setForm((f) => ({ ...f, autonomia: a.valor }))}
                className={`rounded-xl border p-4 text-left transition-colors ${ativo ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-background hover:bg-muted/50"}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`flex h-4 w-4 items-center justify-center rounded-full border ${ativo ? "border-primary" : "border-muted-foreground/50"}`}
                  >
                    {ativo ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                  </span>
                  <span className="text-sm font-medium">{a.rotulo}</span>
                </div>
                <p className="mt-1 pl-6 text-[0.8125rem] text-muted-foreground">{a.resumo}</p>
                <ul className="mt-2 space-y-0.5 pl-6 text-xs text-muted-foreground">
                  {a.faz.map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      </Secao>

      <Secao
        titulo="Apresentação"
        descricao="Como a Sophia abre a conversa. Ela usa o espírito do texto e adapta ao que o lead escreveu; não copia palavra por palavra."
      >
        <Campo
          id="welcome_message"
          label="Abertura sugerida"
          dica="Deixe vazio para usar a abertura padrão."
        >
          <Textarea
            id="welcome_message"
            rows={2}
            placeholder="Olá! Que bom que você se interessou pelo Moradas de Paraty..."
            value={form.mensagem_boas_vindas}
            onChange={(e) => setForm((f) => ({ ...f, mensagem_boas_vindas: e.target.value }))}
          />
        </Campo>
      </Secao>

      <Secao titulo="Estilo">
        <Campo id="tom_voz" label="Tom de voz">
          <Select
            value={form.tom_voz}
            onValueChange={(v) => setForm((f) => ({ ...f, tom_voz: v as AiAgentTomVoz }))}
          >
            <SelectTrigger id="tom_voz">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TONS_AGENTE.map((t) => (
                <SelectItem key={t.valor} value={t.valor}>
                  {t.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
        {tomAtual ? (
          <div className="rounded-2xl p-3" style={{ background: CHAT_BG }}>
            <p className="mb-1 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
              Exemplo neste tom
            </p>
            <ChatBubble texto={tomAtual.exemplo} nossa={false} horario="" />
          </div>
        ) : null}

        <div className="space-y-4 rounded-xl border border-border bg-background p-4">
          <LinhaAjuste
            titulo="Usar emojis"
            descricao="No máximo um por resposta, e nunca ao falar de recusa ou problema."
            controle={
              <Switch
                checked={form.usar_emojis}
                onCheckedChange={(v) => setForm((f) => ({ ...f, usar_emojis: v }))}
                aria-label="Usar emojis"
              />
            }
          />
          <LinhaAjuste
            titulo="Respostas breves"
            descricao="Mensagens curtas, uma ideia por vez. Desligado, ela explica com mais detalhe quando o lead pergunta algo concreto."
            controle={
              <Switch
                checked={form.ser_breve}
                onCheckedChange={(v) => setForm((f) => ({ ...f, ser_breve: v }))}
                aria-label="Respostas breves"
              />
            }
          />
        </div>

        <Campo id="criatividade" label="Criatividade" dica={criatividadeAtual?.dica}>
          <Select
            value={form.criatividade}
            onValueChange={(v) => setForm((f) => ({ ...f, criatividade: v as Criatividade }))}
          >
            <SelectTrigger id="criatividade">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CRIATIVIDADES.map((c) => (
                <SelectItem key={c.valor} value={c.valor}>
                  {c.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
      </Secao>

      <Secao
        titulo="Instruções da equipe"
        descricao="Orientações extras que a Sophia segue em toda conversa. Não liberam preço, não fazem insistir com quem pediu para sair e não mudam os horários de visita: as regras fixas sempre valem."
      >
        <Campo
          id="instrucoes_extras"
          label="Instruções"
          dica={
            <>
              Exemplos: “Sempre mencione que o condomínio fica a 4 minutos da praia.” · “Se o lead
              for de São Paulo, ofereça visita no fim de semana.” · “Não use a palavra
              investimento.”
            </>
          }
        >
          <div className="relative">
            <Textarea
              id="instrucoes_extras"
              rows={6}
              maxLength={LIMITE_INSTRUCOES}
              placeholder="Uma orientação por linha."
              value={form.instrucoes_extras}
              onChange={(e) => setForm((f) => ({ ...f, instrucoes_extras: e.target.value }))}
            />
            <span className="absolute bottom-2 right-3 rounded bg-card/90 px-1.5 text-xs tabular-nums text-muted-foreground">
              {form.instrucoes_extras.length}/{LIMITE_INSTRUCOES}
            </span>
          </div>
        </Campo>
      </Secao>

      <Secao titulo="Modelo de IA">
        <Campo
          id="modelo"
          label="Modelo"
          dica={`${modeloAtual?.dica ?? ""} Mude só depois de rodar os evals da Sophia com o modelo novo.`}
        >
          <Select
            value={form.modelo}
            onValueChange={(v) => setForm((f) => ({ ...f, modelo: v as AiAgentModelo }))}
          >
            <SelectTrigger id="modelo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELOS_AGENTE.map((m) => (
                <SelectItem key={m.valor} value={m.valor}>
                  {m.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
      </Secao>

      <BarraSalvar
        alterado={alterado}
        salvando={saveMutation.isPending}
        onSalvar={() => saveMutation.mutate()}
        onDescartar={() => setForm(inicial)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transferência para humano

function TransferenciaTab({ agent, instanceId }: { agent: AiAgent; instanceId: string }) {
  const queryClient = useQueryClient();
  const inicial = useMemo(
    () => ({
      ativo: agent.transfer_to_human_enabled,
      palavras: agent.transfer_keywords ?? [],
      mensagem: agent.mensagem_transferencia ?? "",
    }),
    [agent],
  );
  const [form, setForm] = useState(inicial);
  const [novaPalavra, setNovaPalavra] = useState("");
  useEffect(() => setForm(inicial), [inicial]);
  const alterado = JSON.stringify(form) !== JSON.stringify(inicial);

  function adicionarPalavra() {
    const p = novaPalavra.trim().toLowerCase();
    setNovaPalavra("");
    if (!p || form.palavras.some((x) => x.toLowerCase() === p)) return;
    setForm((f) => ({ ...f, palavras: [...f.palavras, p] }));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ai_agents")
        .update({
          transfer_to_human_enabled: form.ativo,
          transfer_keywords: form.palavras,
          mensagem_transferencia: form.mensagem.trim() || null,
        } as never)
        .eq("id", agent.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transferência para humano salva.");
      queryClient.invalidateQueries({ queryKey: ["ai-agent", instanceId] });
    },
    onError: () => toast.error("Erro ao salvar a transferência."),
  });

  const previa = bolhas(form.mensagem.trim() || MENSAGEM_TRANSFERENCIA_PADRAO);

  return (
    <div className="max-w-2xl space-y-8">
      <div className="rounded-xl border border-border bg-background p-4">
        <LinhaAjuste
          titulo="Transferir por palavra-chave"
          descricao="Quando o lead escreve uma das palavras abaixo, a Sophia responde com a mensagem de transferência, para de responder naquela conversa e o vendedor é avisado."
          controle={
            <Switch
              checked={form.ativo}
              onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))}
              aria-label="Transferir por palavra-chave"
            />
          }
        />
      </div>

      <Secao
        titulo="Palavras-chave"
        descricao="Basta a mensagem conter a palavra, sem diferença de maiúsculas. Além delas, a Sophia também transfere quando entende que o lead quer falar com uma pessoa."
      >
        <div className="flex flex-wrap gap-2">
          {form.palavras.length === 0 ? (
            <span className="text-sm text-muted-foreground">Nenhuma palavra cadastrada.</span>
          ) : (
            form.palavras.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-sm"
              >
                {p}
                <button
                  type="button"
                  aria-label={`Remover ${p}`}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                  onClick={() =>
                    setForm((f) => ({ ...f, palavras: f.palavras.filter((x) => x !== p) }))
                  }
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <Input
            aria-label="Nova palavra-chave"
            placeholder="Ex.: consultor"
            value={novaPalavra}
            onChange={(e) => setNovaPalavra(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                adicionarPalavra();
              }
            }}
          />
          <Button variant="outline" onClick={adicionarPalavra} disabled={!novaPalavra.trim()}>
            Adicionar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Evite palavras comuns demais (como “oi” ou “lote”): qualquer mensagem com elas pararia a
          IA. “Sair”, “parar” e similares são tratados à parte, como pedido de saída.
        </p>
      </Secao>

      <Secao titulo="Mensagem de transferência">
        <Campo
          id="mensagem_transferencia"
          label="O que a Sophia diz ao transferir"
          dica="Use || para separar em mais de uma mensagem. Vazio usa o texto padrão."
        >
          <Textarea
            id="mensagem_transferencia"
            rows={2}
            maxLength={LIMITE_MENSAGEM_TRANSFERENCIA}
            placeholder={MENSAGEM_TRANSFERENCIA_PADRAO}
            value={form.mensagem}
            onChange={(e) => setForm((f) => ({ ...f, mensagem: e.target.value }))}
          />
        </Campo>
        <div className="space-y-1 rounded-2xl p-3" style={{ background: CHAT_BG }}>
          <p className="mb-1 text-[0.7rem] uppercase tracking-wide text-muted-foreground">Prévia</p>
          {previa.map((b, i) => (
            <ChatBubble key={i} texto={b} nossa={false} horario="" />
          ))}
        </div>
      </Secao>

      <BarraSalvar
        alterado={alterado}
        salvando={saveMutation.isPending}
        onSalvar={() => saveMutation.mutate()}
        onDescartar={() => setForm(inicial)}
      />
    </div>
  );
}

/** Só o horário, para o carimbo dentro da bolha. */
function formatHoraTeste(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

interface ChatMessage {
  /** "acao": o que a Sophia fez com as ferramentas (só no painel, fora do histórico). */
  role: "user" | "agent" | "acao";
  text: string;
  /** ISO do envio, para o carimbo de hora na bolha. Ausente em conversas
      salvas antes deste campo existir. */
  at?: string;
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
            <FileText className="h-4 w-4" aria-hidden />
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
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/50 p-4 text-xs leading-relaxed">
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
              className="text-warning hover:bg-warning-soft hover:text-warning"
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
        .select("chave, valor")
        .in("chave", [RAG_KEY, RAG_MODO_KEY]);
      if (error) throw error;
      const porChave = new Map((data ?? []).map((c) => [c.chave, c.valor ?? ""]));
      return {
        texto: porChave.get(RAG_KEY) ?? "",
        // Só "completo" desliga a busca (resolverConhecimento em _shared/rag.ts).
        buscaInteligente:
          (porChave.get(RAG_MODO_KEY) ?? "busca").trim().toLowerCase() !== "completo",
      };
    },
  });

  useEffect(() => {
    if (data != null) {
      setText(data.texto);
      originalRef.current = data.texto;
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("configuracoes")
        .upsert({ chave: RAG_KEY, valor: text }, { onConflict: "chave" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Base de conhecimento salva. A busca é reindexada automaticamente.");
      originalRef.current = text;
      queryClient.invalidateQueries({ queryKey: ["rag-conhecimento"] });
    },
    onError: () => toast.error("Erro ao salvar a base de conhecimento."),
  });

  const modoMutation = useMutation({
    mutationFn: async (buscaInteligente: boolean) => {
      const { error } = await supabase
        .from("configuracoes")
        .upsert(
          { chave: RAG_MODO_KEY, valor: buscaInteligente ? "busca" : "completo" },
          { onConflict: "chave" },
        );
      if (error) throw error;
    },
    onSuccess: (_d, buscaInteligente) => {
      toast.success(
        buscaInteligente
          ? "Busca inteligente ligada: a Sophia lê só os trechos relevantes."
          : "A Sophia passa a ler a base inteira em toda resposta.",
      );
      queryClient.invalidateQueries({ queryKey: ["rag-conhecimento"] });
    },
    onError: () => toast.error("Não foi possível trocar o modo da base."),
  });

  if (isLoading) {
    return <SkeletonRows rows={1} className="h-96" />;
  }

  const alterado = text !== originalRef.current;

  return (
    <div className="space-y-6">
      <p className="text-[0.875rem] leading-relaxed text-muted-foreground">
        É o que a Sophia sabe sobre o empreendimento: localização, infraestrutura, tamanhos de lote,
        documentação, diferenciais e perguntas frequentes. Valores e condições de pagamento não
        entram: a Sophia nunca informa números (eles ficam em Condições comerciais).
      </p>

      <div className="rounded-xl border border-border bg-background p-4">
        <LinhaAjuste
          titulo="Busca inteligente"
          descricao="Ligada (recomendado), a Sophia lê só os trechos da base ligados à pergunta, o que reduz custo e confusão em bases grandes. Desligada, ela lê a base inteira em toda resposta."
          controle={
            <Switch
              checked={data?.buscaInteligente ?? true}
              disabled={modoMutation.isPending}
              onCheckedChange={(v) => modoMutation.mutate(v)}
              aria-label="Busca inteligente"
            />
          }
        />
      </div>

      <div className="relative">
        <Textarea
          aria-label="Base de conhecimento"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ minHeight: 400 }}
          className="resize-y"
        />
        <span className="absolute bottom-2.5 right-3 rounded bg-card/90 px-1.5 text-xs tabular-nums text-muted-foreground">
          {text.length.toLocaleString("pt-BR")} caracteres
        </span>
      </div>

      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>Use títulos e parágrafos curtos por assunto; a busca encontra melhor assim.</li>
        <li>Escreva fatos, não ordens: “O condomínio tem portaria 24 h”, não “diga que…”.</li>
        <li>Teste depois de salvar, na aba Testar agente, perguntando sobre o que mudou.</li>
      </ul>

      <BarraSalvar
        alterado={alterado}
        salvando={saveMutation.isPending}
        onSalvar={() => saveMutation.mutate()}
        onDescartar={() => setText(originalRef.current)}
        rotulo="Salvar base de conhecimento"
      />
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
      const history = messages
        .filter((m) => m.role !== "acao")
        .map((m) => ({
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
      const result = data as { messages: string[]; acoes?: { resumo: string }[] };

      if (result.acoes?.length) {
        setMessages((prev) => [
          ...prev,
          ...result.acoes!.map((a) => ({ role: "acao" as const, text: a.resumo })),
        ]);
      }

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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Pill>Modelo: {agent.modelo}</Pill>
          <Pill>
            Criatividade:{" "}
            {CRIATIVIDADES.find(
              (c) => c.valor === criatividadeDe(agent.temperatura),
            )?.rotulo.replace(" (padrão)", "")}
          </Pill>
          {agent.instrucoes_extras?.trim() ? (
            <Pill tone="info">Com instruções da equipe</Pill>
          ) : null}
        </div>
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
          <Trash2 className="h-4 w-4" aria-hidden />
          Limpar conversa
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="overflow-y-auto rounded-2xl border border-border p-4 shadow-[var(--shadow-card)]"
        style={{ height: 380, background: CHAT_BG }}
      >
        {messages.length === 0 ? (
          <p className="animate-swap rounded-lg bg-background/90 p-3 text-center text-sm text-muted-foreground">
            Envie uma mensagem para começar a conversa com a Sophia.
          </p>
        ) : (
          <div className="space-y-1">
            {messages.map((m, i) =>
              m.role === "acao" ? (
                <p
                  key={i}
                  className="mx-auto my-1 w-fit max-w-[90%] rounded-md bg-background/85 px-2.5 py-1 text-center text-[0.7rem] text-muted-foreground"
                >
                  ⚙ {m.text}
                </p>
              ) : (
                <ChatBubble
                  key={i}
                  texto={m.text}
                  nossa={m.role === "user"}
                  horario={m.at ? formatHoraTeste(m.at) : ""}
                />
              ),
            )}
          </div>
        )}
        {sendMutation.isPending ? (
          <div className="flex justify-start pt-1">
            <div
              className="rounded-lg rounded-tl-sm px-2.5 py-1.5 text-sm italic text-muted-foreground shadow-sm motion-safe:animate-pulse"
              style={{ background: BOLHA_LEAD }}
            >
              Digitando...
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/60 p-2">
        <Input
          aria-label="Mensagem para o agente"
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
          aria-label="Enviar mensagem"
        >
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <PromptActions agent={agent} instanceId={instanceId} />
      </div>

      <p className="text-xs text-muted-foreground">
        Ambiente de teste: nada é enviado pelo WhatsApp do lead. A conversa cria um card marcado
        como TESTE no CRM, para você acompanhar a movimentação automática. As linhas com ⚙ mostram o
        que a Sophia consultou ou registrou (o lead não vê).
      </p>
    </div>
  );
}
