import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, RotateCcw, Send, Smartphone } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { readFunctionError } from "@/lib/utils";
import { telefoneValido, useConfigOperacao } from "@/lib/agente-ia";
import type { AiAgent, AiAgentModelo, RespostaTesteAgente } from "@/lib/types";
import { BOLHA_LEAD, CHAT_BG } from "@/components/whatsapp/chat-theme";
import { ChatBubble } from "@/components/whatsapp/chat-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ds/pill";
import { Campo } from "@/components/ajustes/campos";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PromptActions } from "@/components/dashboard/agente/prompt-actions";

type ItemConversa =
  | { tipo: "lead"; texto: string; at: string }
  | { tipo: "equipe"; texto: string; at: string }
  | { tipo: "sistema"; texto: string }
  | {
      tipo: "sophia";
      textos: string[];
      acoes: string[];
      leituras: string[];
      modelo: string | null;
      atalho: string | null;
      at: string;
    };

type Perfil = "whatsapp" | "formulario";

const PERFIL_FORMULARIO = {
  nome: "Carla Teste",
  cidade: "Taubaté",
  finalidade: "Morar",
  prazo_compra: "Nos próximos 3 meses",
  quer_visitar: "Sim, quero visitar",
  campanha_nome: "[TESTE] Formulário Visita",
};

const MODELOS_TESTE: AiAgentModelo[] = ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4o", "gpt-4.1"];
const MODELO_DO_AGENTE = "__agente";

const MOTIVO_SEM_RESPOSTA: Record<string, string> = {
  abortado: "Sophia não respondeu",
  sem_resposta: "Sophia não respondeu",
  falhou: "A resposta falhou",
};

// A conversa fica no sessionStorage: sair da aba (ou ir conferir o lead no
// CRM e voltar) desmontava o componente e apagava tudo.
const STORAGE = "ai-agent-test-chat-v2";

function carregarSalva(): { itens: ItemConversa[]; leadId: string | null } {
  try {
    const salvo = JSON.parse(sessionStorage.getItem(STORAGE) ?? "null");
    if (salvo && Array.isArray(salvo.itens)) {
      return { itens: salvo.itens, leadId: typeof salvo.leadId === "string" ? salvo.leadId : null };
    }
  } catch {
    // storage indisponível ou corrompido: começa limpo
  }
  return { itens: [], leadId: null };
}

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ai-agent-chat", { body });
  if (error) throw new Error(await readFunctionError(error));
  if (!data?.ok) throw new Error(data?.error ?? "Falha ao consultar o agente.");
  return data as T;
}

