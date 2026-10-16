// Condições comerciais (entrada e prazo): criar, editar, escolher a vigente e
// arquivar. A vigente alimenta a landing e o Imagery (ver a migration
// 20261018000700_condicoes_comerciais.sql). A Sophia nunca cita números.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, CheckCircle2, Pencil, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pill } from "@/components/ds/pill";
import { Campo } from "@/components/ajustes/campos";
import { erroDoRascunho, type RascunhoCondicao as Rascunho } from "@/lib/condicoes-comerciais";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface CondicaoComercial {
  id: string;
  nome: string;
  entrada_percentual: number;
  parcelas_max: number;
  observacao: string | null;
  vigente: boolean;
  arquivada: boolean;
  vigente_desde: string | null;
  atualizado_em: string;
}

const VAZIO: Rascunho = { id: null, nome: "", entrada: "10", parcelas: "240", observacao: "" };
const CHAVE = ["condicoes-comerciais"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela/RPC fora dos tipos gerados
const tabela = () => (supabase.from as any)("condicoes_comerciais");

function formatarPercentual(n: number) {
  return `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

export function CondicoesComerciaisCard() {
  const queryClient = useQueryClient();
  const { profile } = useProfile();
  const podeEditar = profile?.role === "admin" || profile?.role === "gestor";
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);

  const { data: condicoes = [], isLoading } = useQuery({
    queryKey: CHAVE,
    queryFn: async () => {
      const { data, error } = await tabela()
        .select("*")
        .order("vigente", { ascending: false })
        .order("atualizado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CondicaoComercial[];
    },
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: CHAVE });

  const salvar = useMutation({
    mutationFn: async (r: Rascunho) => {
      const dados = {
        nome: r.nome.trim(),
        entrada_percentual: Number(r.entrada.replace(",", ".")),
        parcelas_max: Number(r.parcelas),
        observacao: r.observacao.trim() || null,
      };
      const { error } = r.id
        ? await tabela().update(dados).eq("id", r.id)
        : await tabela().insert(dados);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Condição salva.");
      setRascunho(null);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível salvar."),
  });

  const tornarVigente = useMutation({
    mutationFn: async (id: string | null) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC fora dos tipos gerados
      const { error } = await (supabase.rpc as any)("definir_condicao_vigente", { p_id: id });
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      toast.success(
        id
          ? "Condição vigente atualizada: landing e peças passam a usar estes números."
          : "Nenhuma condição vigente: landing e peças deixam de citar números.",
      );
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível trocar a condição."),
  });

  const arquivar = useMutation({
    mutationFn: async (c: CondicaoComercial) => {
      const { error } = await tabela().update({ arquivada: !c.arquivada }).eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message || "Não foi possível arquivar."),
  });

  const visiveis = condicoes.filter((c) => mostrarArquivadas || !c.arquivada);
  const vigente = condicoes.find((c) => c.vigente);
  const erro = rascunho ? erroDoRascunho(rascunho) : null;

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-xl text-sm text-muted-foreground">
            {vigente
              ? `Vigente: ${formatarPercentual(vigente.entrada_percentual)} de entrada e saldo em até ${vigente.parcelas_max}x. É o que a landing e as peças do Imagery mostram.`
              : "Nenhuma condição vigente: a landing e as peças não citam entrada nem prazo."}{" "}
            A Sophia nunca informa valores no WhatsApp.
          </p>
          {podeEditar ? (
            <Button size="sm" onClick={() => setRascunho(VAZIO)}>
              <Plus className="size-4" aria-hidden />
              Nova condição
            </Button>
          ) : null}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : visiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma condição cadastrada.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {visiveis.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.nome}</span>
                    {c.vigente ? <Pill tone="success">Vigente</Pill> : null}
                    {c.arquivada ? <Pill>Arquivada</Pill> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatarPercentual(c.entrada_percentual)} de entrada · saldo em até{" "}
                    {c.parcelas_max}x{c.observacao ? ` · ${c.observacao}` : ""}
                  </p>
                </div>
                {podeEditar ? (
                  <div className="flex flex-wrap gap-2">
                    {c.vigente ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => tornarVigente.mutate(null)}
                        disabled={tornarVigente.isPending}
                      >
                        Encerrar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => tornarVigente.mutate(c.id)}
                        disabled={tornarVigente.isPending || c.arquivada}
                      >
                        <CheckCircle2 className="size-4" aria-hidden />
                        Tornar vigente
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Editar ${c.nome}`}
                      onClick={() =>
                        setRascunho({
                          id: c.id,
                          nome: c.nome,
                          entrada: String(c.entrada_percentual),
                          parcelas: String(c.parcelas_max),
                          observacao: c.observacao ?? "",
                        })
                      }
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    {!c.vigente ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={c.arquivada ? `Restaurar ${c.nome}` : `Arquivar ${c.nome}`}
                        onClick={() => arquivar.mutate(c)}
                      >
                        <Archive className="size-4" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {condicoes.some((c) => c.arquivada) ? (
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setMostrarArquivadas((v) => !v)}
          >
            {mostrarArquivadas ? "Esconder arquivadas" : "Mostrar arquivadas"}
          </button>
        ) : null}
      </CardContent>

      <Dialog open={rascunho !== null} onOpenChange={(aberto) => !aberto && setRascunho(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{rascunho?.id ? "Editar condição" : "Nova condição"}</DialogTitle>
            <DialogDescription>
              {rascunho?.id && condicoes.find((c) => c.id === rascunho.id)?.vigente
                ? "Esta é a condição vigente: ao salvar, a landing e as peças mudam na hora."
                : "A condição só aparece para o público depois de “Tornar vigente”."}
            </DialogDescription>
          </DialogHeader>
          {rascunho ? (
            <div className="space-y-4">
              <Campo id="cond-nome" label="Nome interno">
                <Input
                  id="cond-nome"
                  placeholder="Ex.: Condição de lançamento"
                  value={rascunho.nome}
                  onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
                />
              </Campo>
              <div className="grid grid-cols-2 gap-4">
                <Campo id="cond-entrada" label="Entrada (%)">
                  <Input
                    id="cond-entrada"
                    inputMode="decimal"
                    value={rascunho.entrada}
                    onChange={(e) => setRascunho({ ...rascunho, entrada: e.target.value })}
                  />
                </Campo>
                <Campo id="cond-parcelas" label="Saldo em até (parcelas)">
                  <Input
                    id="cond-parcelas"
                    inputMode="numeric"
                    value={rascunho.parcelas}
                    onChange={(e) => setRascunho({ ...rascunho, parcelas: e.target.value })}
                  />
                </Campo>
              </div>
              <Campo id="cond-obs" label="Observação interna (opcional)">
                <Textarea
                  id="cond-obs"
                  rows={2}
                  value={rascunho.observacao}
                  onChange={(e) => setRascunho({ ...rascunho, observacao: e.target.value })}
                />
              </Campo>
              {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRascunho(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => rascunho && salvar.mutate(rascunho)}
              disabled={!!erro || salvar.isPending}
            >
              {salvar.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
