import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Upload, User, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  DOCUMENTOS_BUCKET,
  extensionFromFile,
  formatBytes,
  resolveContentType,
} from "@/lib/documento-utils";
import { ProcessoField } from "@/components/documentos/processo-field";
import {
  Campo,
  GavetaCabecalho,
  GavetaRodape,
  IconeArquivo,
  Secao,
} from "@/components/documentos/pecas";
import { Kbd } from "@/components/ds/kbd";
import { atraso } from "@/components/ds/reveal";
import {
  EMPTY_PROCESSO_VALUE,
  resolveProcessoId,
  type ProcessoFieldValue,
} from "@/lib/processo-utils";
import { DOCUMENTO_CATEGORIA_OPTIONS, type DocumentoCategoria, type Lead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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
  defaultProcesso,
  defaultCompraId,
  trigger,
  open: openProp,
  onOpenChange,
}: {
  defaultLead?: Pick<Lead, "id" | "nome">;
  defaultProcesso?: { id: string; titulo: string };
  /** Amarra o documento a uma compra (lote), para a ficha do cliente. */
  defaultCompraId?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialProcesso: ProcessoFieldValue = defaultProcesso
    ? {
        ...EMPTY_PROCESSO_VALUE,
        processoId: defaultProcesso.id,
        processoLabel: defaultProcesso.titulo,
      }
    : EMPTY_PROCESSO_VALUE;

  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState<DocumentoCategoria>("outro");
  const [leadId, setLeadId] = useState<string>(defaultLead?.id ?? "");
  const [leadLabel, setLeadLabel] = useState<string>(defaultLead?.nome ?? "");
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");
  const [tags, setTags] = useState("");
  const [processo, setProcesso] = useState<ProcessoFieldValue>(initialProcesso);

  function resetForm() {
    setFiles([]);
    setTitulo("");
    setCategoria("outro");
    setLeadId(defaultLead?.id ?? "");
    setLeadLabel(defaultLead?.nome ?? "");
    setTags("");
    setLeadSearch("");
    setProcesso(initialProcesso);
  }

  function handleFilesChosen(chosen: File[]) {
    if (chosen.length === 0) return;
    setFiles((current) => {
      const merged = [...current];
      for (const f of chosen) {
        if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f);
      }
      return merged;
    });
    setTitulo((current) => current || titleFromFileName(chosen[0].name));
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragActive(false);
    handleFilesChosen(Array.from(event.dataTransfer.files ?? []));
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
      if (files.length === 0) throw new Error("Selecione ao menos um arquivo.");
      if (files.length === 1 && !titulo.trim()) throw new Error("Informe um título.");

      const processoId = await resolveProcessoId(processo);

      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      for (const [index, file] of files.entries()) {
        const ext = extensionFromFile(file);
        const storagePath = `${categoria}/${crypto.randomUUID()}.${ext}`;
        const contentType = resolveContentType(file, ext);

        const { error: uploadError } = await supabase.storage
          .from(DOCUMENTOS_BUCKET)
          .upload(storagePath, file, { contentType });
        if (uploadError) throw uploadError;

        const docTitulo =
          files.length === 1
            ? titulo.trim()
            : index === 0 && titulo.trim()
              ? titulo.trim()
              : titleFromFileName(file.name) || file.name;

        const { error: insertError } = await supabase.from("documentos").insert({
          titulo: docTitulo,
          categoria,
          lead_id: leadId || null,
          processo_id: processoId,
          compra_id: defaultCompraId ?? null,
          storage_path: storagePath,
          tipo_arquivo: ext,
          tamanho_bytes: file.size,
          uploaded_by: user?.id ?? null,
          tags: tagList.length > 0 ? tagList : null,
        });
        if (insertError) throw insertError;
      }

      return files.length;
    },
    onSuccess: (count) => {
      toast.success(count === 1 ? "Documento enviado." : `${count} documentos enviados.`);
      queryClient.invalidateQueries({ queryKey: ["documentos"] });
      queryClient.invalidateQueries({ queryKey: ["processos"] });
      resetForm();
      setOpen(false);
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao enviar o documento."),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (files.length === 0 || mutation.isPending) return;
    mutation.mutate();
  }

  const compacto = files.length > 0;

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-[31rem]">
        <GavetaCabecalho
          icon={Upload}
          titulo="Enviar documentos"
          descricao="Anexe um ou vários arquivos e vincule a um processo."
        />

        <form
          id="form-documento-upload"
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.requestSubmit();
            }
          }}
          className="flex-1 space-y-8 overflow-y-auto px-7 py-6"
        >
          <Secao titulo="Arquivos">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragActive(false);
              }}
              onDrop={handleDrop}
              className={cn(
                "group/area flex w-full flex-col items-center rounded-2xl border-2 border-dashed px-6 text-center transition-[background-color,border-color,transform,padding] duration-200 ease-[var(--ease-out)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15",
                compacto ? "gap-2 py-5" : "gap-3 py-9",
                dragActive
                  ? "scale-[1.01] border-accent bg-accent/10"
                  : "border-border bg-muted/30 hover:border-foreground/30 hover:bg-muted/60",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex items-center justify-center rounded-xl bg-card text-muted-foreground shadow-[var(--shadow-card)] ring-1 ring-border transition-[transform,color,width,height] duration-200 ease-[var(--ease-out)] group-hover/area:text-foreground",
                  compacto ? "h-9 w-9" : "h-12 w-12",
                  dragActive && "-translate-y-1 text-foreground",
                )}
              >
                <Upload className={compacto ? "h-4 w-4" : "h-5 w-5"} />
              </span>
              {compacto ? (
                <span className="text-[0.8125rem] font-medium text-foreground">
                  {files.length} arquivo{files.length === 1 ? "" : "s"} selecionado
                  {files.length === 1 ? "" : "s"} — clique para adicionar mais
                </span>
              ) : (
                <>
                  <span className="text-[0.9375rem] font-medium text-foreground">
                    {dragActive
                      ? "Solte para adicionar"
                      : "Arraste arquivos aqui ou clique para selecionar"}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="rounded bg-card px-1.5 py-0.5 font-medium ring-1 ring-border">
                      PDF
                    </span>
                    <span className="rounded bg-card px-1.5 py-0.5 font-medium ring-1 ring-border">
                      JPG
                    </span>
                    <span className="rounded bg-card px-1.5 py-0.5 font-medium ring-1 ring-border">
                      PNG
                    </span>
                    <span>— pode escolher vários</span>
                  </span>
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                handleFilesChosen(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />

            {files.length > 0 ? (
              <ul className="space-y-2" aria-label="Arquivos selecionados">
                {files.map((f, index) => (
                  <li
                    key={`${f.name}-${f.size}-${index}`}
                    style={atraso(index, 40, 240)}
                    className="animate-swap flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 pr-2 shadow-[var(--shadow-card)]"
                  >
                    <IconeArquivo tipo={extensionFromFile(f)} className="h-9 w-9 rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.8125rem] font-medium text-foreground">
                        {f.name}
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatBytes(f.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-danger-soft hover:text-danger active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => removeFile(index)}
                      aria-label={`Remover ${f.name}`}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </Secao>

          <Secao titulo="Detalhes">
            <Campo id="doc-titulo" label="Título">
              <Input
                id="doc-titulo"
                autoComplete="off"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Contrato assinado"
              />
            </Campo>

            <Campo id="doc-categoria" label="Categoria">
              <Select value={categoria} onValueChange={(v: DocumentoCategoria) => setCategoria(v)}>
                <SelectTrigger id="doc-categoria">
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
            </Campo>
          </Secao>

          <Secao titulo="Vínculos">
            <ProcessoField value={processo} onChange={setProcesso} />

            <Campo id="doc-lead" label="Lead vinculado (opcional)">
              <Popover open={leadPickerOpen} onOpenChange={setLeadPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="doc-lead"
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={leadPickerOpen}
                    disabled={Boolean(defaultLead)}
                    className="h-10 w-full justify-between gap-2 px-3 font-normal"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <User className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className={cn("truncate", !leadLabel && "text-muted-foreground")}>
                        {leadLabel || "Buscar lead por nome ou telefone..."}
                      </span>
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] overflow-hidden p-0">
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
            </Campo>

            <Campo id="doc-tags" label="Tags (separadas por vírgula)">
              <Input
                id="doc-tags"
                autoComplete="off"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="RG, CPF, contrato assinado"
              />
            </Campo>
          </Secao>

          {mutation.isError ? (
            <p role="alert" className="animate-swap text-sm text-danger">
              Erro ao enviar o documento. Tente novamente.
            </p>
          ) : null}
        </form>

        <GavetaRodape
          ocupado={mutation.isPending}
          dica={
            <>
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd> enviar
            </>
          }
        >
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="form-documento-upload"
            disabled={files.length === 0 || mutation.isPending}
          >
            {mutation.isPending ? "Enviando..." : "Enviar"}
          </Button>
        </GavetaRodape>
      </SheetContent>
    </Sheet>
  );
}
