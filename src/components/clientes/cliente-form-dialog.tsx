// Formulário de cliente comprador, usado nos dois caminhos: conversão de um
// lead ("Converter em Cliente") e edição da ficha já existente.
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { ESTADO_CIVIL_OPTIONS, type Cliente, type Lead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SEM_ESTADO_CIVIL = "nao_informado";

type FormState = {
  nome: string;
  cpf: string;
  rg: string;
  telefone: string;
  email: string;
  data_nascimento: string;
  estado_civil: string;
  profissao: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  observacoes: string;
};

const EMPTY: FormState = {
  nome: "",
  cpf: "",
  rg: "",
  telefone: "",
  email: "",
  data_nascimento: "",
  estado_civil: SEM_ESTADO_CIVIL,
  profissao: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  cep: "",
  observacoes: "",
};

function fromLead(lead: Pick<Lead, "nome" | "telefone" | "email" | "cidade">): FormState {
  return {
    ...EMPTY,
    nome: lead.nome ?? "",
    telefone: lead.telefone ?? "",
    email: lead.email ?? "",
    cidade: lead.cidade ?? "",
  };
}

function fromCliente(cliente: Cliente): FormState {
  return {
    nome: cliente.nome ?? "",
    cpf: cliente.cpf ?? "",
    rg: cliente.rg ?? "",
    telefone: cliente.telefone ?? "",
    email: cliente.email ?? "",
    data_nascimento: cliente.data_nascimento ?? "",
    estado_civil: cliente.estado_civil ?? SEM_ESTADO_CIVIL,
    profissao: cliente.profissao ?? "",
    endereco: cliente.endereco ?? "",
    numero: cliente.numero ?? "",
    complemento: cliente.complemento ?? "",
    bairro: cliente.bairro ?? "",
    cidade: cliente.cidade ?? "",
    uf: cliente.uf ?? "",
    cep: cliente.cep ?? "",
    observacoes: cliente.observacoes ?? "",
  };
}

/** Campo vazio vira NULL: string vazia furaria o índice único parcial de CPF. */
function nullify(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function ClienteFormDialog({
  open,
  onOpenChange,
  lead,
  cliente,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Conversão: os dados que já existem no lead vêm preenchidos. */
  lead?: Pick<Lead, "id" | "nome" | "telefone" | "email" | "cidade">;
  /** Edição: quando presente, atualiza em vez de criar. */
  cliente?: Cliente;
  onSaved?: (cliente: Cliente) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);

  // Reidrata ao abrir: o mesmo dialog serve leads diferentes ao longo da sessão.
  useEffect(() => {
    if (!open) return;
    if (cliente) setForm(fromCliente(cliente));
    else if (lead) setForm(fromLead(lead));
    else setForm(EMPTY);
  }, [open, cliente, lead]);

  const set = (key: keyof FormState) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim()) throw new Error("Informe o nome do cliente.");

      const payload = {
        nome: form.nome.trim(),
        cpf: nullify(form.cpf),
        rg: nullify(form.rg),
        telefone: nullify(form.telefone),
        email: nullify(form.email),
        data_nascimento: nullify(form.data_nascimento),
        estado_civil: form.estado_civil === SEM_ESTADO_CIVIL ? null : form.estado_civil,
        profissao: nullify(form.profissao),
        endereco: nullify(form.endereco),
        numero: nullify(form.numero),
        complemento: nullify(form.complemento),
        bairro: nullify(form.bairro),
        cidade: nullify(form.cidade),
        uf: nullify(form.uf),
        cep: nullify(form.cep),
        observacoes: nullify(form.observacoes),
      };

      if (cliente) {
        const { data, error } = await supabase
          .from("clientes")
          .update(payload)
          .eq("id", cliente.id)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as Cliente;
      }

      const { data, error } = await supabase
        .from("clientes")
        .insert({ ...payload, lead_id: lead?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Cliente;
    },
    onSuccess: (saved) => {
      toast.success(cliente ? "Cliente atualizado." : "Cliente criado.");
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      queryClient.invalidateQueries({ queryKey: ["cliente-do-lead"] });
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (error: { code?: string; message?: string }) => {
      // 23505 aqui só pode vir dos dois índices únicos parciais da tabela.
      if (error?.code === "23505") {
        toast.error(
          error.message?.includes("lead")
            ? "Este lead já foi convertido em cliente."
            : "Já existe um cliente com este CPF.",
        );
        return;
      }
      toast.error(error?.message || "Não foi possível salvar o cliente.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-primary">
            {cliente ? "Editar cliente" : "Converter em cliente"}
          </DialogTitle>
          {cliente ? null : (
            <DialogDescription>
              O lead continua no funil. O cliente passa a existir como comprador, com suas compras e
              documentos próprios.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cliente-nome">Nome completo *</Label>
              <Input
                id="cliente-nome"
                value={form.nome}
                onChange={(e) => set("nome")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cliente-cpf">CPF</Label>
              <Input
                id="cliente-cpf"
                value={form.cpf}
                onChange={(e) => set("cpf")(e.target.value)}
                placeholder="000.000.000-00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cliente-rg">RG</Label>
              <Input id="cliente-rg" value={form.rg} onChange={(e) => set("rg")(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cliente-telefone">Telefone</Label>
              <Input
                id="cliente-telefone"
                value={form.telefone}
                onChange={(e) => set("telefone")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cliente-email">E-mail</Label>
              <Input
                id="cliente-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cliente-nascimento">Data de nascimento</Label>
              <Input
                id="cliente-nascimento"
                type="date"
                value={form.data_nascimento}
                onChange={(e) => set("data_nascimento")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Estado civil</Label>
              <Select value={form.estado_civil} onValueChange={set("estado_civil")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_ESTADO_CIVIL}>Não informado</SelectItem>
                  {ESTADO_CIVIL_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cliente-profissao">Profissão</Label>
              <Input
                id="cliente-profissao"
                value={form.profissao}
                onChange={(e) => set("profissao")(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-4 border-t pt-4">
            <p className="text-sm font-medium text-primary">
              Endereço de correspondência
              <span className="block text-xs font-normal text-muted-foreground">
                Para onde vão boleto e escritura.
              </span>
            </p>
            <div className="grid gap-4 sm:grid-cols-6">
              <div className="space-y-2 sm:col-span-4">
                <Label htmlFor="cliente-endereco">Logradouro</Label>
                <Input
                  id="cliente-endereco"
                  value={form.endereco}
                  onChange={(e) => set("endereco")(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="cliente-numero">Número</Label>
                <Input
                  id="cliente-numero"
                  value={form.numero}
                  onChange={(e) => set("numero")(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-3">
                <Label htmlFor="cliente-complemento">Complemento</Label>
                <Input
                  id="cliente-complemento"
                  value={form.complemento}
                  onChange={(e) => set("complemento")(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-3">
                <Label htmlFor="cliente-bairro">Bairro</Label>
                <Input
                  id="cliente-bairro"
                  value={form.bairro}
                  onChange={(e) => set("bairro")(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-3">
                <Label htmlFor="cliente-cidade">Cidade</Label>
                <Input
                  id="cliente-cidade"
                  value={form.cidade}
                  onChange={(e) => set("cidade")(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-1">
                <Label htmlFor="cliente-uf">UF</Label>
                <Input
                  id="cliente-uf"
                  maxLength={2}
                  value={form.uf}
                  onChange={(e) => set("uf")(e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="cliente-cep">CEP</Label>
                <Input
                  id="cliente-cep"
                  value={form.cep}
                  onChange={(e) => set("cep")(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="cliente-obs">Observações</Label>
            <Textarea
              id="cliente-obs"
              rows={3}
              value={form.observacoes}
              onChange={(e) => set("observacoes")(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : cliente ? "Salvar alterações" : "Criar cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
