import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Loader2, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Campo } from "@/components/ajustes/campos";
import { Pill } from "@/components/ds/pill";
import { formatTelefone, tempoRelativo } from "@/lib/format";
import {
  SITUACAO,
  lerLimite,
  normalizarTelefone,
  plural,
  podeReativar,
  type VendedorRodizio,
} from "@/lib/rodizio-formato";
import { useAtualizarVendedor, useMoverNaFila } from "@/lib/rodizio";
import { cn } from "@/lib/utils";

/**
 * A fila: quem participa (na ordem em que recebe) e, abaixo, quem está fora.
 * A ordem é a do banco (posicao_round_robin); quem bate o limite do dia ou
 * está sem WhatsApp fica no lugar, mas a vez passa para o seguinte.
 */
export function FilaRodizio({ vendedores }: { vendedores: VendedorRodizio[] }) {
  const [editando, setEditando] = useState<VendedorRodizio | null>(null);
  const naFila = vendedores.filter((v) => v.ativo && v.no_rodizio);
  const fora = vendedores.filter((v) => !(v.ativo && v.no_rodizio));

  if (vendedores.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-[0.875rem] text-muted-foreground">
        Nenhum vendedor cadastrado. Crie um usuário com o papel Vendedor em Configurações → Equipe →
        Usuários e acessos.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Na fila · {naFila.length}
        </p>
        {naFila.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-[0.8125rem] text-muted-foreground">
            Ninguém participa do rodízio. Ligue a chave “Na fila” de um vendedor abaixo.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-background">
            {naFila.map((v, i) => (
              <LinhaVendedor
                key={v.id}
                v={v}
                posicao={i + 1}
                primeiro={i === 0}
                ultimo={i === naFila.length - 1}
                onEditar={() => setEditando(v)}
              />
            ))}
          </ul>
        )}
      </div>

      {fora.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Fora da fila · {fora.length}
          </p>
          <ul className="divide-y divide-border rounded-xl border border-border bg-background">
            {fora.map((v) => (
              <LinhaVendedor key={v.id} v={v} onEditar={() => setEditando(v)} />
            ))}
          </ul>
        </div>
      ) : null}

      <EditarVendedor vendedor={editando} onFechar={() => setEditando(null)} />
    </div>
  );
}

function LinhaVendedor({
  v,
  posicao,
  primeiro,
  ultimo,
  onEditar,
}: {
  v: VendedorRodizio;
  posicao?: number;
  primeiro?: boolean;
  ultimo?: boolean;
  onEditar: () => void;
}) {
  const mover = useMoverNaFila();
  const atualizar = useAtualizarVendedor();
  const s = SITUACAO[v.situacao];
  const naFila = posicao !== undefined;

  const detalhes = [
    v.telefone ? formatTelefone(v.telefone) : "Sem WhatsApp",
    v.limite_diario ? `hoje ${v.hoje}/${v.limite_diario}` : `hoje ${v.hoje} · sem limite`,
    `${plural(v.total, "lead recebido", "leads recebidos")}`,
    v.ultima ? `último ${tempoRelativo(v.ultima)}` : null,
    `${plural(v.carteira_aberta, "lead em aberto", "leads em aberto")}`,
  ].filter(Boolean);

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
      {naFila ? (
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-semibold tabular-nums",
            v.vez === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
          title={v.vez === 1 ? "Recebe o próximo lead" : `Posição ${posicao} na fila`}
        >
          {posicao}
        </span>
      ) : null}

      <div className="min-w-0 flex-1 basis-60">
        <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-medium leading-snug">
          {v.nome}
          {v.vez === 1 ? <Pill tone="info">Próximo</Pill> : null}
          <span title={s.dica}>
            <Pill tone={s.tom} dot>
              {s.rotulo}
            </Pill>
          </span>
          {v.login === "sem_login" ? <Pill tone="warning">Sem login no painel</Pill> : null}
        </p>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
          {detalhes.join(" · ")}
        </p>
        {v.limite_diario ? (
          <div className="mt-2 h-1 w-full max-w-56 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full",
                v.hoje >= v.limite_diario ? "bg-warning" : "bg-primary",
              )}
              style={{ width: `${Math.min(100, (v.hoje / v.limite_diario) * 100)}%` }}
            />
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {naFila ? (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label={`Subir ${v.nome} na fila`}
              title="Subir na fila"
              disabled={primeiro || mover.isPending}
              onClick={() => mover.mutate({ id: v.id, direcao: -1 })}
            >
              <ArrowUp className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label={`Descer ${v.nome} na fila`}
              title="Descer na fila"
              disabled={ultimo || mover.isPending}
              onClick={() => mover.mutate({ id: v.id, direcao: 1 })}
            >
              <ArrowDown className="h-4 w-4" aria-hidden />
            </Button>
          </>
        ) : null}

        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          aria-label={`Editar WhatsApp e limite de ${v.nome}`}
          title="WhatsApp e limite por dia"
          onClick={onEditar}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </Button>

        {v.ativo ? (
          <label className="ml-2 flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
            Na fila
            <Switch
              checked={v.no_rodizio}
              disabled={atualizar.isPending}
              onCheckedChange={(novo) =>
                atualizar.mutate({ id: v.id, mudanca: { no_rodizio: novo } })
              }
              aria-label={`${v.nome} participa do rodízio`}
            />
          </label>
        ) : podeReativar(v) ? (
          <Button
            size="sm"
            variant="outline"
            className="ml-2"
            disabled={atualizar.isPending}
            onClick={() =>
              atualizar.mutate({ id: v.id, mudanca: { ativo: true, no_rodizio: true } })
            }
          >
            {atualizar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="h-4 w-4" aria-hidden />
            )}
            Reativar
          </Button>
        ) : (
          <span className="ml-2 text-xs text-muted-foreground">
            Login {v.login === "excluido" ? "excluído" : "desativado"}: reative em Equipe
          </span>
        )}
      </div>
    </li>
  );
}

