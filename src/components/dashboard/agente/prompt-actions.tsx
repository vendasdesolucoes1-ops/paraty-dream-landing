import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { readFunctionError } from "@/lib/utils";
import type { AiAgent, ChamadaPromptAgente } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ds/pill";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

interface PromptMontado {
  prompt: string;
  usa_prompt_customizado: boolean;
  lotes_disponiveis: number;
  rag: { modo?: string; motivo_recuo?: string | null } | null;
}

type Conteudo =
  | { tipo: "ultimo"; chamada: ChamadaPromptAgente | null }
  | { tipo: "montado"; dados: PromptMontado };

const PRE =
  "max-h-[45vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/50 p-3 font-mono text-[0.72rem] leading-relaxed";

function texto(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ai-agent-chat", { body });
  if (error) throw new Error(await readFunctionError(error));
  if (!data?.ok) throw new Error(data?.error ?? "Falha ao consultar o agente.");
  return data as T;
}

function Recolhivel({
  titulo,
  aberta,
  children,
}: {
  titulo: ReactNode;
  aberta?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={aberta} className="group rounded-xl border border-border bg-background">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium marker:text-muted-foreground">
        {titulo}
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}

// A aba "Prompt do Sistema" com textarea editável foi removida de propósito:
// gravar em ai_agents.system_prompt desliga o prompt versionado no código.
// "Resetar para o padrão" fica como rede de segurança, caso um system_prompt
// seja gravado por fora (SQL manual, por exemplo).
export function PromptActions({
  agent,
  instanceId,
  leadId,
}: {
  agent: AiAgent;
  instanceId: string;
  leadId: string | null;
}) {
  const queryClient = useQueryClient();
  const [conteudo, setConteudo] = useState<Conteudo | null>(null);

  const ultimoMutation = useMutation({
    mutationFn: () =>
      invocar<{ chamada: ChamadaPromptAgente | null }>({
        action: "ultimo_prompt",
        agent_id: agent.id,
      }),
    onSuccess: (d) => setConteudo({ tipo: "ultimo", chamada: d.chamada }),
    onError: (e: Error) => toast.error(e.message || "Não foi possível carregar o último prompt."),
  });

  const montarMutation = useMutation({
    mutationFn: () =>
      invocar<PromptMontado>({ action: "preview_prompt", agent_id: agent.id, lead_id: leadId }),
    onSuccess: (d) => setConteudo({ tipo: "montado", dados: d }),
    onError: (e: Error) => toast.error(e.message || "Não foi possível montar o prompt."),
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
      void queryClient.invalidateQueries({ queryKey: ["ai-agent", instanceId] });
    },
    onError: () => toast.error("Erro ao restaurar o prompt padrão."),
  });

  const temPromptCustomizado = Boolean(agent.system_prompt?.trim());
  const chamada = conteudo?.tipo === "ultimo" ? conteudo.chamada : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        disabled={ultimoMutation.isPending}
        onClick={() => ultimoMutation.mutate()}
      >
        <FileText className="h-4 w-4" aria-hidden />
        {ultimoMutation.isPending ? "Carregando..." : "Ver último prompt"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        disabled={montarMutation.isPending}
        onClick={() => montarMutation.mutate()}
      >
        <Wrench className="h-4 w-4" aria-hidden />
        {montarMutation.isPending ? "Montando..." : "Montar prompt agora"}
      </Button>

      <Dialog
        open={conteudo != null}
        onOpenChange={(v) => {
          if (!v) setConteudo(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              {conteudo?.tipo === "montado"
                ? "Prompt montado agora"
                : "Último prompt enviado ao modelo"}
            </DialogTitle>
          </DialogHeader>

          {conteudo?.tipo === "montado" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                O prompt de sistema que seria usado agora
                {leadId ? " para o lead de teste desta conversa" : ""}, com{" "}
                {conteudo.dados.lotes_disponiveis} lotes disponíveis e a base de conhecimento
                {conteudo.dados.rag?.modo ? ` (modo ${conteudo.dados.rag.modo})` : ""}.
              </p>
              {conteudo.dados.usa_prompt_customizado ? (
                <Pill tone="warning">Usando prompt customizado gravado no banco</Pill>
              ) : null}
              <pre className={PRE}>{conteudo.dados.prompt}</pre>
            </div>
          ) : conteudo?.tipo === "ultimo" && !chamada ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma chamada da Sophia registrada ainda. Envie uma mensagem na conversa de teste e
              abra de novo.
            </p>
          ) : chamada ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <Pill>{formatarData(chamada.criado_em)}</Pill>
                <Pill tone={chamada.canal === "teste" ? "info" : "success"}>
                  {chamada.canal === "teste" ? "Teste" : "Produção"}
                </Pill>
                {chamada.modelo ? <Pill>{chamada.modelo}</Pill> : null}
                <Pill>
                  Temperatura{" "}
                  {chamada.temperatura == null
                    ? "—"
                    : Number(chamada.temperatura).toLocaleString("pt-BR")}
                </Pill>
                <Pill>
                  Tokens {chamada.tokens_entrada ?? "—"} entrada · {chamada.tokens_saida ?? "—"}{" "}
                  saída
                </Pill>
                <Pill>
                  Custo estimado US${" "}
                  {chamada.custo_usd == null ? "—" : Number(chamada.custo_usd).toFixed(4)}
                </Pill>
                {chamada.latencia_ms != null ? (
                  <Pill>{(chamada.latencia_ms / 1000).toLocaleString("pt-BR")} s</Pill>
                ) : null}
              </div>
              {chamada.erro ? (
                <p className="rounded-lg bg-danger-soft p-2.5 text-sm text-danger">
                  Erro: {chamada.erro}
                </p>
              ) : null}

              <Recolhivel titulo="Prompt de sistema" aberta>
                <pre className={PRE}>{chamada.prompt ?? ""}</pre>
              </Recolhivel>
              <Recolhivel titulo={`Mensagens enviadas (${chamada.mensagens?.length ?? 0})`}>
                <div className="space-y-2">
                  {(chamada.mensagens ?? []).map((m, i) => (
                    <div key={i} className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {m.role}
                      </p>
                      <pre className={PRE}>
                        {texto(m.content)}
                        {m.tool_calls ? `\n\ntool_calls: ${texto(m.tool_calls)}` : ""}
                      </pre>
                    </div>
                  ))}
                </div>
              </Recolhivel>
              <Recolhivel titulo="Resposta">
                <pre className={PRE}>{chamada.resposta ?? "(sem texto)"}</pre>
              </Recolhivel>
              <Recolhivel titulo={`Ferramentas chamadas (${chamada.ferramentas?.length ?? 0})`}>
                {(chamada.ferramentas ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma.</p>
                ) : (
                  <div className="space-y-2">
                    {chamada.ferramentas!.map((f, i) => (
                      <div key={i} className="space-y-1">
                        <p className="font-mono text-xs font-medium">{f.nome}</p>
                        <pre className={PRE}>{texto(f.argumentos)}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </Recolhivel>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Só aparece quando há de fato um prompt customizado gravado. */}
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
