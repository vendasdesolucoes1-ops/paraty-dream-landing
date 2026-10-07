import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Folder, FolderPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Processo } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Campo } from "@/components/documentos/pecas";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { EMPTY_PROCESSO_VALUE, type ProcessoFieldValue } from "@/lib/processo-utils";

export function ProcessoField({
  value,
  onChange,
}: {
  value: ProcessoFieldValue;
  onChange: (value: ProcessoFieldValue) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const id = useId();

  const { data: processos } = useQuery({
    queryKey: ["processos", search],
    queryFn: async () => {
      let query = supabase.from("processos").select("*").order("titulo", { ascending: true });
      if (search.trim()) query = query.ilike("titulo", `%${search.trim()}%`);
      const { data, error } = await query.limit(20);
      if (error) throw error;
      return data as Processo[];
    },
    enabled: pickerOpen,
  });

  const triggerLabel = value.createNew
    ? `Novo: ${value.novoTitulo || "(sem título)"}`
    : value.processoLabel || "Nenhum processo";

  return (
    <Campo id={id} label="Processo" dica="Agrupa os documentos de um mesmo contrato ou negócio.">
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={pickerOpen}
            className="h-10 w-full justify-between gap-2 px-3 font-normal"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span
                className={cn(
                  "truncate",
                  !value.processoId && !value.createNew && "text-muted-foreground",
                )}
              >
                {triggerLabel}
              </span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] overflow-hidden p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar processo..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>Nenhum processo encontrado.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__novo__"
                  onSelect={() => {
                    onChange({ ...EMPTY_PROCESSO_VALUE, createNew: true });
                    setPickerOpen(false);
                  }}
                >
                  <FolderPlus className="mr-2 h-4 w-4" />
                  Criar novo processo
                </CommandItem>
                {value.processoId || value.createNew ? (
                  <CommandItem
                    value="__nenhum__"
                    onSelect={() => {
                      onChange(EMPTY_PROCESSO_VALUE);
                      setPickerOpen(false);
                    }}
                  >
                    Nenhum processo
                  </CommandItem>
                ) : null}
                {(processos ?? []).map((processo) => (
                  <CommandItem
                    key={processo.id}
                    value={processo.id}
                    onSelect={() => {
                      onChange({
                        ...EMPTY_PROCESSO_VALUE,
                        processoId: processo.id,
                        processoLabel: processo.titulo,
                      });
                      setPickerOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value.processoId === processo.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{processo.titulo}</span>
                    <span className="ml-auto pl-3 text-xs text-muted-foreground">
                      {processo.categoria}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.createNew ? (
        <div className="animate-swap space-y-3.5 rounded-xl border border-border bg-muted/40 p-4">
          <p className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <FolderPlus className="h-3.5 w-3.5" aria-hidden />
            Novo processo
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="novo-processo-titulo">Título do processo</Label>
            <Input
              id="novo-processo-titulo"
              placeholder="Ex: Fabiana Aparecida Cordeiro - Locação"
              value={value.novoTitulo}
              onChange={(e) => onChange({ ...value, novoTitulo: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="novo-processo-categoria">Categoria do processo</Label>
            <Input
              id="novo-processo-categoria"
              placeholder="Ex: locação, venda, institucional"
              value={value.novoCategoria}
              onChange={(e) => onChange({ ...value, novoCategoria: e.target.value })}
            />
          </div>
        </div>
      ) : null}
    </Campo>
  );
}
