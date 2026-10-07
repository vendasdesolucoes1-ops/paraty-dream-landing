import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Check, FileUp, Mail, MapPin, Phone, Plus, UserPlus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ds/kbd";
import { cn } from "@/lib/utils";
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
  const navigate = useNavigate();
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
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) fechar();
        else setOpen(true);
      }}
    >
      <SheetTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" aria-hidden />
          Novo cliente
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-[31rem]">
        <SheetTitle className="sr-only">
          {criado ? "Cliente cadastrado" : "Novo cliente"}
        </SheetTitle>
        <SheetDescription className="sr-only">
          {criado
            ? "O cliente foi cadastrado e entrou no Kanban."
            : "Preencha os dados do cliente para cadastrá-lo no CRM."}
        </SheetDescription>

        {criado ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success animate-in zoom-in-50 duration-500">
              <span
                aria-hidden
                className="absolute inset-0 rounded-full ring-8 ring-success/10 animate-in fade-in-0 duration-700"
              />
              <Check className="h-8 w-8" strokeWidth={2.25} aria-hidden />
            </span>
            <h2 className="mt-6 font-display text-[2rem] font-medium leading-none tracking-[-0.01em]">
              Cliente cadastrado
            </h2>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              <strong className="font-semibold text-foreground">{criado.nome}</strong> entrou no
              Kanban em &ldquo;Novo&rdquo;. Anexe agora os documentos, ou faça isso depois pela aba
              Documentos do cliente.
            </p>
            <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
              <DocumentoUploadDialog
                defaultLead={criado}
                trigger={
                  <Button variant="outline" className="w-full">
                    <FileUp className="h-4 w-4" aria-hidden />
                    Anexar documento
                  </Button>
                }
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  const id = criado.id;
                  fechar();
                  navigate({ to: "/dashboard/crm", search: { lead: id } });
                }}
              >
                <ArrowUpRight className="h-4 w-4" aria-hidden />
                Abrir a ficha no CRM
              </Button>
              <Button onClick={fechar}>Concluir</Button>
            </div>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-4 border-b border-border px-7 pb-5 pt-7">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <UserPlus className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-[1.85rem] font-medium leading-none tracking-[-0.01em]">
                  Novo cliente
                </h2>
                <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">
                  Entra no Kanban como &ldquo;Novo&rdquo;.
                </p>
              </div>
            </header>

            <form
              id="form-cliente"
              onSubmit={handleSubmit}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.requestSubmit();
                }
              }}
              className="flex-1 space-y-8 overflow-y-auto px-7 py-6"
            >
              <Secao titulo="Contato">
                <Campo id="nome" label="Nome completo" obrigatorio>
                  <Input
                    id="nome"
                    required
                    autoFocus
                    autoComplete="off"
                    placeholder="Ex.: Maria Souza"
                    value={form.nome}
                    onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  />
                </Campo>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Campo id="telefone" label="Telefone / WhatsApp">
                    <ComIcone icone={Phone}>
                      <Input
                        id="telefone"
                        type="tel"
                        inputMode="tel"
                        placeholder="(24) 99999-8888"
                        className="pl-9"
                        value={form.telefone}
                        onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                      />
                    </ComIcone>
                  </Campo>
                  <Campo id="email" label="E-mail">
                    <ComIcone icone={Mail}>
                      <Input
                        id="email"
                        type="email"
                        placeholder="nome@email.com"
                        className="pl-9"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      />
                    </ComIcone>
                  </Campo>
                </div>
              </Secao>

              <Secao titulo="Interesse">
                <Campo id="cidade" label="Cidade">
                  <ComIcone icone={MapPin}>
                    <Input
                      id="cidade"
                      placeholder="Onde mora hoje"
                      className="pl-9"
                      value={form.cidade}
                      onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))}
                    />
                  </ComIcone>
                </Campo>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Campo id="metragem_interesse" label="Metragem">
                    <div className="relative">
                      <Input
                        id="metragem_interesse"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        placeholder="360"
                        className="pr-10"
                        value={form.metragem_interesse}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, metragem_interesse: e.target.value }))
                        }
                      />
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[0.8125rem] text-muted-foreground"
                      >
                        m²
                      </span>
                    </div>
                  </Campo>
                  <Campo id="tipo_lote_interesse" label="Tipo de lote">
                    <Input
                      id="tipo_lote_interesse"
                      placeholder="Ex.: esquina, plano"
                      value={form.tipo_lote_interesse}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, tipo_lote_interesse: e.target.value }))
                      }
                    />
                  </Campo>
                </div>
              </Secao>

              <Secao titulo="Atendimento">
                <div role="radiogroup" aria-label="Origem do cliente" className="space-y-2">
                  <p className="text-[0.8125rem] font-medium">Como chegou</p>
                  <div className="flex flex-wrap gap-2">
                    {LEAD_ORIGEM_OPTIONS.map((opt) => {
                      const ativo = form.origem === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="radio"
                          aria-checked={ativo}
                          onClick={() => setForm((f) => ({ ...f, origem: opt.value }))}
                          className={cn(
                            "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[0.8125rem] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15",
                            ativo
                              ? "border-primary bg-primary text-primary-foreground shadow-sm"
                              : "border-input bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                          )}
                        >
                          {ativo ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {isVendedor ? null : (
                  <Campo id="vendedor" label="Vendedor responsável">
                    <Select
                      value={form.vendedor_id}
                      onValueChange={(value) => setForm((f) => ({ ...f, vendedor_id: value }))}
                    >
                      <SelectTrigger id="vendedor">
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
                  </Campo>
                )}

                <Campo
                  id="observacoes"
                  label="Observações"
                  dica="Fica registrado no histórico do cliente."
                >
                  <Textarea
                    id="observacoes"
                    rows={3}
                    placeholder="Como chegou até nós, o que procura, combinados…"
                    value={form.observacoes}
                    onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                  />
                </Campo>
              </Secao>
            </form>

            <footer className="flex items-center justify-between gap-3 border-t border-border bg-card px-7 py-4">
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                <Kbd>⌘</Kbd>
                <Kbd>↵</Kbd> cadastrar
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={fechar}>
                  Cancelar
                </Button>
                <Button type="submit" form="form-cliente" disabled={mutation.isPending}>
                  {mutation.isPending ? "Salvando…" : "Cadastrar cliente"}
                </Button>
              </div>
            </footer>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Bloco do formulário: título pequeno em caixa-alta com fio, e os campos embaixo. */
function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="flex w-full items-center gap-3 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {titulo}
        <span aria-hidden className="h-px flex-1 bg-border" />
      </legend>
      {children}
    </fieldset>
  );
}

function Campo({
  id,
  label,
  obrigatorio,
  dica,
  children,
}: {
  id: string;
  label: string;
  obrigatorio?: boolean;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1">
        {label}
        {obrigatorio ? (
          <span aria-hidden className="text-danger">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {dica ? <p className="text-xs text-muted-foreground">{dica}</p> : null}
    </div>
  );
}

function ComIcone({
  icone: Icone,
  children,
}: {
  icone: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <Icone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      {children}
    </div>
  );
}
