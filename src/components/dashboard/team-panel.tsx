import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  MoreVertical,
  Plus,
  Trash2,
  UserPlus,
  Users,
  Phone,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn, readFunctionError } from "@/lib/utils";
import { PROFILE_ROLE_OPTIONS, type Profile, type ProfileRole, type Vendedor } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useProfile } from "@/hooks/use-profile";
import { Avatar } from "@/components/ds/avatar";
import { Bloco } from "@/components/ds/bloco";
import { Kbd } from "@/components/ds/kbd";
import { Pill, type Tone } from "@/components/ds/pill";
import { SkeletonRows } from "@/components/ds/query-state";
import { atraso } from "@/components/ds/reveal";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Campo, ComIcone, LinhaAjuste, Secao } from "@/components/ajustes/campos";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROLE_TONES: Record<ProfileRole, Tone> = {
  admin: "accent",
  gestor: "info",
  vendedor: "neutral",
};

const ROLE_LABELS: Record<ProfileRole, string> = {
  admin: "Admin",
  gestor: "Gestor",
  vendedor: "Vendedor",
};

const NO_VENDEDOR = "nenhum";
const NEW_VENDEDOR = "novo";

type ProfileWithVendedor = Profile & {
  vendedores: Pick<Vendedor, "id" | "nome" | "ativo"> | null;
};

