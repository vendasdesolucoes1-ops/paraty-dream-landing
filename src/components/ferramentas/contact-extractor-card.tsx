// Extrator de contatos do WhatsApp: puxa a AGENDA da instância (todo mundo
// salvo/conversado), não membros de um grupo (isso é o card ao lado).
//
// Lição do incidente do import de 1346 contatos de grupo: nada vai pro banco
// sem passar por uma prévia com seleção explícita — ver Fase 1 do diagnóstico.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Contact as ContactIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { downloadCsv } from "@/lib/csv";
import type { WhatsappInstance } from "@/lib/types";
import { ToolCard } from "@/components/ferramentas/tool-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";

interface WhatsappContact {
  // Identidade estável para seleção/paginação: number pode ser null (LID sem
  // telefone resolvido) e não é garantidamente único nesse caso.
  id: string;
  number: string | null;
  name: string;
  numeroIndisponivel: boolean;
}

const PAGE_SIZE = 50;
// Telefone BR com DDI ocupa ~14 chars; um .in() com centenas de valores
// estoura o limite de tamanho de URL do GET e o PostgREST devolve 400. 150
// por lote mantém a query bem abaixo do limite mesmo em agendas grandes.
const DUPLICATE_CHECK_CHUNK_SIZE = 150;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export function ContactExtractorCard() {
  const queryClient = useQueryClient();
  const [instanceId, setInstanceId] = useState<string>("");
  const [contacts, setContacts] = useState<WhatsappContact[] | null>(null);
  const [existingPhones, setExistingPhones] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  // Qual aparelho de fato respondeu — deixa explícito que a agenda é do celular
  // que está com o QR ativo, não de uma conexão anterior da mesma instância.
  const [owner, setOwner] = useState<{ number: string | null; name: string | null } | null>(null);


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

  const selectedInstance = instances?.find((i) => i.id === instanceId);

  const contactsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInstance) throw new Error("Selecione uma instância.");
      const { data, error } = await supabase.functions.invoke("whatsapp-contacts", {
        body: { instance_name: selectedInstance.instance_name },
      });
      if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? "erro");
      const raw = data.data as Omit<WhatsappContact, "id">[];
      const fetched: WhatsappContact[] = raw.map((c, i) => ({ ...c, id: `${i}` }));

      // Checagem prévia de duplicata: só informativa aqui (mostra badge na
      // prévia); quem de fato impede duplicar no banco é o índice único de
      // leads.telefone, checado de novo no momento da importação. Por isso
      // uma falha aqui não pode travar a busca — na pior hipótese a prévia
      // aparece sem o badge, e o índice único ainda protege na importação.
      const existing = new Set<string>();
      let duplicateCheckFailed = false;
      const numbers = fetched.map((c) => c.number).filter((n): n is string => Boolean(n));

      for (const batch of chunk(numbers, DUPLICATE_CHECK_CHUNK_SIZE)) {
        const { data: existentes, error: leadsError } = await supabase
          .from("leads")
          .select("telefone")
          .in("telefone", batch);
        if (leadsError) {
          console.error("[whatsapp-contacts] checagem de duplicatas falhou:", {
            code: leadsError.code,
            message: leadsError.message,
          });
          duplicateCheckFailed = true;
          break;
        }
        for (const l of existentes ?? []) existing.add(l.telefone as string);
      }

      return {
        fetched,
        existing,
        duplicateCheckFailed,
        owner: (data.owner ?? null) as { number: string | null; name: string | null } | null,
      };
    },
    onSuccess: ({ fetched, existing, duplicateCheckFailed, owner: donoDaSessao }) => {
      setContacts(fetched);
      setExistingPhones(existing);
      setOwner(donoDaSessao);

      // Pré-seleciona só quem ainda não existe no CRM e tem telefone
      // utilizável — contato @lid sem número resolvido nasce desmarcado.
      setSelected(
        new Set(
          fetched
            .filter((c) => !c.numeroIndisponivel && c.number && !existing.has(c.number))
            .map((c) => c.id),
        ),
      );
      setPage(1);
      if (duplicateCheckFailed) {
        toast.warning(
          "Não foi possível verificar quais contatos já existem no CRM. A prévia aparece sem essa indicação, mas duplicados continuam bloqueados na importação.",
        );
      }
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao buscar contatos."),
  });

  const totalPages = contacts ? Math.max(1, Math.ceil(contacts.length / PAGE_SIZE)) : 1;
  const pageContacts = useMemo(() => {
    if (!contacts) return [];
    const start = (page - 1) * PAGE_SIZE;
    return contacts.slice(start, start + PAGE_SIZE);
  }, [contacts, page]);

  // "Selecionável" exclui os @lid sem telefone resolvido: não faz sentido
  // contar nem oferecer marcar o que não pode ser importado de jeito nenhum.
  const selectableContacts = useMemo(
    () => (contacts ?? []).filter((c) => !c.numeroIndisponivel),
    [contacts],
  );
  const allSelected = selectableContacts.length > 0 && selected.size === selectableContacts.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectableContacts.length === 0) return;
    // Aplica ao conjunto inteiro retornado, não só à página visível — senão o
    // "selecionar todos" de uma agenda grande exigiria passar por cada página.
    setSelected(allSelected ? new Set() : new Set(selectableContacts.map((c) => c.id)));
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!contacts) return { importados: 0, jaExistiam: 0, ignorados: 0 };
      const escolhidos = contacts.filter((c) => selected.has(c.id));

      let jaExistiam = 0;
      let ignorados = 0;
      const rows: {
        nome: string;
        telefone: string;
        origem: "whatsapp_contato";
        status_crm: "novo";
      }[] = [];

      for (const contact of escolhidos) {
        // Segunda barreira, além do checkbox desabilitado na UI: mesmo que
        // algo force a seleção (ex: id reaproveitado), um LID sem telefone
        // resolvido nunca vira linha em leads.
        if (contact.numeroIndisponivel || !contact.number || contact.number.length < 8) {
          ignorados++;
          continue;
        }
        if (existingPhones.has(contact.number)) {
          jaExistiam++;
          continue;
        }
        rows.push({
          nome: contact.name || contact.number,
          telefone: contact.number,
          origem: "whatsapp_contato",
          status_crm: "novo",
        });
      }

      if (rows.length === 0) return { importados: 0, jaExistiam, ignorados };

      // ignoreDuplicates como defesa em profundidade: a checagem acima já
      // deveria ter filtrado os duplicados, mas o índice único de
      // leads.telefone é a garantia final se algo mudou entre a prévia e o clique.
      const { error, count } = await supabase
        .from("leads")
        .upsert(rows, { onConflict: "telefone", ignoreDuplicates: true, count: "exact" });
      if (error) throw error;

      const importados = count ?? 0;
      // upsert com ignoreDuplicates não avisa quais das rows enviadas foram
      // ignoradas por conflito — a diferença entre o que foi tentado e o que
      // foi de fato inserido cai como "já existia" também.
      jaExistiam += rows.length - importados;

      return { importados, jaExistiam, ignorados };
    },
    onSuccess: ({ importados, jaExistiam, ignorados }) => {
      const partes = [`${importados} importado${importados === 1 ? "" : "s"}`];
      if (jaExistiam > 0) partes.push(`${jaExistiam} já existia${jaExistiam === 1 ? "" : "m"}`);
      if (ignorados > 0)
        partes.push(`${ignorados} ignorado${ignorados === 1 ? "" : "s"} por telefone inválido`);
      toast.success(partes.join(", ") + ".");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setContacts(null);
      setSelected(new Set());
    },
    onError: (error: unknown) => {
      // Mostra a mensagem real do banco (ex.: violação de constraint) em vez de
      // um texto genérico — sem isso o erro fica invisível para diagnóstico.
      const message =
        (error as { message?: string })?.message ?? "Erro ao importar contatos para o CRM.";
      console.error("[contact-extractor] falha ao importar:", error);
      toast.error(`Erro ao importar contatos para o CRM: ${message}`);
    },
  });

  function exportCsv() {
    if (!contacts) return;
    downloadCsv(
      `${selectedInstance?.instance_name ?? "whatsapp"}-contatos.csv`,
      ["Nome", "Número"],
      contacts.map((c) => [c.name, c.number ?? "(indisponível — WhatsApp LID)"]),
    );
  }

  return (
    <ToolCard
      icon={ContactIcon}
      title="Extrator de contatos do WhatsApp"
      subtitle="Puxe a agenda completa da instância conectada e importe pro CRM com revisão"
    >
      <div className="space-y-2 max-w-xs">
        <label className="text-sm font-medium">Instância</label>
        <Select value={instanceId} onValueChange={setInstanceId}>
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

      <Button
        onClick={() => contactsMutation.mutate()}
        disabled={!instanceId || contactsMutation.isPending}
      >
        {contactsMutation.isPending ? "Buscando..." : "Buscar contatos da instância"}
      </Button>

      {contactsMutation.isPending ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : contacts && contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum contato encontrado na instância.</p>
      ) : contacts ? (
        <div className="space-y-3">
          {owner?.number ? (
            <p className="text-xs text-muted-foreground">
              Agenda do aparelho conectado: {owner.name ? `${owner.name} · ` : ""}
              {owner.number}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">

            <p className="text-sm">
              <span className="font-medium">{contacts.length}</span> contatos encontrados ·{" "}
              <span className="font-medium">{selected.size}</span> selecionados
              {contacts.length - selectableContacts.length > 0 ? (
                <>
                  {" "}
                  ·{" "}
                  <span className="text-muted-foreground">
                    {contacts.length - selectableContacts.length} sem telefone utilizável (WhatsApp
                    LID)
                  </span>
                </>
              ) : null}
            </p>
          </div>

          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                      aria-label="Selecionar todos os contatos"
                    />
                  </TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>CRM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageContacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(contact.id)}
                        onCheckedChange={() => toggleOne(contact.id)}
                        disabled={contact.numeroIndisponivel}
                        aria-label={`Selecionar ${contact.name}`}
                      />
                    </TableCell>
                    <TableCell>{contact.name}</TableCell>
                    <TableCell
                      className={contact.numeroIndisponivel ? "text-muted-foreground italic" : ""}
                    >
                      {contact.number ?? "Número indisponível (WhatsApp LID)"}
                    </TableCell>
                    <TableCell>
                      {contact.numeroIndisponivel ? (
                        <Badge
                          className="bg-muted text-muted-foreground hover:bg-muted font-normal"
                          title="Este contato usa o identificador interno @lid do WhatsApp e não expôs o telefone real — não pode ser importado."
                        >
                          Não importável
                        </Badge>
                      ) : contact.number && existingPhones.has(contact.number) ? (
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 font-normal">
                          Já existe
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-normal">
                          Novo
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 ? (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationLink
                    size="default"
                    aria-disabled={page === 1}
                    className={page === 1 ? "pointer-events-none opacity-40" : "cursor-pointer"}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <span className="px-3 text-sm text-muted-foreground">
                    Página {page} de {totalPages}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink
                    size="default"
                    aria-disabled={page === totalPages}
                    className={
                      page === totalPages ? "pointer-events-none opacity-40" : "cursor-pointer"
                    }
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Próxima
                  </PaginationLink>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}>
              Exportar CSV
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={selected.size === 0 || importMutation.isPending}>
                  {importMutation.isPending
                    ? "Importando..."
                    : `Importar selecionados (${selected.size})`}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmar importação para o CRM</AlertDialogTitle>
                  <AlertDialogDescription>
                    {selected.size} contato{selected.size === 1 ? "" : "s"} selecionado
                    {selected.size === 1 ? "" : "s"} vão virar leads novos com origem "Contato
                    WhatsApp". Contatos com telefone já cadastrado são pulados automaticamente.
                    Confirmar?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => importMutation.mutate()}>
                    Confirmar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ) : null}
    </ToolCard>
  );
}
