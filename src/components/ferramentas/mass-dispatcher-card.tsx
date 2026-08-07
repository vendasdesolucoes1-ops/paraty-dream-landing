import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { parseContactsCsv, parseManualContacts } from "@/lib/csv";
import type { Lead, LeadStatus, WhatsappInstance } from "@/lib/types";
import { LEAD_STATUS_COLUMNS } from "@/lib/types";
import { ToolCard } from "@/components/ferramentas/tool-card";
import { DispatchHistoryPanel } from "@/components/ferramentas/dispatch-history-panel";
import { LeadSelectionList } from "@/components/ferramentas/lead-selection-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Badge } from "@/components/ui/badge";

type ContactSource = "crm" | "selecao" | "csv" | "manual";
type DispatchState = "idle" | "running" | "paused" | "done";

interface Contact {
  nome: string;
  telefone: string;
  leadId?: string;
}

interface LogEntry {
  telefone: string;
  status: "Enviado" | "Erro";
  horario: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Inteiro entre min e max, inclusive nas duas pontas. */
function sortearSegundos(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function MassDispatcherCard() {
  const queryClient = useQueryClient();
  const [instanceId, setInstanceId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [source, setSource] = useState<ContactSource>("crm");
  const [crmStatusFilter, setCrmStatusFilter] = useState<LeadStatus | "todos">("todos");
  const [csvContacts, setCsvContacts] = useState<Contact[]>([]);
  const [manualText, setManualText] = useState("");
  // Seleção manual de leads (fonte "selecao"): ids escolhidos a dedo, em vez de
  // aceitar todo mundo que casa com um filtro de status.
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [interval, setIntervalValue] = useState(15);
  // Intervalo aleatório: 15s exatos entre cada envio, centenas de vezes, é a
  // assinatura que a detecção de automação procura. Sorteando dentro de uma
  // faixa o ritmo deixa de ser previsível.
  const [randomInterval, setRandomInterval] = useState(false);
  const [intervalRange, setIntervalRange] = useState<[number, number]>([10, 30]);
  const [dispatchState, setDispatchState] = useState<DispatchState>("idle");
  const [sentCount, setSentCount] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);

  const stopRef = useRef(false);
  const pauseRef = useRef(false);

  const { data: instances } = useQuery({
    queryKey: ["whatsapp-instances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as WhatsappInstance[];
    },
  });

  const { data: crmLeads } = useQuery({
    queryKey: ["ferramentas-crm-leads", crmStatusFilter],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("*")
        .is("deletado_em", null)
        .not("telefone", "is", null);
      if (crmStatusFilter !== "todos") query = query.eq("status_crm", crmStatusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data as Lead[];
    },
    enabled: source === "crm",
  });

  const manualContacts = useMemo(() => parseManualContacts(manualText), [manualText]);

  // Os leads escolhidos vêm de outra consulta que não a do filtro por status:
  // a seleção é por id e ignora status, então reaproveitar `crmLeads` traria
  // só os que casam com o filtro atual da outra fonte.
  const { data: leadsSelecionados } = useQuery({
    queryKey: ["disparador-leads-selecionados", [...selectedLeadIds].sort().join(",")],
    queryFn: async () => {
      if (selectedLeadIds.size === 0) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, telefone")
        .in("id", [...selectedLeadIds]);
      if (error) throw error;
      return data as Pick<Lead, "id" | "nome" | "telefone">[];
    },
    enabled: source === "selecao" && selectedLeadIds.size > 0,
  });

  const contacts: Contact[] = useMemo(() => {
    if (source === "crm") {
      return (crmLeads ?? [])
        .filter((l) => l.telefone)
        .map((l) => ({ nome: l.nome, telefone: l.telefone as string, leadId: l.id }));
    }
    if (source === "selecao") {
      return (leadsSelecionados ?? [])
        .filter((l) => l.telefone)
        .map((l) => ({ nome: l.nome, telefone: l.telefone as string, leadId: l.id }));
    }
    if (source === "csv") return csvContacts;
    return manualContacts;
  }, [source, crmLeads, leadsSelecionados, csvContacts, manualContacts]);

  const selectedInstance = instances?.find((i) => i.id === instanceId);

  function handleCsvUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseContactsCsv(String(reader.result ?? ""));
      setCsvContacts(parsed);
      toast.success(`${parsed.length} contatos carregados do CSV.`);
    };
    reader.readAsText(file);
  }

