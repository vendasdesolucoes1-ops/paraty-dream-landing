// Seletor de compra para o documento: é o vínculo que leva um papel solto para
// a ficha do lote certo do cliente certo.
import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { compraLabel, type Cliente, type Lote } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/documentos/pecas";
import { Pill } from "@/components/ds/pill";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type CompraOption = {
  id: string;
  status: string;
  lote: Pick<Lote, "numero_lote" | "quadra"> | null;
  cliente: Pick<Cliente, "id" | "nome"> | null;
};

export function CompraField({
  value,
  label,
  onChange,
}: {
  /** null = nenhuma compra vinculada. */
  value: string | null;
  /** Rótulo já conhecido, para não piscar "Nenhuma" enquanto a lista carrega. */
  label: string | null;
  onChange: (compraId: string | null, label: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const id = useId();

  const { data: compras } = useQuery({
    queryKey: ["compras", "picker", search],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compras")
        .select("id, status, lote:lotes(numero_lote, quadra), cliente:clientes(id, nome)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as CompraOption[];
    },
    enabled: open,
  });

  // Filtro no cliente: o termo casa com nome do comprador OU número do lote, e
  // os dois moram em tabelas diferentes — no PostgREST isso viraria duas
  // queries. A lista é curta o bastante para filtrar aqui.
  const termo = search.trim().toLowerCase();
  const opcoes = (compras ?? []).filter((compra) =>
    termo ? compraLabel(compra).toLowerCase().includes(termo) : true,
  );

  return (
    <Campo
      id={id}
      label="Compra (lote do cliente)"
      dica="Leva o documento para a ficha do lote certo do cliente."
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-10 w-full justify-between gap-2 px-3 font-normal"
          >
            <span className="flex min-w-0 items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className={cn("truncate", !label && "text-muted-foreground")}>
                {label || "Nenhuma compra"}
              </span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] overflow-hidden p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar por cliente ou lote..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                Nenhuma compra encontrada. Converta o lead em cliente e registre a compra primeiro.
              </CommandEmpty>
              <CommandGroup>
                {value ? (
                  <CommandItem
                    value="__nenhuma__"
                    onSelect={() => {
                      onChange(null, null);
                      setOpen(false);
                    }}
                  >
                    Nenhuma compra
                  </CommandItem>
                ) : null}
                {opcoes.map((compra) => (
                  <CommandItem
                    key={compra.id}
                    value={compra.id}
                    onSelect={() => {
                      onChange(compra.id, compraLabel(compra));
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === compra.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{compraLabel(compra)}</span>
                    {compra.status !== "ativo" ? (
                      <Pill
                        tone={
                          compra.status === "quitado"
                            ? "success"
                            : compra.status === "inadimplente"
                              ? "danger"
                              : "neutral"
                        }
                        className="ml-auto"
                      >
                        {compra.status}
                      </Pill>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </Campo>
  );
}