export function TesteAgenteTab({
  agent,
  instanceId,
  criatividade,
}: {
  agent: AiAgent;
  instanceId: string;
  criatividade: string;
}) {
  const [salva] = useState(carregarSalva);
  const [itens, setItens] = useState<ItemConversa[]>(salva.itens);
  const [leadId, setLeadId] = useState<string | null>(salva.leadId);
  const [input, setInput] = useState("");
  const [perfil, setPerfil] = useState<Perfil>("whatsapp");
  const [modelo, setModelo] = useState<string>(MODELO_DO_AGENTE);
  const [consultorNome, setConsultorNome] = useState("");
  const [consultorTelefone, setConsultorTelefone] = useState("");
  const [equipeAberta, setEquipeAberta] = useState(false);
  const [textoEquipe, setTextoEquipe] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: config } = useConfigOperacao();
  const semConsultor = config != null && config.consultor == null;

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE, JSON.stringify({ itens, leadId }));
    } catch {
      // cota estourada não pode quebrar o teste
    }
  }, [itens, leadId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [itens]);

  /** O perfil só vale para a primeira mensagem: é ela que cria o lead de teste. */
  function perfilDoEnvio() {
    return !leadId && perfil === "formulario" ? PERFIL_FORMULARIO : null;
  }

  const enviar = useMutation({
    mutationFn: (message: string) => {
      const consultorTeste =
        semConsultor && consultorNome.trim() && telefoneValido(consultorTelefone)
          ? { nome: consultorNome.trim(), telefone: consultorTelefone.replace(/\D/g, "") }
          : null;
      return invocar<RespostaTesteAgente>({
        action: "testar",
        agent_id: agent.id,
        lead_id: leadId,
        message,
        modelo: modelo === MODELO_DO_AGENTE ? null : modelo,
        consultor_teste: consultorTeste,
        perfil: perfilDoEnvio(),
      });
    },
    onSuccess: (r) => {
      setLeadId(r.lead_id);
      const novos: ItemConversa[] = [];
      const msgs = r.messages ?? [];
      if (msgs.length || r.acoes?.length || r.leituras?.length) {
        novos.push({
          tipo: "sophia",
          textos: msgs,
          acoes: r.acoes ?? [],
          leituras: r.leituras ?? [],
          modelo: r.modelo,
          atalho: r.atalho,
          at: new Date().toISOString(),
        });
      }
      if (r.resultado !== "enviado") {
        const prefixo = MOTIVO_SEM_RESPOSTA[r.resultado] ?? "Sophia não respondeu";
        novos.push({ tipo: "sistema", texto: r.motivo ? `${prefixo}: ${r.motivo}` : prefixo });
      }
      setItens((prev) => [...prev, ...novos]);
    },
    onError: (e: Error) => {
      toast.error(e.message || "Erro ao consultar o agente.");
      setItens((prev) => [...prev, { tipo: "sistema", texto: `Erro: ${e.message}` }]);
    },
  });

  const simularEquipe = useMutation({
    mutationFn: (message: string) =>
      invocar<{ lead_id: string; pausada: boolean }>({
        action: "simular_equipe",
        agent_id: agent.id,
        lead_id: leadId,
        message,
        perfil: perfilDoEnvio(),
      }),
    onSuccess: (r, message) => {
      setLeadId(r.lead_id);
      setItens((prev) => [
        ...prev,
        { tipo: "equipe", texto: message, at: new Date().toISOString() },
        { tipo: "sistema", texto: "IA pausada nesta conversa" },
      ]);
      setTextoEquipe("");
      setEquipeAberta(false);
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível simular a resposta."),
  });

  const ocupado = enviar.isPending || simularEquipe.isPending;

  function handleSend() {
    const texto = input.trim();
    if (!texto || ocupado) return;
    setItens((prev) => [...prev, { tipo: "lead", texto, at: new Date().toISOString() }]);
    setInput("");
    enviar.mutate(texto);
  }

  function novaConversa() {
    setItens([]);
    setLeadId(null);
    setEquipeAberta(false);
    try {
      sessionStorage.removeItem(STORAGE);
    } catch {
      // sem storage, o estado zerado já basta
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Pill>Modelo: {agent.modelo}</Pill>
          <Pill>Criatividade: {criatividade}</Pill>
          {agent.instrucoes_extras?.trim() ? (
            <Pill tone="info">Com instruções da equipe</Pill>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" onClick={novaConversa} disabled={itens.length === 0}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          Nova conversa
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          id="perfil_teste"
          label="Perfil do lead de teste"
          dica={leadId ? "Vale só no começo: clique em Nova conversa para trocar." : undefined}
        >
          <Select
            value={perfil}
            onValueChange={(v) => setPerfil(v as Perfil)}
            disabled={Boolean(leadId)}
          >
            <SelectTrigger id="perfil_teste">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="whatsapp">Lead do WhatsApp (sem dados)</SelectItem>
              <SelectItem value="formulario">
                Lead de formulário — compra em 3 meses e quer visitar
              </SelectItem>
            </SelectContent>
          </Select>
        </Campo>
        <Campo id="modelo_teste" label="Modelo" dica="Para comparar respostas; não muda o agente.">
          <Select value={modelo} onValueChange={setModelo}>
            <SelectTrigger id="modelo_teste">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={MODELO_DO_AGENTE}>Modelo do agente ({agent.modelo})</SelectItem>
              {MODELOS_TESTE.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
      </div>

      {semConsultor ? (
        <div className="space-y-2 rounded-xl border border-warning/40 bg-warning-soft p-3">
          <p className="text-xs text-muted-foreground">
            Não há consultor responsável salvo (aba Operação). Para o teste, informe um — os avisos
            de visita e transferência vão para este número.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              aria-label="Nome do consultor de teste"
              placeholder="Nome do consultor"
              value={consultorNome}
              onChange={(e) => setConsultorNome(e.target.value)}
            />
            <Input
              aria-label="Telefone do consultor de teste"
              inputMode="tel"
              placeholder="WhatsApp com DDD"
              value={consultorTelefone}
              onChange={(e) => setConsultorTelefone(e.target.value)}
              aria-invalid={Boolean(consultorTelefone) && !telefoneValido(consultorTelefone)}
            />
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="overflow-y-auto rounded-2xl border border-border p-4 shadow-[var(--shadow-card)]"
        style={{ height: 420, background: CHAT_BG }}
      >
        {itens.length === 0 ? (
          <p className="animate-swap rounded-lg bg-background/90 p-3 text-center text-sm text-muted-foreground">
            Envie uma mensagem como se fosse o lead para começar a conversa com a Sophia.
          </p>
        ) : (
          <div className="space-y-1">
            {itens.map((item, i) => {
              if (item.tipo === "lead") {
                return <ChatBubble key={i} texto={item.texto} nossa horario={hora(item.at)} />;
              }
              if (item.tipo === "sistema") {
                return (
                  <p
                    key={i}
                    className="mx-auto my-1.5 w-fit max-w-[90%] rounded-md bg-background/85 px-2.5 py-1 text-center text-[0.72rem] text-muted-foreground"
                  >
                    {item.texto}
                  </p>
                );
              }
              if (item.tipo === "equipe") {
                return (
                  <div key={i}>
                    <p className="px-1 text-[0.65rem] font-medium text-muted-foreground">
                      Equipe (celular)
                    </p>
                    <ChatBubble texto={item.texto} nossa={false} horario={hora(item.at)} />
                  </div>
                );
              }
              return (
                <div key={i} className="space-y-1">
                  {item.textos.map((t, j) => (
                    <ChatBubble key={j} texto={t} nossa={false} horario={hora(item.at)} />
                  ))}
                  {item.acoes.length || item.leituras.length || item.modelo || item.atalho ? (
                    <div className="max-w-[85%] space-y-0.5 rounded-md bg-background/80 px-2.5 py-1.5 font-mono text-[0.68rem] leading-relaxed text-muted-foreground">
                      {item.acoes.map((a, j) => (
                        <p key={`a${j}`}>{a.startsWith("⚙") ? a : `⚙ ${a}`}</p>
                      ))}
                      {item.leituras.map((l, j) => (
                        <p key={`l${j}`} className="opacity-80">
                          · {l}
                        </p>
                      ))}
                      <div className="flex flex-wrap gap-1 pt-0.5 font-sans">
                        {item.modelo ? <Pill className="text-[0.65rem]">{item.modelo}</Pill> : null}
                        {item.atalho ? (
                          <Pill tone="info" className="text-[0.65rem]">
                            Atalho: {item.atalho}
                          </Pill>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        {enviar.isPending ? (
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
          aria-label="Mensagem do lead"
          placeholder="Mensagem do lead"
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
          disabled={ocupado || !input.trim()}
          title="Enviar"
          aria-label="Enviar mensagem"
        >
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      {equipeAberta ? (
        <div className="flex animate-swap items-center gap-2 rounded-xl border border-border bg-background p-2">
          <Input
            autoFocus
            aria-label="Resposta da equipe pelo celular"
            placeholder="O que a equipe respondeu pelo celular"
            value={textoEquipe}
            onChange={(e) => setTextoEquipe(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && textoEquipe.trim() && !ocupado) {
                simularEquipe.mutate(textoEquipe.trim());
              }
            }}
          />
          <Button
            size="sm"
            disabled={ocupado || !textoEquipe.trim()}
            onClick={() => simularEquipe.mutate(textoEquipe.trim())}
          >
            {simularEquipe.isPending ? "Enviando..." : "Enviar"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEquipeAberta(false)}>
            Cancelar
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <PromptActions agent={agent} instanceId={instanceId} leadId={leadId} />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setEquipeAberta(true)}
            disabled={ocupado || equipeAberta}
          >
            <Smartphone className="h-4 w-4" aria-hidden />
            Simular resposta da equipe pelo celular
          </Button>
          {leadId ? (
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link to="/dashboard/crm" search={{ lead: leadId }}>
                <ExternalLink className="h-4 w-4" aria-hidden />
                Abrir o lead de teste no CRM
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Ambiente de teste: nada sai pelo WhatsApp do lead. A conversa roda o mesmo caminho da
        produção num lead marcado como TESTE no CRM. As linhas com ⚙ mostram o que a Sophia
        registrou e as com · o que ela consultou (o lead não vê).
      </p>
    </div>
  );
}