  async function runDispatch() {
    if (!selectedInstance) {
      toast.error("Selecione uma instância.");
      return;
    }
    if (!message.trim()) {
      toast.error("Escreva uma mensagem.");
      return;
    }
    if (contacts.length === 0) {
      toast.error("Nenhum contato para disparar.");
      return;
    }

    stopRef.current = false;
    pauseRef.current = false;
    setDispatchState("running");
    setSentCount(0);
    setLog([]);

    // Snapshot da instância e do filtro no momento do início: se o usuário
    // mudar a fonte/filtro na tela enquanto a campanha corre, o registro já
    // gravado não deve mudar de baixo dela.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: campanha, error: campanhaError } = await supabase
      .from("disparos_campanha")
      // Cast: os tipos gerados em integrations/supabase/types.ts ainda não
      // conhecem intervalo_min/max_segundos — a migration é aplicada à mão e o
      // arquivo é regerado depois. Sem isto o insert inteiro vira `never`.
      .insert({
        instancia_id: selectedInstance.id,
        instancia_nome: selectedInstance.instance_name,
        mensagem_template: message,
        // O CHECK da tabela só aceita crm/csv/manual, e a seleção manual é,
        // na origem, leads do CRM — só que escolhidos a dedo em vez de por
        // filtro. Gravar como 'crm' mantém o histórico coerente sem migration.
        fonte_contatos: source === "selecao" ? "crm" : source,
        filtro_status: source === "crm" && crmStatusFilter !== "todos" ? crmStatusFilter : null,
        // Valor nominal no insert; no fim da campanha é sobrescrito pela média
        // dos sorteios que de fato aconteceram (ver `intervaloEfetivo` abaixo).
        intervalo_segundos: randomInterval
          ? Math.round((intervalRange[0] + intervalRange[1]) / 2)
          : interval,
        intervalo_min_segundos: randomInterval ? intervalRange[0] : null,
        intervalo_max_segundos: randomInterval ? intervalRange[1] : null,
        total_contatos: contacts.length,
        disparado_por: user?.id ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select()
      .single();

    if (campanhaError || !campanha) {
      toast.error("Não foi possível registrar a campanha de disparo.");
      setDispatchState("idle");
      return;
    }

    // IDs gerados no cliente: o update por item depois do envio precisa saber
    // qual linha é qual sem depender da ordem de retorno do insert em lote.
    const itemIds = contacts.map(() => crypto.randomUUID());
    const { error: itensError } = await supabase.from("disparos_itens").insert(
      contacts.map((contact, i) => ({
        id: itemIds[i],
        campanha_id: campanha.id,
        lead_id: contact.leadId ?? null,
        nome: contact.nome,
        telefone: contact.telefone,
      })),
    );
    if (itensError) {
      toast.error("Não foi possível registrar os contatos da campanha.");
    }
    queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });

    let totalEnviado = 0;
    let totalFalhou = 0;
    // Somatório dos intervalos realmente aplicados, para gravar a média no fim.
    // Com faixa, o valor nominal (o meio) não descreve a campanha: uma parada
    // no meio do caminho pode ter sorteado só valores baixos.
    let somaIntervalos = 0;
    let esperasAplicadas = 0;

    for (let i = 0; i < contacts.length; i++) {
      if (stopRef.current) break;

      while (pauseRef.current && !stopRef.current) {
        await sleep(300);
      }
      if (stopRef.current) break;

      const contact = contacts[i];
      const horario = new Date().toLocaleTimeString("pt-BR");
      const agora = new Date().toISOString();

      try {
        const { data, error } = await supabase.functions.invoke("mass-dispatcher", {
          body: {
            instance_name: selectedInstance.instance_name,
            phone: contact.telefone,
            nome: contact.nome,
            message,
          },
        });
        if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? "erro");
        setLog((l) => [...l, { telefone: contact.telefone, status: "Enviado", horario }]);
        totalEnviado++;
        await supabase
          .from("disparos_itens")
          .update({ status: "enviado", enviado_em: agora })
          .eq("id", itemIds[i]);
      } catch (err) {
        setLog((l) => [...l, { telefone: contact.telefone, status: "Erro", horario }]);
        totalFalhou++;
        await supabase
          .from("disparos_itens")
          .update({
            status: "falhou",
            erro: err instanceof Error ? err.message : String(err),
            enviado_em: agora,
          })
          .eq("id", itemIds[i]);
      }

      setSentCount(i + 1);

      if (i < contacts.length - 1) {
        // Sorteia por envio, não uma vez por campanha: um valor único sorteado
        // no início seria só outro intervalo fixo.
        const esperaSegundos = randomInterval
          ? sortearSegundos(intervalRange[0], intervalRange[1])
          : interval;
        somaIntervalos += esperaSegundos;
        esperasAplicadas++;

        for (let waited = 0; waited < esperaSegundos * 1000; waited += 250) {
          if (stopRef.current) break;
          await sleep(250);
        }
      }
    }

