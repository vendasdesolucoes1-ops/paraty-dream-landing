import { useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { DOCUMENTOS_BUCKET, extensionFromFile, resolveContentType } from "@/lib/documento-utils";
import { ProcessoField } from "@/components/documentos/processo-field";
import {
  EMPTY_PROCESSO_VALUE,
  resolveProcessoId,
  type ProcessoFieldValue,
} from "@/lib/processo-utils";
import { DOCUMENTO_CATEGORIA_OPTIONS, type DocumentoCategoria, type Lead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
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

function titleFromFileName(name: string) {
  const withoutExt = name.replace(/\.[^./]+$/, "");
  return withoutExt.replace(/[-_]+/g, " ").trim();
}

export function DocumentoUploadDialog({
  defaultLead,
  trigger,
}: {
  defaultLead?: Pick<Lead, "id" | "nome">;
  trigger?: React.ReactNode;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState<DocumentoCategoria>("outro");
  const [leadId, setLeadId] = useState<string>(defaultLead?.id ?? "");
  const [leadLabel, setLeadLabel] = useState<string>(defaultLead?.nome ?? "");
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");
  const [tags, setTags] = useState("");
  const [processo, setProcesso] = useState<ProcessoFieldValue>(EMPTY_PROCESSO_VALUE);

  function resetForm() {
    setFile(null);
    setTitulo("");
    setCategoria("outro");
    setLeadId(defaultLead?.id ?? "");
    setLeadLabel(defaultLead?.nome ?? "");
    setTags("");
    setLeadSearch("");
    setProcesso(EMPTY_PROCESSO_VALUE);
  }

  function handleFileChosen(chosen: File) {
    setFile(chosen);
    setTitulo((current) => current || titleFromFileName(chosen.name));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) handleFileChosen(dropped);
  }

  const { data: leadResults } = useQuery({
    queryKey: ["leads-search", leadSearch],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, telefone")
        .is("deletado_em", null)
        .or(`nome.ilike.%${leadSearch}%,telefone.ilike.%${leadSearch}%`)
        .limit(10);
      if (error) throw error;
      return data as Pick<Lead, "id" | "nome" | "telefone">[];
    },
    enabled: leadSearch.trim().length >= 2,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecione um arquivo.");
      if (!titulo.trim()) throw new Error("Informe um título.");

      const processoId = await resolveProcessoId(processo);

      const ext = extensionFromFile(file);
      const storagePath = `${categoria}/${crypto.randomUUID()}.${ext}`;
      const contentType = resolveContentType(file, ext);

      const { error: uploadError } = await supabase.storage
        .from(DOCUMENTOS_BUCKET)
        .upload(storagePath, file, { contentType });
      if (uploadError) throw uploadError;

      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const { error: insertError } = await supabase.from("documentos").insert({
        titulo: titulo.trim(),
        categoria,
        lead_id: leadId || null,
        processo_id: processoId,
        storage_path: storagePath,
        tipo_arquivo: ext,
        tamanho_bytes: file.size,
        uploaded_by: user?.id ?? null,
        tags: tagList.length > 0 ? tagList : null,
      });
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      toast.success("Documento enviado.");
      queryClient.invalidateQueries({ queryKey: ["documentos"] });
      queryClient.invalidateQueries({ queryKey: ["processos"] });
      resetForm();
      setOpen(false);
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao enviar o documento."),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar documento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
              dragActive ? "border-primary bg-secondary/50" : "border-input hover:bg-muted/40",
            )}
          >
            <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            {file ? (
              <p className="text-sm font-medium">{file.name}</p>
            ) : (
              <>
                <p className="text-sm">Arraste um arquivo aqui ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, JPG ou PNG</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const chosen = e.target.files?.[0];
                if (chosen) handleFileChosen(chosen);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-titulo">Título</Label>
            <Input
              id="doc-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Contrato assinado"
            />
          </div>

          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={categoria} onValueChange={(v: DocumentoCategoria) => setCategoria(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENTO_CATEGORIA_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ProcessoField value={processo} onChange={setProcesso} />

          <div className="space-y-2">
            <Label>Lead vinculado (opcional)</Label>
            <Popover open={leadPickerOpen} onOpenChange={setLeadPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  disabled={Boolean(defaultLead)}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {leadLabel || "Buscar lead por nome ou telefone..."}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Digite nome ou telefone..."
                    value={leadSearch}
                    onValueChange={setLeadSearch}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {leadSearch.trim().length < 2
                        ? "Digite ao menos 2 caracteres."
                        : "Nenhum lead encontrado."}
                    </CommandEmpty>
                    <CommandGroup>
                      {leadId ? (
                        <CommandItem
                          value="__clear__"
                          onSelect={() => {
                            setLeadId("");
                            setLeadLabel("");
                            setLeadPickerOpen(false);
                          }}
                        >
                          Remover vínculo
                        </CommandItem>
                      ) : null}
                      {(leadResults ?? []).map((lead) => (
                        <CommandItem
                          key={lead.id}
                          value={lead.id}
                          onSelect={() => {
                            setLeadId(lead.id);
                            setLeadLabel(
                              `${lead.nome}${lead.telefone ? ` — ${lead.telefone}` : ""}`,
                            );
                            setLeadPickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              leadId === lead.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                          {lead.nome}
                          {lead.telefone ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {lead.telefone}
                            </span>
                          ) : null}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-tags">Tags (separadas por vírgula)</Label>
            <Input
              id="doc-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="RG, CPF, contrato assinado"
            />
          </div>

          {mutation.isError ? (
            <p className="text-sm text-destructive">Erro ao enviar o documento. Tente novamente.</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!file || mutation.isPending}>
            {mutation.isPending ? "Enviando..." : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