function EditarVendedor({
  vendedor,
  onFechar,
}: {
  vendedor: VendedorRodizio | null;
  onFechar: () => void;
}) {
  return (
    <Dialog open={!!vendedor} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="sm:max-w-md">
        {vendedor ? <FormVendedor key={vendedor.id} v={vendedor} onFechar={onFechar} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function FormVendedor({ v, onFechar }: { v: VendedorRodizio; onFechar: () => void }) {
  const atualizar = useAtualizarVendedor();
  const [telefone, setTelefone] = useState(v.telefone ? formatTelefone(v.telefone) : "");
  const [limite, setLimite] = useState(v.limite_diario ? String(v.limite_diario) : "");
  const tel = normalizarTelefone(telefone);
  const lim = lerLimite(limite);
  const invalido = tel === "invalido" || lim === "invalido";

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (invalido) return;
    atualizar.mutate(
      { id: v.id, mudanca: { telefone: tel, limite_diario: lim } },
      { onSuccess: onFechar },
    );
  }

  return (
    <form onSubmit={salvar} className="space-y-5">
      <DialogHeader>
        <DialogTitle>{v.nome}</DialogTitle>
        <DialogDescription>
          O WhatsApp recebe o aviso de cada lead novo. Sem ele, o vendedor fica fora da fila.
        </DialogDescription>
      </DialogHeader>

      <Campo
        id="rodizio-telefone"
        label="WhatsApp (com DDD)"
        dica={
          tel === "invalido" ? (
            <span className="text-danger">Use DDD + número, com 10 ou 11 dígitos.</span>
          ) : undefined
        }
      >
        <Input
          id="rodizio-telefone"
          inputMode="tel"
          placeholder="(24) 99999-9999"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          aria-invalid={tel === "invalido"}
        />
      </Campo>

      <Campo
        id="rodizio-limite"
        label="Limite de leads por dia"
        dica={
          lim === "invalido" ? (
            <span className="text-danger">Um número inteiro de 1 a 500.</span>
          ) : (
            "Vazio = sem limite. Conta só os leads do rodízio e da distribuição; zera à meia-noite."
          )
        }
      >
        <Input
          id="rodizio-limite"
          inputMode="numeric"
          placeholder="Sem limite"
          value={limite}
          onChange={(e) => setLimite(e.target.value)}
          aria-invalid={lim === "invalido"}
        />
      </Campo>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={invalido || atualizar.isPending}>
          {atualizar.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