    const intervaloEfetivo =
      esperasAplicadas > 0
        ? Math.round(somaIntervalos / esperasAplicadas)
        : randomInterval
          ? Math.round((intervalRange[0] + intervalRange[1]) / 2)
          : interval;

    await supabase
      .from("disparos_campanha")
      .update({
        total_enviado: totalEnviado,
        total_falhou: totalFalhou,
        intervalo_segundos: intervaloEfetivo,
        status: stopRef.current ? "interrompido" : "concluido",
        finalizado_em: new Date().toISOString(),
      })
      .eq("id", campanha.id);
    queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });

    setDispatchState("done");
  }

  function handlePauseResume() {
    pauseRef.current = !pauseRef.current;
    setDispatchState(pauseRef.current ? "paused" : "running");
  }

  function handleStop() {
    stopRef.current = true;
    pauseRef.current = false;
    setDispatchState("done");
  }

  const isRunning = dispatchState === "running" || dispatchState === "paused";

  return (
    <ToolCard
      icon={Send}
      title="Disparador em massa"
      subtitle="Envie mensagens de WhatsApp para leads, um CSV ou uma lista manual"
    >
      {/* O histórico virou aba deste card em vez de card próprio mais abaixo na
          página: quem acaba de disparar quer conferir o resultado ali mesmo, e
          antes precisava rolar até outro bloco. O disparo em andamento não é
          afetado por trocar de aba — o laço roda num callback com refs, fora do
          JSX, então continua mesmo com o conteúdo desmontado. */}
      <Tabs defaultValue="disparar">
        <TabsList>
          <TabsTrigger value="disparar">Disparar</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="disparar" className="space-y-4 pt-2">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Instância</Label>
              <Select value={instanceId} onValueChange={setInstanceId} disabled={isRunning}>
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
            </div>

            <div className="space-y-2">
              <Label>Fonte dos contatos</Label>
              <Select
                value={source}
                onValueChange={(v: ContactSource) => setSource(v)}
                disabled={isRunning}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="crm">Leads do CRM (por status)</SelectItem>
                  <SelectItem value="selecao">Escolher leads</SelectItem>
                  <SelectItem value="csv">Upload CSV</SelectItem>
                  <SelectItem value="manual">Lista manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mass-message">Mensagem</Label>
            <Textarea
              id="mass-message"
              placeholder="Olá {{nome}}, temos novidades sobre o Moradas de Paraty..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isRunning}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Variáveis disponíveis: <code>{"{{nome}}"}</code> e <code>{"{{telefone}}"}</code>
            </p>
          </div>

          {source === "crm" ? (
            <div className="space-y-2 max-w-xs">
              <Label>Filtrar por status do lead</Label>
              <Select
                value={crmStatusFilter}
                onValueChange={(v: LeadStatus | "todos") => setCrmStatusFilter(v)}
                disabled={isRunning}
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
            </div>
          ) : source === "selecao" ? (
            <LeadSelectionList
              selectedIds={selectedLeadIds}
              onChange={setSelectedLeadIds}
              disabled={isRunning}
            />
          ) : source === "csv" ? (
            <div className="space-y-2">
              <Label htmlFor="csv-upload">Arquivo CSV (colunas: nome, telefone)</Label>
              <Input
                id="csv-upload"
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvUpload}
                disabled={isRunning}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="manual-contacts">Números (separados por vírgula ou linha)</Label>
              <Textarea
                id="manual-contacts"
                placeholder={"5511999999999\n5521988888888"}
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                disabled={isRunning}
                rows={4}
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm">
              <span className="font-medium">{contacts.length}</span> contatos serão impactados
            </p>
          </div>

          {/* max-w-xl, não max-w-sm: com o toggle na mesma linha do rótulo, os
              384px antigos não cabiam os dois e o switch quebrava para baixo. */}
          <div className="space-y-2 max-w-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label>
                {randomInterval
                  ? `Intervalo entre mensagens: ${intervalRange[0]}s a ${intervalRange[1]}s`
                  : `Intervalo entre mensagens: ${interval}s`}
              </Label>
              <div className="flex items-center gap-2">
                <Switch
                  id="intervalo-aleatorio"
                  checked={randomInterval}
                  onCheckedChange={setRandomInterval}
                  disabled={isRunning}
                />
                <Label htmlFor="intervalo-aleatorio" className="text-sm font-normal">
                  Intervalo aleatório
                </Label>
              </div>
            </div>

            {randomInterval ? (
              <Slider
                min={5}
                max={120}
                step={1}
                minStepsBetweenThumbs={1}
                value={intervalRange}
                onValueChange={([min, max]) => setIntervalRange([min, max])}
                disabled={isRunning}
              />
            ) : (
              <Slider
                min={5}
                max={60}
                step={1}
                value={[interval]}
                onValueChange={([v]) => setIntervalValue(v)}
                disabled={isRunning}
              />
            )}

            <p className="text-xs text-muted-foreground">
              {randomInterval
                ? "Cada envio sorteia um valor dentro da faixa — o ritmo deixa de ter padrão fixo, que é o que a detecção de automação procura."
                : "Todos os envios usam o mesmo intervalo. Em listas grandes, o padrão repetido é detectável."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isRunning ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={contacts.length === 0 || !message.trim() || !instanceId}
                  >
                    Iniciar Disparo
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar disparo em massa</AlertDialogTitle>
                    <AlertDialogDescription>
                      Você está prestes a enviar {contacts.length} mensagens. Confirmar?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => runDispatch()}>Confirmar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <>
                <Button variant="outline" onClick={handlePauseResume}>
                  {dispatchState === "paused" ? "Retomar" : "Pausar"}
                </Button>
                <Button variant="destructive" onClick={handleStop}>
                  Parar
                </Button>
              </>
            )}
          </div>

          {dispatchState !== "idle" ? (
            <div className="space-y-2">
              <Progress value={contacts.length ? (sentCount / contacts.length) * 100 : 0} />
              <p className="text-sm text-muted-foreground">
                {sentCount} de {contacts.length} enviadas
                {dispatchState === "paused" ? " — pausado" : ""}
              </p>
            </div>
          ) : null}

          {log.length > 0 ? (
            <div className="rounded-lg border overflow-x-auto max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Horário</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {log
                    .slice()
                    .reverse()
                    .map((entry, i) => (
                      <TableRow key={i}>
                        <TableCell>{entry.telefone}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              entry.status === "Enviado"
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-normal"
                                : "bg-red-100 text-red-800 hover:bg-red-100 font-normal"
                            }
                          >
                            {entry.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{entry.horario}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="historico" className="pt-2">
          <DispatchHistoryPanel />
        </TabsContent>
      </Tabs>
    </ToolCard>
  );
}