/** Campo somente-leitura com botão de copiar, usado nas credenciais geradas. */
function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie manualmente.");
    }
  };

  return (
    <Campo label={label}>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded-lg border border-border bg-muted/50 px-3 py-2.5 font-mono text-sm">
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={copy}
          title={`Copiar ${label}`}
          aria-label={`Copiar ${label}`}
        >
          {copied ? (
            <Check className="h-4 w-4 text-success" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
        </Button>
      </div>
    </Campo>
  );
}

interface CreatedCredentials {
  nome: string;
  email: string;
  senha_temporaria: string;
  /** Diferencia o texto entre criar usuário e redefinir senha de um existente. */
  modo: "criado" | "senha_redefinida";
}

/**
 * Exibição única das credenciais geradas — usada tanto na criação do membro
 * quanto na redefinição de senha. A senha vive só neste estado, em memória.
 */
function CredentialsDialog({
  credentials,
  onClose,
}: {
  credentials: CreatedCredentials | null;
  onClose: () => void;
}) {
  const criado = credentials?.modo === "criado";

  return (
    <Dialog
      open={!!credentials}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-success"
            >
              <CheckCircle2 className="h-5 w-5" />
            </span>
            {criado ? "Usuário criado com sucesso!" : "Nova senha gerada!"}
          </DialogTitle>
        </DialogHeader>

        {credentials ? (
          <div className="space-y-4">
            <CopyableField label="E-mail" value={credentials.email} />
            <CopyableField label="Senha temporária" value={credentials.senha_temporaria} />

            <div className="rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm leading-relaxed text-foreground">
              Compartilhe essas credenciais com {credentials.nome} por um canal seguro (WhatsApp,
              por exemplo). Essa senha não poderá ser vista novamente depois de fechar esta janela.
              {criado ? null : " A senha anterior deixou de funcionar."}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteMemberDialog({ vendedores }: { vendedores: Vendedor[] }) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProfileRole>("vendedor");
  const [vendedorId, setVendedorId] = useState(NO_VENDEDOR);
  const [novoVendedorNome, setNovoVendedorNome] = useState("");
  const [telefone, setTelefone] = useState("");
  // Credenciais recém-criadas: existem apenas em memória, enquanto o modal de
  // confirmação estiver aberto. Nada disso é persistido.
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const queryClient = useQueryClient();

  const resetForm = () => {
    setNome("");
    setEmail("");
    setRole("vendedor");
    setVendedorId(NO_VENDEDOR);
    setNovoVendedorNome("");
    setTelefone("");
  };

  // O membro só entra no rodízio (e só recebe o resumo do lead por WhatsApp)
  // se existir um registro em `vendedores` — que é criado automaticamente para
  // o papel "vendedor" ou escolhido/criado à mão na lista abaixo.
  const vinculaVendedor = role === "vendedor" || vendedorId !== NO_VENDEDOR;

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-team", {
        body: {
          action: "invite",
          nome,
          email,
          role,
          vendedor_id:
            vendedorId !== NO_VENDEDOR && vendedorId !== NEW_VENDEDOR ? vendedorId : null,
          novo_vendedor_nome: vendedorId === NEW_VENDEDOR ? novoVendedorNome : null,
          telefone: vinculaVendedor ? telefone : null,
        },
      });
      // Erros de negócio (e-mail duplicado) chegam como não-2xx; sem ler o corpo
      // o usuário veria apenas "non-2xx status code".
      if (error) throw new Error(await readFunctionError(error));
      if (data?.error) throw new Error(data.error);
      return data as { email: string; senha_temporaria: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["team-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["vendedores-todos"] });
      setCredentials({
        nome,
        email: data.email,
        senha_temporaria: data.senha_temporaria,
        modo: "criado",
      });
      setOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao criar o usuário."),
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        Convidar Vendedor
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-[31rem]">
          <SheetTitle className="sr-only">Convidar membro da equipe</SheetTitle>
          <SheetDescription className="sr-only">
            Preencha os dados do novo membro para criar o acesso ao painel.
          </SheetDescription>

          <header className="flex items-center gap-4 border-b border-border px-7 pb-5 pr-14 pt-7">
            <span
              aria-hidden
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"
            >
              <UserPlus className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-[1.85rem] font-medium leading-none tracking-[-0.01em]">
                Convidar membro da equipe
              </h2>
              <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">
                Gera uma senha temporária para compartilhar.
              </p>
            </div>
          </header>

          <form
            id="form-convite"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.requestSubmit();
              }
            }}
            className="flex-1 space-y-8 overflow-y-auto px-7 py-6"
          >
            <Secao titulo="Acesso">
              <Campo id="nome" label="Nome" obrigatorio>
                <Input
                  id="nome"
                  required
                  autoFocus
                  autoComplete="off"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </Campo>

              <Campo id="email" label="E-mail" obrigatorio>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Campo>

              <Campo label="Papel">
                <Select value={role} onValueChange={(v) => setRole(v as ProfileRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROFILE_ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
            </Secao>

            <Secao titulo="Vendas">
              <Campo label="Vendedor vinculado">
                <Select value={vendedorId} onValueChange={setVendedorId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_VENDEDOR}>Nenhum</SelectItem>
                    <SelectItem value={NEW_VENDEDOR}>Criar novo vendedor</SelectItem>
                    {vendedores.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.nome}
                        {v.ativo ? "" : " (fora do rodízio)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>

              {vendedorId === NEW_VENDEDOR ? (
                <Campo
                  id="novo_vendedor_nome"
                  label="Nome do novo vendedor"
                  obrigatorio
                  className="animate-swap"
                >
                  <Input
                    id="novo_vendedor_nome"
                    required
                    value={novoVendedorNome}
                    onChange={(e) => setNovoVendedorNome(e.target.value)}
                  />
                </Campo>
              ) : null}

              {vinculaVendedor ? (
                <Campo
                  id="telefone"
                  label="Telefone (WhatsApp)"
                  obrigatorio
                  className="animate-swap"
                  dica="Obrigatório para quem entra no rodízio de leads: é para este número que o resumo do lead qualificado é enviado por WhatsApp."
                >
                  <ComIcone icone={Phone}>
                    <Input
                      id="telefone"
                      required
                      inputMode="tel"
                      placeholder="(12) 99999-8888"
                      className="pl-9"
                      value={telefone}
                      onChange={(e) => setTelefone(e.target.value)}
                    />
                  </ComIcone>
                </Campo>
              ) : null}
            </Secao>

            {mutation.isError ? (
              <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : "Erro ao criar o usuário. Tente novamente."}
              </p>
            ) : null}
          </form>

          <footer className="flex items-center justify-between gap-3 border-t border-border bg-card px-7 py-4">
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd> convidar
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" form="form-convite" disabled={mutation.isPending}>
                {mutation.isPending ? "Criando..." : "Convidar"}
              </Button>
            </div>
          </footer>
        </SheetContent>
      </Sheet>

      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
    </>
  );
}

function EditMemberDialog({
  profile,
  vendedores,
  open,
  onOpenChange,
}: {
  profile: ProfileWithVendedor;
  vendedores: Vendedor[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [role, setRole] = useState<ProfileRole>(profile.role);
  const [vendedorId, setVendedorId] = useState(profile.vendedor_id ?? NO_VENDEDOR);
  const [telefone, setTelefone] = useState(
    () => vendedores.find((v) => v.id === profile.vendedor_id)?.telefone ?? "",
  );
  const [vendedorAtivo, setVendedorAtivo] = useState(
    () => vendedores.find((v) => v.id === profile.vendedor_id)?.ativo ?? true,
  );
  const [resetOpen, setResetOpen] = useState(false);
  const [resetMode, setResetMode] = useState<"aleatoria" | "manual">("aleatoria");
  const [senhaManual, setSenhaManual] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const queryClient = useQueryClient();
  const { profile: currentUser } = useProfile();

  // Senha e status são exclusivos de admin. A própria conta fica de fora para
  // o admin não se autobloquear. A edge function repete estas checagens — aqui
  // é só para não oferecer um botão que vai falhar.
  const isAdmin = currentUser?.role === "admin";
  const isSelf = currentUser?.id === profile.id;
  const canManageAccount = isAdmin && !isSelf;
  const canEditRole = isAdmin || (currentUser?.role === "gestor" && profile.role !== "admin");

  const invalidateTeam = () => {
    queryClient.invalidateQueries({ queryKey: ["team-profiles"] });
    queryClient.invalidateQueries({ queryKey: ["vendedores-todos"] });
  };

  const callManageTeam = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("manage-team", { body });
    if (error) throw new Error(await readFunctionError(error));
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      callManageTeam({
        action: "update_role",
        profile_id: profile.id,
        role,
        vendedor_id: vendedorId !== NO_VENDEDOR ? vendedorId : null,
        telefone: vendedorId !== NO_VENDEDOR ? telefone : undefined,
        vendedor_ativo: vendedorId !== NO_VENDEDOR ? vendedorAtivo : undefined,
      }),
    onSuccess: () => {
      toast.success("Membro atualizado.");
      invalidateTeam();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao atualizar o membro."),
  });

  const statusMutation = useMutation({
    mutationFn: () =>
      callManageTeam({
        action: profile.ativo ? "deactivate" : "reactivate",
        profile_id: profile.id,
      }),
    onSuccess: () => {
      toast.success(profile.ativo ? "Membro desativado." : "Membro reativado.");
      invalidateTeam();
      setConfirmStatus(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao alterar o status.");
      setConfirmStatus(false);
    },
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      callManageTeam({
        action: "reset_password",
        profile_id: profile.id,
        senha: resetMode === "manual" ? senhaManual : null,
      }),
    onSuccess: (data: { email: string; senha_temporaria?: string; manual?: boolean }) => {
      closeReset();
      // Na senha manual o admin já sabe qual é — não há o que exibir.
      if (data.manual) {
        toast.success("Senha atualizada.");
        return;
      }
      setCredentials({
        nome: profile.nome ?? "o membro",
        email: data.email,
        senha_temporaria: data.senha_temporaria ?? "",
        modo: "senha_redefinida",
      });
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao redefinir a senha."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => callManageTeam({ action: "delete_member", profile_id: profile.id }),
    onSuccess: () => {
      toast.success(`${profile.nome ?? "Membro"} excluído da equipe.`);
      invalidateTeam();
      setConfirmDelete(false);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao excluir o membro.");
      setConfirmDelete(false);
    },
  });

  const senhaManualValida =
    senhaManual.length >= 8 && /[A-Za-z]/.test(senhaManual) && /[0-9]/.test(senhaManual);
  const podeConfirmarReset = resetMode === "aleatoria" || senhaManualValida;

  function closeReset() {
    setResetOpen(false);
    setResetMode("aleatoria");
    setSenhaManual("");
    setMostrarSenha(false);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-[31rem]">
          <SheetTitle className="sr-only">Editar Membro da Equipe</SheetTitle>
          <SheetDescription className="sr-only">
            {profile.nome ?? "—"} · {profile.email ?? "—"}
          </SheetDescription>

          <header className="flex items-center gap-4 border-b border-border px-7 pb-5 pr-14 pt-7">
            <Avatar nome={profile.nome} className="h-11 w-11 text-sm" />
            <div className="min-w-0">
              <h2 className="truncate font-display text-[1.85rem] font-medium leading-none tracking-[-0.01em]">
                {profile.nome ?? "Membro"}
              </h2>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted-foreground">
                <span className="truncate">{profile.email ?? "—"}</span>
                <Pill tone={ROLE_TONES[profile.role]}>{ROLE_LABELS[profile.role]}</Pill>
              </p>
            </div>
          </header>

          <div className="flex-1 space-y-8 overflow-y-auto px-7 py-6">
            <Secao titulo="Acesso">
              <Campo label="Papel">
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as ProfileRole)}
                  disabled={!canEditRole}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROFILE_ROLE_OPTIONS.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        value={opt.value}
                        disabled={opt.value === "admin" && !isAdmin}
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
            </Secao>

            <Secao titulo="Vendas">
              <Campo label="Vendedor vinculado">
                <Select
                  value={vendedorId}
                  onValueChange={(v) => {
                    setVendedorId(v);
                    // Trocar o vendedor vinculado traz telefone e status do
                    // cadastro dele — senão os campos continuariam mostrando o
                    // vendedor anterior e salvariam por cima.
                    const escolhido = vendedores.find((item) => item.id === v);
                    setTelefone(escolhido?.telefone ?? "");
                    setVendedorAtivo(escolhido?.ativo ?? true);
                  }}
                  disabled={!canEditRole}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_VENDEDOR}>Nenhum</SelectItem>
                    {vendedores.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.nome}
                        {v.ativo ? "" : " (fora do rodízio)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>

              {vendedorId !== NO_VENDEDOR ? (
                <div className="animate-swap space-y-5">
                  <Campo
                    id={`telefone-${profile.id}`}
                    label="Telefone (WhatsApp)"
                    dica="Para onde vai o resumo do lead qualificado pelo agente de IA. Sem telefone, o vendedor continua no rodízio mas não recebe a notificação por WhatsApp."
                  >
                    <ComIcone icone={Phone}>
                      <Input
                        id={`telefone-${profile.id}`}
                        inputMode="tel"
                        placeholder="(12) 99999-8888"
                        className="pl-9"
                        value={telefone}
                        onChange={(e) => setTelefone(e.target.value)}
                        disabled={!canEditRole}
                      />
                    </ComIcone>
                  </Campo>

                  <div className="rounded-xl border border-border bg-background px-4 py-3.5">
                    <LinhaAjuste
                      titulo={
                        <Label htmlFor={`vendedor-ativo-${profile.id}`}>Participa do rodízio</Label>
                      }
                      descricao={
                        vendedorAtivo
                          ? "Recebe leads na fila de round-robin."
                          : "Fora da fila — não recebe leads novos nem resumos de qualificação."
                      }
                      controle={
                        <Switch
                          id={`vendedor-ativo-${profile.id}`}
                          checked={vendedorAtivo}
                          onCheckedChange={setVendedorAtivo}
                          disabled={!canEditRole}
                        />
                      }
                    />
                  </div>
                </div>
              ) : null}
            </Secao>

            {canManageAccount ? (
              <Secao titulo="Conta">
                <div className="divide-y divide-border rounded-xl border border-border bg-background px-4">
                  <LinhaAjuste
                    className="py-4 first:pt-4 last:pb-4"
                    titulo={<Label htmlFor="status-toggle">Status</Label>}
                    descricao={
                      profile.ativo
                        ? "Ativo — pode acessar o painel."
                        : "Inativo — login bloqueado."
                    }
                    controle={
                      <Switch
                        id="status-toggle"
                        checked={profile.ativo}
                        disabled={statusMutation.isPending}
                        onCheckedChange={() => setConfirmStatus(true)}
                      />
                    }
                  />
                  <LinhaAjuste
                    className="py-4 first:pt-4 last:pb-4"
                    titulo="Senha"
                    descricao="Gera uma nova senha temporária para compartilhar."
                    controle={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setResetOpen(true)}
                        disabled={resetMutation.isPending}
                      >
                        <KeyRound className="h-4 w-4" aria-hidden />
                        Redefinir Senha
                      </Button>
                    }
                  />
                </div>

                <div className="rounded-xl border border-danger/30 bg-danger-soft/50 px-4">
                  <LinhaAjuste
                    className="py-4 first:pt-4 last:pb-4"
                    titulo={<span className="text-danger">Excluir membro</span>}
                    descricao="Remove da Equipe e revoga o acesso. O histórico é preservado."
                    controle={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-danger/40 text-danger hover:bg-danger-soft hover:text-danger"
                        onClick={() => setConfirmDelete(true)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        Excluir Membro
                      </Button>
                    }
                  />
                </div>
              </Secao>
            ) : isSelf ? (
              <p className="border-t border-border pt-4 text-xs text-muted-foreground">
                Status e senha da própria conta não podem ser alterados por esta tela.
              </p>
            ) : null}
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-border bg-card px-7 py-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !canEditRole}
            >
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </footer>
        </SheetContent>
      </Sheet>

      <Dialog
        open={resetOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) closeReset();
          else setResetOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              Gerar nova senha para {profile.nome ?? "este membro"}? A senha atual deixará de
              funcionar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <RadioGroup
              value={resetMode}
              onValueChange={(v) => setResetMode(v as "aleatoria" | "manual")}
              className="gap-3"
            >
              <div
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-4 transition-colors",
                  resetMode === "aleatoria"
                    ? "border-foreground/40 bg-muted/60"
                    : "border-border hover:border-foreground/25",
                )}
              >
                <RadioGroupItem value="aleatoria" id="modo-aleatoria" className="mt-0.5" />
                <div className="space-y-0.5">
                  <Label htmlFor="modo-aleatoria" className="cursor-pointer text-sm">
                    Gerar senha aleatória
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Exibida uma única vez para você copiar e enviar.
                  </p>
                </div>
              </div>

              <div
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-4 transition-colors",
                  resetMode === "manual"
                    ? "border-foreground/40 bg-muted/60"
                    : "border-border hover:border-foreground/25",
                )}
              >
                <RadioGroupItem value="manual" id="modo-manual" className="mt-0.5" />
                <div className="space-y-0.5">
                  <Label htmlFor="modo-manual" className="cursor-pointer text-sm">
                    Definir senha manualmente
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Você escolhe a senha e já sabe qual informar.
                  </p>
                </div>
              </div>
            </RadioGroup>

            {resetMode === "manual" ? (
              <Campo id="senha-manual" label="Nova senha" className="animate-swap">
                <div className="flex items-center gap-2">
                  <Input
                    id="senha-manual"
                    type={mostrarSenha ? "text" : "password"}
                    value={senhaManual}
                    onChange={(e) => setSenhaManual(e.target.value)}
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setMostrarSenha((v) => !v)}
                    title={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                    aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {mostrarSenha ? (
                      <EyeOff className="h-4 w-4" aria-hidden />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </div>
                <p
                  className={cn(
                    "text-xs",
                    senhaManual.length === 0
                      ? "text-muted-foreground"
                      : senhaManualValida
                        ? "text-success"
                        : "text-danger",
                  )}
                >
                  Mínimo de 8 caracteres, com pelo menos uma letra e um número.
                </p>
              </Campo>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeReset}>
              Cancelar
            </Button>
            <Button
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending || !podeConfirmarReset}
            >
              {resetMutation.isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmStatus} onOpenChange={setConfirmStatus}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {profile.ativo ? "Desativar membro" : "Reativar membro"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {profile.ativo
                ? `${profile.nome ?? "Este membro"} deixará de conseguir entrar no painel. O histórico de atribuições é preservado e o acesso pode ser devolvido depois.`
                : `${profile.nome ?? "Este membro"} volta a conseguir entrar no painel com a senha atual.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                statusMutation.mutate();
              }}
              disabled={statusMutation.isPending}
            >
              {statusMutation.isPending ? "Aplicando..." : profile.ativo ? "Desativar" : "Reativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir membro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {profile.nome ?? "este membro"}? Ele perderá acesso ao
              sistema e deixará de aparecer na lista de Equipe. Todo o histórico de leads,
              documentos e ações associadas a ele será preservado internamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
              className="bg-danger text-primary-foreground hover:bg-danger/90"
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir membro"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
    </>
  );
}

function TeamRow({
  profile,
  vendedores,
  indice,
}: {
  profile: ProfileWithVendedor;
  vendedores: Vendedor[];
  indice: number;
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <TableRow className="animate-swap" style={atraso(indice, 40, 320)}>
      <TableCell className="py-3.5 pl-5">
        <div className="flex items-center gap-3">
          <Avatar nome={profile.nome} className="h-10 w-10 text-[0.8rem]" />
          <div className="min-w-0">
            <p className="truncate font-medium leading-tight">{profile.nome ?? "—"}</p>
            <p className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground">
              {profile.email ?? "—"}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Pill tone={ROLE_TONES[profile.role]}>{ROLE_LABELS[profile.role]}</Pill>
      </TableCell>
      <TableCell>
        <Pill tone={profile.ativo ? "success" : "neutral"} dot>
          {profile.ativo ? "Ativo" : "Inativo"}
        </Pill>
      </TableCell>
      <TableCell className="text-muted-foreground">
        <span className="inline-flex flex-wrap items-center gap-2">
          {profile.vendedores?.nome ?? "—"}
          {profile.vendedores && !profile.vendedores.ativo ? <Pill>Fora do rodízio</Pill> : null}
        </span>
      </TableCell>
      <TableCell className="pr-4 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Ações para ${profile.nome ?? "o membro"}`}
            >
              <MoreVertical className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>Editar membro</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>

      <EditMemberDialog
        profile={profile}
        vendedores={vendedores}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </TableRow>
  );
}

export function TeamPanel() {
  // profiles e vendedores têm FK nos dois sentidos (profiles.vendedor_id e
  // vendedores.profile_id), então um embed do tipo `vendedores(...)` é ambíguo
  // para o PostgREST e falha com PGRST201. As duas tabelas são buscadas
  // separadamente e o vínculo é resolvido aqui — um admin/gestor sem
  // vendedor_id continua aparecendo normalmente.
  const {
    data: rawProfiles,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["team-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .is("deletado_em", null)
        .order("created_at", { ascending: false });
      if (error) {
        // O objeto de erro do PostgREST carrega code/details/hint, que dizem
        // exatamente o que falhou (coluna inexistente, FK ambígua, RLS). Sem
        // isto sobra só a mensagem na tela, e o diagnóstico vira adivinhação.
        console.error("[team-profiles] falha ao carregar a equipe:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }
      return data as Profile[];
    },
  });

  // Sem filtro de ativo: um vendedor tirado do rodízio precisa continuar
  // selecionável na tela (senão não haveria como reativá-lo depois de
  // desativado) e aparecer com nome na coluna "Vendedor vinculado".
  const { data: vendedores } = useQuery({
    queryKey: ["vendedores-todos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendedores")
        .select("*")
        .order("nome", { ascending: true });
      if (error) throw error;
      return data as Vendedor[];
    },
  });

  const profiles = useMemo<ProfileWithVendedor[] | undefined>(() => {
    if (!rawProfiles) return undefined;
    const byId = new Map((vendedores ?? []).map((v) => [v.id, v]));
    return rawProfiles.map((profile) => ({
      ...profile,
      vendedores: profile.vendedor_id ? (byId.get(profile.vendedor_id) ?? null) : null,
    }));
  }, [rawProfiles, vendedores]);

  return (
    <Bloco
      titulo="Equipe"
      descricao="Gerencie os membros com acesso ao painel e seus papéis."
      acao={<InviteMemberDialog vendedores={vendedores ?? []} />}
    >
      {isLoading ? (
        <SkeletonRows rows={5} className="h-[4.25rem]" />
      ) : isError ? (
        // Distinguir falha de lista vazia: tratar as duas igual foi o que
        // escondeu este bug — a query quebrava e a tela dizia "nenhum membro".
        <div
          role="alert"
          className="animate-swap space-y-1 rounded-2xl border border-danger/30 bg-danger-soft p-6 text-center"
        >
          <p className="text-sm font-semibold text-danger">Erro ao carregar a equipe.</p>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : "Tente recarregar a página."}
          </p>
          <p className="text-xs text-muted-foreground">
            Detalhes técnicos no console do navegador.
          </p>
        </div>
      ) : !profiles || profiles.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum membro cadastrado ainda."
          description="Convide o primeiro membro da equipe para dar acesso ao painel."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Membro</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Vendedor vinculado</TableHead>
                <TableHead className="pr-4 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((profile, i) => (
                <TeamRow
                  key={profile.id}
                  profile={profile}
                  vendedores={vendedores ?? []}
                  indice={i}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Bloco>
  );
}
