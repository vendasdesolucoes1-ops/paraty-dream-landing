import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Lead, Vendedor, VisitaWithRelations } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface VisitaFormDialogProps {
  visita?: VisitaWithRelations;
  defaultLead?: Pick<Lead, "id" | "nome" | "telefone">;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function VisitaFormDialog({
  visita,
  defaultLead,
  trigger,
  open,
  onOpenChange,
}: VisitaFormDialogProps) {
  const isEdit = Boolean(visita);
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const actualOpen = open ?? internalOpen;
  const setActualOpen = onOpenChange ?? setInternalOpen;

  const initialLead = visita?.lead ?? defaultLead ?? null;

  const [leadId, setLeadId] = useState<string>(visita?.lead_id ?? defaultLead?.id ?? "");
  const [leadLabel, setLeadLabel] = useState<string>(
    initialLead
      ? `${initialLead.nome}${initialLead.telefone ? ` — ${initialLead.telefone}` : ""}`
      : "",
  );
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");
  const [dataHora, setDataHora] = useState(toDatetimeLocalValue(visita?.data_hora ?? null));
  const [vendedorId, setVendedorId] = useState(visita?.vendedor_id ?? "");
  const [observacoes, setObservacoes] = useState(visita?.observacoes ?? "");

  useEffect(() => {
    if (!actualOpen) return;
    const lead = visita?.lead ?? defaultLead ?? null;
    setLeadId(visita?.lead_id ?? defaultLead?.id ?? "");
    setLeadLabel(lead ? `${lead.nome}${lead.telefone ? ` — ${lead.telefone}` : ""}` : "");
    setDataHora(toDatetimeLocalValue(visita?.data_hora ?? null));
    setVendedorId(visita?.vendedor_id ?? "");
    setObservacoes(visita?.observacoes ?? "");
    setLeadSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualOpen, visita?.id, defaultLead?.id]);

  const { data: leadResults } = useQuery({
    queryKey: ["leads-search", leadSearch],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, telefone")
        .or(`nome.ilike.%${leadSearch}%,telefone.ilike.%${leadSearch}%`)
        .limit(10);
      if (error) throw error;
      return data as Pick<Lead, "id" | "nome" | "telefone">[];
    },
    enabled: leadSearch.trim().length >= 2,
  });

  const { data: vendedores } = useQuery({
    queryKey: ["vendedores-ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendedores")
        .select("*")
        .eq("ativo", true)
        .order("nome", { ascending: true });
      if (error) throw error;
      return data as Vendedor[];
    },
    enabled: actualOpen,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!leadId) throw new Error("Selecione um lead.");
      if (!dataHora) throw new Error("Informe a data e o horário.");

      const isoDataHora = new Date(dataHora).toISOString();

      if (isEdit && visita) {
        const { error } = await supabase
          .from("visitas")
          .update({
            data_hora: isoDataHora,
            vendedor_id: vendedorId || null,
            observacoes: observacoes || null,
            status: "agendada",
          })
          .eq("id", visita.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("visitas").insert({
          lead_id: leadId,
          data_hora: isoDataHora,
          vendedor_id: vendedorId || null,
          observacoes: observacoes || null,
          status: "agendada",
        });
        if (error) throw error;
      }

      await supabase.from("leads").update({ status_crm: "agendado" }).eq("id", leadId);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Visita remarcada." : "Visita agendada.");
      queryClient.invalidateQueries({ queryKey: ["visitas"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setActualOpen(false);
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao salvar a visita."),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <Dialog open={actualOpen} onOpenChange={setActualOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Remarcar visita" : "Nova visita"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Lead</Label>
            <Popover open={leadPickerOpen} onOpenChange={setLeadPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  disabled={isEdit || Boolean(defaultLead)}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">{leadLabel || "Buscar por nome ou telefone..."}</span>
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
            <Label htmlFor="data_hora">Data e horário</Label>
            <Input
              id="data_hora"
              type="datetime-local"
              required
              value={dataHora}
              onChange={(e) => setDataHora(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Vendedor</Label>
            <Select value={vendedorId} onValueChange={setVendedorId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o vendedor" />
              </SelectTrigger>
              <SelectContent>
                {(vendedores ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>

          {mutation.isError ? (
            <p className="text-sm text-destructive">Erro ao salvar a visita. Tente novamente.</p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setActualOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando..." : isEdit ? "Remarcar" : "Agendar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
