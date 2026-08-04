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
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { PROFILE_ROLE_OPTIONS, type Profile, type ProfileRole, type Vendedor } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Separator } from "@/components/ui/separator";
import { useProfile } from "@/hooks/use-profile";
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

const ROLE_STYLES: Record<ProfileRole, string> = {
  admin: "bg-violet-100 text-violet-800 hover:bg-violet-100",
  gestor: "bg-sky-100 text-sky-800 hover:bg-sky-100",
  vendedor: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
};

const ROLE_LABELS: Record<ProfileRole, string> = {
  admin: "Admin",
  gestor: "Gestor",
  vendedor: "Vendedor",
};

const NO_VENDEDOR = "nenhum";
const NEW_VENDEDOR = "novo";

type ProfileWithVendedor = Profile & { vendedores: Pick<Vendedor, "id" | "nome"> | null };

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
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md border bg-muted/50 px-3 py-2 text-sm font-mono break-all">
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={copy}
          title={`Copiar ${label}`}
        >
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
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
          <DialogTitle className="font-display flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            {criado ? "Usuário criado com sucesso!" : "Nova senha gerada!"}
          </DialogTitle>
        </DialogHeader>

        {credentials ? (
          <div className="space-y-4">
            <CopyableField label="E-mail" value={credentials.email} />
            <CopyableField label="Senha temporária" value={credentials.senha_temporaria} />

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
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

/** Lê a mensagem de erro real do corpo da resposta da edge function. */
async function readFunctionError(error: { context?: Response; message: string }): Promise<string> {
  const detalhe = error.context?.json ? await error.context.json().catch(() => null) : null;
  return detalhe?.error ?? error.message;
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
      queryClient.invalidateQueries({ queryKey: ["vendedores-ativos"] });
      queryClient.invalidateQueries({ queryKey: ["vendedores-lookup"] });
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Convidar Vendedor
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Convidar membro da equipe</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Papel</Label>
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
            </div>

            <div className="space-y-2">
              <Label>Vendedor vinculado</Label>
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
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {vendedorId === NEW_VENDEDOR ? (
              <div className="space-y-2">
                <Label htmlFor="novo_vendedor_nome">Nome do novo vendedor</Label>
                <Input
                  id="novo_vendedor_nome"
                  required
                  value={novoVendedorNome}
                  onChange={(e) => setNovoVendedorNome(e.target.value)}
                />
              </div>
            ) : null}

            {vinculaVendedor ? (
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone (WhatsApp)</Label>
                <Input
                  id="telefone"
                  required
                  inputMode="tel"
                  placeholder="(12) 99999-8888"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Obrigatório para quem entra no rodízio de leads: é para este número que o resumo
                  do lead qualificado é enviado por WhatsApp.
                </p>
              </div>
            ) : null}

            {mutation.isError ? (
              <p className="text-sm text-destructive">
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : "Erro ao criar o usuário. Tente novamente."}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Criando..." : "Convidar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
    queryClient.invalidateQueries({ queryKey: ["vendedores-lookup"] });
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
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Editar Membro da Equipe</DialogTitle>
            <DialogDescription>
              {profile.nome ?? "—"} · {profile.email ?? "—"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Papel</Label>
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
            </div>

            <div className="space-y-2">
              <Label>Vendedor vinculado</Label>
              <Select
                value={vendedorId}
                onValueChange={(v) => {
                  setVendedorId(v);
                  // Trocar o vendedor vinculado traz o telefone do cadastro
                  // dele — senão o campo continuaria mostrando o número do
                  // vendedor anterior e o salvaria por cima.
                  setTelefone(vendedores.find((item) => item.id === v)?.telefone ?? "");
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
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {vendedorId !== NO_VENDEDOR ? (
              <div className="space-y-2">
                <Label htmlFor={`telefone-${profile.id}`}>Telefone (WhatsApp)</Label>
                <Input
                  id={`telefone-${profile.id}`}
                  inputMode="tel"
                  placeholder="(12) 99999-8888"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  disabled={!canEditRole}
                />
                <p className="text-xs text-muted-foreground">
                  Para onde vai o resumo do lead qualificado pelo agente de IA. Sem telefone, o
                  vendedor continua no rodízio mas não recebe a notificação por WhatsApp.
                </p>
              </div>
            ) : null}

            {canManageAccount ? (
              <>
                <Separator />

                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="status-toggle">Status</Label>
                    <p className="text-xs text-muted-foreground">
                      {profile.ativo
                        ? "Ativo — pode acessar o painel."
                        : "Inativo — login bloqueado."}
                    </p>
                  </div>
                  <Switch
                    id="status-toggle"
                    checked={profile.ativo}
                    disabled={statusMutation.isPending}
                    onCheckedChange={() => setConfirmStatus(true)}
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label>Senha</Label>
                    <p className="text-xs text-muted-foreground">
                      Gera uma nova senha temporária para compartilhar.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setResetOpen(true)}
                    disabled={resetMutation.isPending}
                  >
                    <KeyRound className="h-4 w-4 mr-2" />
                    Redefinir Senha
                  </Button>
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label className="text-destructive">Excluir membro</Label>
                    <p className="text-xs text-muted-foreground">
                      Remove da Equipe e revoga o acesso. O histórico é preservado.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir Membro
                  </Button>
                </div>
              </>
            ) : isSelf ? (
              <p className="text-xs text-muted-foreground border-t pt-3">
                Status e senha da própria conta não podem ser alterados por esta tela.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !canEditRole}
            >
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={resetOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) closeReset();
          else setResetOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Redefinir senha</DialogTitle>
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
              <div className="flex items-start gap-3 rounded-md border p-3">
                <RadioGroupItem value="aleatoria" id="modo-aleatoria" className="mt-0.5" />
                <div className="space-y-0.5">
                  <Label htmlFor="modo-aleatoria" className="font-normal cursor-pointer">
                    Gerar senha aleatória
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Exibida uma única vez para você copiar e enviar.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-md border p-3">
                <RadioGroupItem value="manual" id="modo-manual" className="mt-0.5" />
                <div className="space-y-0.5">
                  <Label htmlFor="modo-manual" className="font-normal cursor-pointer">
                    Definir senha manualmente
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Você escolhe a senha e já sabe qual informar.
                  </p>
                </div>
              </div>
            </RadioGroup>

            {resetMode === "manual" ? (
              <div className="space-y-2">
                <Label htmlFor="senha-manual">Nova senha</Label>
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
                  >
                    {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p
                  className={cn(
                    "text-xs",
                    senhaManual.length === 0
                      ? "text-muted-foreground"
                      : senhaManualValida
                        ? "text-emerald-600"
                        : "text-destructive",
                  )}
                >
                  Mínimo de 8 caracteres, com pelo menos uma letra e um número.
                </p>
              </div>
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
            <AlertDialogTitle className="font-display">
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
            <AlertDialogTitle className="font-display">Excluir membro</AlertDialogTitle>
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
}: {
  profile: ProfileWithVendedor;
  vendedores: Vendedor[];
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <TableRow>
      <TableCell className="font-medium">{profile.nome ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground">{profile.email ?? "—"}</TableCell>
      <TableCell>
        <Badge className={cn("font-normal", ROLE_STYLES[profile.role])}>
          {ROLE_LABELS[profile.role]}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge
          className={cn(
            "font-normal",
            profile.ativo
              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
              : "bg-muted text-muted-foreground",
          )}
        >
          {profile.ativo ? "Ativo" : "Inativo"}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">{profile.vendedores?.nome ?? "—"}</TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
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

  // Sem filtro de ativo: serve só para resolver o nome do vínculo, e um vendedor
  // desativado ainda precisa aparecer com nome na coluna.
  const { data: todosVendedores } = useQuery({
    queryKey: ["vendedores-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendedores").select("id, nome");
      if (error) throw error;
      return data as Pick<Vendedor, "id" | "nome">[];
    },
  });

  const profiles = useMemo<ProfileWithVendedor[] | undefined>(() => {
    if (!rawProfiles) return undefined;
    const byId = new Map((todosVendedores ?? []).map((v) => [v.id, v]));
    return rawProfiles.map((profile) => ({
      ...profile,
      vendedores: profile.vendedor_id ? (byId.get(profile.vendedor_id) ?? null) : null,
    }));
  }, [rawProfiles, todosVendedores]);

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
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-display text-primary">Equipe</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie os membros com acesso ao painel e seus papéis.
          </p>
        </div>
        <InviteMemberDialog vendedores={vendedores ?? []} />
      </div>

      {isLoading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : isError ? (
        // Distinguir falha de lista vazia: tratar as duas igual foi o que
        // escondeu este bug — a query quebrava e a tela dizia "nenhum membro".
        <div className="border border-destructive/40 rounded-lg p-6 text-center space-y-1">
          <p className="text-sm font-medium text-destructive">Erro ao carregar a equipe.</p>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : "Tente recarregar a página."}
          </p>
          <p className="text-xs text-muted-foreground">
            Detalhes técnicos no console do navegador.
          </p>
        </div>
      ) : !profiles || profiles.length === 0 ? (
        <p className="text-sm text-muted-foreground border rounded-lg p-6 text-center">
          Nenhum membro cadastrado ainda.
        </p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Vendedor vinculado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((profile) => (
                <TeamRow key={profile.id} profile={profile} vendedores={vendedores ?? []} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
