import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, FolderPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Processo } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <div className="space-y-2">
      <Label>Processo</Label>
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className="w-full justify-between font-normal"
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]">
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
                    <span className="ml-2 text-xs text-muted-foreground">{processo.categoria}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.createNew ? (
        <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
          <div className="space-y-2">
            <Label htmlFor="novo-processo-titulo">Título do processo</Label>
            <Input
              id="novo-processo-titulo"
              placeholder="Ex: Fabiana Aparecida Cordeiro - Locação"
              value={value.novoTitulo}
              onChange={(e) => onChange({ ...value, novoTitulo: e.target.value })}
            />
          </div>
          <div className="space-y-2">
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
    </div>
  );
}
