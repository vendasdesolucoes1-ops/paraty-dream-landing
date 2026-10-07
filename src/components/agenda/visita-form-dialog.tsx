import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, CalendarPlus, Check, ChevronsUpDown, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Lead, Vendedor, VisitaWithRelations } from "@/lib/types";
import { Avatar } from "@/components/ds/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Campo, FormGaveta, Secao } from "@/components/visoes/form-gaveta";

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface VisitaFormDialogProps {
  visita?: VisitaWithRelations;
  defaultLead?: Pick<Lead, "id" | "nome" | "telefone">;
  defaultDate?: Date;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved?: () => void;
}

export function VisitaFormDialog({
  visita,
  defaultLead,
  defaultDate,
  trigger,
  open,
  onOpenChange,
  onSaved,
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
  const [dataHora, setDataHora] = useState(
    toDatetimeLocalValue(visita?.data_hora ?? defaultDate?.toISOString() ?? null),
  );
  const [vendedorId, setVendedorId] = useState(visita?.vendedor_id ?? "");
  const [observacoes, setObservacoes] = useState(visita?.observacoes ?? "");

  useEffect(() => {
    if (!actualOpen) return;
    const lead = visita?.lead ?? defaultLead ?? null;
    setLeadId(visita?.lead_id ?? defaultLead?.id ?? "");
    setLeadLabel(lead ? `${lead.nome}${lead.telefone ? ` — ${lead.telefone}` : ""}` : "");
    setDataHora(toDatetimeLocalValue(visita?.data_hora ?? defaultDate?.toISOString() ?? null));
    setVendedorId(visita?.vendedor_id ?? "");
    setObservacoes(visita?.observacoes ?? "");
    setLeadSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualOpen, visita?.id, defaultLead?.id, defaultDate?.getTime()]);

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
      onSaved?.();
      setActualOpen(false);
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao salvar a visita."),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  const leadBloqueado = isEdit || Boolean(defaultLead);

  return (
    <FormGaveta
      open={actualOpen}
      onOpenChange={setActualOpen}
      trigger={trigger}
      icone={isEdit ? CalendarClock : CalendarPlus}
      titulo={isEdit ? "Remarcar visita" : "Nova visita"}
      subtitulo={
        isEdit ? "Escolha o novo dia e horário." : "O lead passa para “Agendado” no Kanban."
      }
      descricao={
        isEdit
          ? "Altere a data, o horário ou o vendedor da visita."
          : "Escolha o lead, a data e o horário para agendar a visita."
      }
      formId="form-visita"
      onSubmit={handleSubmit}
      rotuloSalvar={isEdit ? "Remarcar" : "Agendar"}
      rotuloAtalho={isEdit ? "remarcar" : "agendar"}
      salvando={mutation.isPending}
      erro={mutation.isError ? "Erro ao salvar a visita. Tente novamente." : null}
    >
      <Secao titulo="Cliente">
        <Campo id="lead" label="Lead" obrigatorio>
          <Popover open={leadPickerOpen} onOpenChange={setLeadPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                id="lead"
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={leadPickerOpen}
                autoFocus={!leadBloqueado}
                disabled={leadBloqueado}
                className="h-10 w-full justify-between gap-2 px-3 font-normal"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {leadId ? (
                    <Avatar nome={leadLabel.split(" — ")[0]} size="sm" />
                  ) : (
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className={cn("truncate", !leadId && "text-muted-foreground/70")}>
                    {leadLabel || "Buscar por nome ou telefone..."}
                  </span>
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
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
                          setLeadLabel(`${lead.nome}${lead.telefone ? ` — ${lead.telefone}` : ""}`);
                          setLeadPickerOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            leadId === lead.id ? "opacity-100" : "opacity-0",
                          )}
                          aria-hidden
                        />
                        {lead.nome}
                        {lead.telefone ? (
                          <span className="ml-2 text-xs tabular-nums text-muted-foreground">
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
      </Secao>

      <Secao titulo="Quando">
        <Campo id="data_hora" label="Data e horário" obrigatorio>
          <Input
            id="data_hora"
            type="datetime-local"
            required
            autoFocus={leadBloqueado}
            value={dataHora}
            onChange={(e) => setDataHora(e.target.value)}
          />
        </Campo>
      </Secao>

      <Secao titulo="Atendimento">
        <Campo id="vendedor" label="Vendedor">
          <Select value={vendedorId} onValueChange={setVendedorId}>
            <SelectTrigger id="vendedor">
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
        </Campo>

        <Campo id="observacoes" label="Observações">
          <Textarea
            id="observacoes"
            rows={3}
            placeholder="Combinados, ponto de encontro, o que o cliente quer ver…"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
          />
        </Campo>
      </Secao>
    </FormGaveta>
  );
}
