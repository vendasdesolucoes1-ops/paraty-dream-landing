import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, CheckCircle2, Copy, MoreVertical, Plus } from "lucide-react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
}

function InviteMemberDialog({ vendedores }: { vendedores: Vendedor[] }) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProfileRole>("vendedor");
  const [vendedorId, setVendedorId] = useState(NO_VENDEDOR);
  const [novoVendedorNome, setNovoVendedorNome] = useState("");
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
  };

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
        },
      });
      // Erros de negócio (e-mail duplicado) chegam como não-2xx; sem ler o corpo
      // o usuário veria apenas "non-2xx status code".
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const detalhe = ctx?.json ? await ctx.json().catch(() => null) : null;
        throw new Error(detalhe?.error ?? error.message);
      }
      if (data?.error) throw new Error(data.error);
      return data as { email: string; senha_temporaria: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["team-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["vendedores-ativos"] });
      queryClient.invalidateQueries({ queryKey: ["vendedores-lookup"] });
      setCredentials({ nome, email: data.email, senha_temporaria: data.senha_temporaria });
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

      {/* Credenciais geradas — única oportunidade de ver a senha temporária. */}
      <Dialog
        open={!!credentials}
        onOpenChange={(isOpen) => {
          if (!isOpen) setCredentials(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Usuário criado com sucesso!
            </DialogTitle>
          </DialogHeader>

          {credentials ? (
            <div className="space-y-4">
              <CopyableField label="E-mail" value={credentials.email} />
              <CopyableField label="Senha temporária" value={credentials.senha_temporaria} />

              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Compartilhe essas credenciais com {credentials.nome} por um canal seguro (WhatsApp,
                por exemplo). Essa senha não poderá ser vista novamente depois de fechar esta
                janela.
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button onClick={() => setCredentials(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditRoleDialog({
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
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-team", {
        body: {
          action: "update_role",
          profile_id: profile.id,
          role,
          vendedor_id: vendedorId !== NO_VENDEDOR ? vendedorId : null,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Papel atualizado.");
      queryClient.invalidateQueries({ queryKey: ["team-profiles"] });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao atualizar o papel."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar papel — {profile.nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
                {vendedores.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const queryClient = useQueryClient();

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-team", {
        body: { action: "deactivate", profile_id: profile.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Membro desativado.");
      queryClient.invalidateQueries({ queryKey: ["team-profiles"] });
    },
    onError: () => toast.error("Erro ao desativar o membro."),
  });

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
            <DropdownMenuItem onClick={() => setEditOpen(true)}>Editar papel</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => deactivateMutation.mutate()}
              className="text-destructive focus:text-destructive"
              disabled={!profile.ativo}
            >
              Desativar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>

      <EditRoleDialog
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
        .order("created_at", { ascending: false });
      if (error) throw error;
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
