import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/hooks/use-profile";
import { DocumentoUploadDialog } from "@/components/documentos/documento-upload-dialog";
import { LEAD_ORIGEM_OPTIONS, type Lead, type LeadOrigem, type Vendedor } from "@/lib/types";

const NENHUM_VENDEDOR = "nenhum";

const emptyForm = {
  nome: "",
  email: "",
  telefone: "",
  cidade: "",
  metragem_interesse: "",
  tipo_lote_interesse: "",
  observacoes: "",
  // Cadastro manual não vem da landing page: marcar "lp" corromperia a
  // métrica de origem dos leads.
  origem: "indicacao" as LeadOrigem,
  vendedor_id: NENHUM_VENDEDOR,
};

export function LeadFormDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  // Cliente recém-criado: mantém o dialogo aberto num segundo passo para
  // anexar documentos sem precisar procurar o lead no Kanban depois.
  const [criado, setCriado] = useState<Pick<Lead, "id" | "nome"> | null>(null);
  const queryClient = useQueryClient();
  const { profile } = useProfile();

  const isVendedor = profile?.role === "vendedor";
  const podeVerDocumentos = profile?.role === "admin" || profile?.role === "gestor";

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
    enabled: open && !isVendedor,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      // Um vendedor só enxerga os próprios leads no Kanban: sem dono, o lead
      // que ele acabou de cadastrar sumiria da tela dele.
      const vendedorId = isVendedor
        ? (profile?.vendedor_id ?? null)
        : form.vendedor_id !== NENHUM_VENDEDOR
          ? form.vendedor_id
          : null;

      const { data, error } = await supabase
        .from("leads")
        .insert({
          nome: form.nome,
          email: form.email || null,
          telefone: form.telefone || null,
          cidade: form.cidade || null,
          metragem_interesse: form.metragem_interesse ? Number(form.metragem_interesse) : null,
          tipo_lote_interesse: form.tipo_lote_interesse || null,
          origem: form.origem,
          vendedor_id: vendedorId,
          status_crm: "novo",
        })
        .select("id, nome")
        .single();
      if (error) throw error;
      const lead = data as Pick<Lead, "id" | "nome">;

      // leads não tem coluna de observações; a nota do cadastro vira uma
      // interação, que já é o histórico do lead e aparece na aba Histórico.
      if (form.observacoes.trim()) {
        await supabase.from("interacoes").insert({
          lead_id: lead.id,
          tipo: "sistema",
          canal: "cadastro_manual",
          conteudo: `Cadastro manual por ${profile?.nome ?? "usuário"}: ${form.observacoes.trim()}`,
        });
      }

      return lead;
    },
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["interacoes"] });
      toast.success(`${lead.nome} cadastrado.`);
      setForm(emptyForm);
      // Admin/gestor seguem para o passo de documentos; vendedor encerra aqui,
      // porque não tem acesso ao módulo.
      if (podeVerDocumentos) setCriado(lead);
      else setOpen(false);
    },
    // leads.telefone tem índice único (leads_phone_key): sem esta mensagem o
    // 23505 chegaria como erro cru e o formulário parecia não fazer nada.
    onError: (error: { code?: string; message?: string }) => {
      if (error?.code === "23505") {
        toast.error("Já existe um cliente cadastrado com este telefone.");
        return;
      }
      toast.error(error?.message || "Não foi possível cadastrar o cliente.");
    },
  });

  function fechar() {
    setOpen(false);
    setCriado(null);
    setForm(emptyForm);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) fechar();
        else setOpen(true);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Cliente
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {criado ? "Cliente cadastrado" : "Novo cliente"}
          </DialogTitle>
        </DialogHeader>

        {criado ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{criado.nome}</strong> entrou no Kanban em
              &ldquo;Novo&rdquo;. Anexe agora os documentos dele, ou faça isso depois pela aba
              Documentos do cliente.
            </p>

            <DocumentoUploadDialog
              defaultLead={criado}
              trigger={
                <Button variant="outline" className="w-full">
                  <FileUp className="h-4 w-4 mr-2" />
                  Anexar documento
                </Button>
              }
            />

            <DialogFooter>
              <Button onClick={fechar}>Concluir</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome</Label>
                <Input
                  id="nome"
                  required
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefone">Telefone</Label>
                  <Input
                    id="telefone"
                    value={form.telefone}
                    onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cidade">Cidade</Label>
                  <Input
                    id="cidade"
                    value={form.cidade}
                    onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="metragem_interesse">Metragem de interesse</Label>
                  <Input
                    id="metragem_interesse"
                    type="number"
                    step="0.01"
                    value={form.metragem_interesse}
                    onChange={(e) => setForm((f) => ({ ...f, metragem_interesse: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tipo_lote_interesse">Tipo de lote de interesse</Label>
                  <Input
                    id="tipo_lote_interesse"
                    value={form.tipo_lote_interesse}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, tipo_lote_interesse: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Origem</Label>
                  <Select
                    value={form.origem}
                    onValueChange={(value: LeadOrigem) => setForm((f) => ({ ...f, origem: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_ORIGEM_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isVendedor ? null : (
                <div className="space-y-2">
                  <Label>Vendedor responsável</Label>
                  <Select
                    value={form.vendedor_id}
                    onValueChange={(value) => setForm((f) => ({ ...f, vendedor_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NENHUM_VENDEDOR}>Sem responsável ainda</SelectItem>
                      {(vendedores ?? []).map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  rows={3}
                  placeholder="Como chegou até nós, o que procura, combinados..."
                  value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Fica registrado no histórico do cliente.
                </p>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={fechar}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Salvando..." : "Cadastrar cliente"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
