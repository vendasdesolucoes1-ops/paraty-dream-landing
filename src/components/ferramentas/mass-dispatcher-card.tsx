import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { parseContactsCsv, parseManualContacts } from "@/lib/csv";
import type { Lead, LeadStatus, WhatsappInstance } from "@/lib/types";
import { LEAD_STATUS_COLUMNS } from "@/lib/types";
import { ToolCard } from "@/components/ferramentas/tool-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
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

type ContactSource = "crm" | "csv" | "manual";
type DispatchState = "idle" | "running" | "paused" | "done";

interface Contact {
  nome: string;
  telefone: string;
}

interface LogEntry {
  telefone: string;
  status: "Enviado" | "Erro";
  horario: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function MassDispatcherCard() {
  const [instanceId, setInstanceId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [source, setSource] = useState<ContactSource>("crm");
  const [crmStatusFilter, setCrmStatusFilter] = useState<LeadStatus | "todos">("todos");
  const [csvContacts, setCsvContacts] = useState<Contact[]>([]);
  const [manualText, setManualText] = useState("");
  const [interval, setIntervalValue] = useState(15);
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
      let query = supabase.from("leads").select("*").not("telefone", "is", null);
      if (crmStatusFilter !== "todos") query = query.eq("status_crm", crmStatusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data as Lead[];
    },
    enabled: source === "crm",
  });

  const manualContacts = useMemo(() => parseManualContacts(manualText), [manualText]);

  const contacts: Contact[] = useMemo(() => {
    if (source === "crm") {
      return (crmLeads ?? [])
        .filter((l) => l.telefone)
        .map((l) => ({ nome: l.nome, telefone: l.telefone as string }));
    }
    if (source === "csv") return csvContacts;
    return manualContacts;
  }, [source, crmLeads, csvContacts, manualContacts]);

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

    for (let i = 0; i < contacts.length; i++) {
      if (stopRef.current) break;

      while (pauseRef.current && !stopRef.current) {
        await sleep(300);
      }
      if (stopRef.current) break;

      const contact = contacts[i];
      const horario = new Date().toLocaleTimeString("pt-BR");

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
      } catch {
        setLog((l) => [...l, { telefone: contact.telefone, status: "Erro", horario }]);
      }

      setSentCount(i + 1);

      if (i < contacts.length - 1) {
        for (let waited = 0; waited < interval * 1000; waited += 250) {
          if (stopRef.current) break;
          await sleep(250);
        }
      }
    }

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
              <SelectItem value="crm">Leads do CRM</SelectItem>
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

      <div className="space-y-2 max-w-sm">
        <Label>Intervalo entre mensagens: {interval}s</Label>
        <Slider
          min={5}
          max={60}
          step={1}
          value={[interval]}
          onValueChange={([v]) => setIntervalValue(v)}
          disabled={isRunning}
        />
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
    </ToolCard>
  );
}
