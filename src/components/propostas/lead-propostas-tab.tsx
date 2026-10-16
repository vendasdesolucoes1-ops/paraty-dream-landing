// Aba "Propostas" da ficha do lead: cria, versiona e muda a situação das
// propostas. Aceitar uma proposta leva o lead para "Fechado" e, para quem
// enxerga a carteira de clientes (admin/gestor), oferece registrar a compra já
// preenchida com lote, valor, entrada e parcelas da proposta.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CopyPlus, FileSignature, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Cliente, Lead } from "@/lib/types";
import {
  PROPOSTA_ABERTA,
  PROPOSTA_STATUS_LABEL,
  PROPOSTA_STATUS_OPTIONS,
  PROPOSTA_STATUS_TONE,
  formatDataCurta,
  formatMoeda,
  rotuloLote,
  type PropostaComLote,
  type PropostaStatus,
} from "@/lib/propostas";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pill } from "@/components/ds/pill";
import { SkeletonRows } from "@/components/ds/query-state";
import { atraso } from "@/components/ds/reveal";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PropostaFormDialog } from "@/components/propostas/proposta-form-dialog";
import { ClienteFormDialog } from "@/components/clientes/cliente-form-dialog";
import { CompraFormDialog } from "@/components/clientes/compra-form-dialog";

/** Chave da sequência de versões: lead + lote (sem lote também é uma sequência). */
const chaveSequencia = (p: Pick<PropostaComLote, "lote_id">) => p.lote_id ?? "-";

export function LeadPropostasTab({ lead, podeConverter }: { lead: Lead; podeConverter: boolean }) {
  const queryClient = useQueryClient();
  const [formAberto, setFormAberto] = useState(false);
  const [base, setBase] = useState<PropostaComLote | null>(null);
  const [aceitando, setAceitando] = useState<PropostaComLote | null>(null);
  const [converter, setConverter] = useState<PropostaComLote | null>(null);
  const [clienteFormAberto, setClienteFormAberto] = useState(false);
  const [compraAberta, setCompraAberta] = useState(false);
  const [clienteCriadoId, setClienteCriadoId] = useState<string | null>(null);

  const { data: propostas, isLoading } = useQuery({
    queryKey: ["propostas", "lead", lead.id],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)("propostas")
        .select("*, lote:lotes(id, numero_lote, quadra, metragem)")
        .eq("lead_id", lead.id)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PropostaComLote[];
    },
  });

  // Mesma chave e consulta de LeadClienteSection: compartilham o cache.
  const { data: cliente } = useQuery({
    queryKey: ["cliente-do-lead", lead.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .eq("lead_id", lead.id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Cliente) ?? null;
    },
    enabled: podeConverter,
  });

  // Versão mais recente de cada lead + lote: as anteriores aparecem esmaecidas.
  const ultimaVersao = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of propostas ?? []) {
      mapa.set(chaveSequencia(p), Math.max(mapa.get(chaveSequencia(p)) ?? 0, p.versao));
    }
    return mapa;
  }, [propostas]);

  const statusMutation = useMutation({
    mutationFn: async ({
      proposta,
      status,
    }: {
      proposta: PropostaComLote;
      status: PropostaStatus;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)("propostas")
        .update({ status })
        .eq("id", proposta.id);
      if (error) throw error;
      if (status === "aceita" && lead.status_crm !== "fechado") {
        const { error: erroLead } = await supabase
          .from("leads")
          .update({ status_crm: "fechado" })
          .eq("id", lead.id);
        if (erroLead) throw erroLead;
      }
    },
    onSuccess: (_d, { proposta, status }) => {
      queryClient.invalidateQueries({ queryKey: ["propostas"] });
      queryClient.invalidateQueries({ queryKey: ["dash"] });
      if (status === "aceita") {
        queryClient.invalidateQueries({ queryKey: ["leads"] });
        toast.success("Proposta aceita. O lead foi movido para Fechado.");
        if (podeConverter) setConverter(proposta);
      } else {
        toast.success(`Proposta marcada como ${PROPOSTA_STATUS_LABEL[status].toLowerCase()}.`);
      }
    },
    onError: (error: { message?: string }) =>
      toast.error(error?.message || "Não foi possível mudar a situação da proposta."),
  });

  function mudarStatus(proposta: PropostaComLote, status: PropostaStatus) {
    if (status === proposta.status) return;
    // Aceite mexe no funil: pede confirmação antes.
    if (status === "aceita") {
      setAceitando(proposta);
      return;
    }
    statusMutation.mutate({ proposta, status });
  }

  function registrarCompra() {
    if (cliente) {
      setCompraAberta(true);
    } else {
      setClienteFormAberto(true);
    }
  }

  // Memorizado: o diálogo de compra refaz o formulário quando `inicial` muda.
  const compraInicial = useMemo(
    () =>
      converter
        ? {
            lote_id: converter.lote_id,
            valor_total: converter.valor_total,
            valor_entrada: converter.entrada,
            num_parcelas: converter.parcelas,
          }
        : undefined,
    [converter],
  );
  const clienteId = cliente?.id ?? clienteCriadoId;

  const abertas = (propostas ?? []).filter(
    (p) => PROPOSTA_ABERTA.includes(p.status) && p.versao === ultimaVersao.get(chaveSequencia(p)),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-muted-foreground">
          {isLoading
            ? "Carregando propostas…"
            : `${propostas?.length ?? 0} ${propostas?.length === 1 ? "proposta" : "propostas"}` +
              (abertas.length
                ? ` · ${formatMoeda(abertas.reduce((s, p) => s + Number(p.valor_total), 0))} em aberto`
                : "")}
        </p>
        <Button
          onClick={() => {
            setBase(null);
            setFormAberto(true);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Nova proposta
        </Button>
      </div>

      {isLoading ? (
        <SkeletonRows rows={2} className="h-28" />
      ) : !propostas || propostas.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="Sem propostas"
          description="Registre valor, entrada e parcelas oferecidos para acompanhar a negociação e o forecast."
        />
      ) : (
        <div className="space-y-2.5">
          {propostas.map((p, i) => {
            const atual = p.versao === ultimaVersao.get(chaveSequencia(p));
            return (
              <div key={p.id} className="animate-swap" style={atraso(i, 50, 300)}>
                <PropostaCard
                  proposta={p}
                  atual={atual}
                  ultimaVersao={ultimaVersao.get(chaveSequencia(p)) ?? p.versao}
                  ocupado={statusMutation.isPending}
                  aoMudarStatus={(status) => mudarStatus(p, status)}
                  aoVersionar={() => {
                    setBase(p);
                    setFormAberto(true);
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      <PropostaFormDialog
        open={formAberto}
        onOpenChange={setFormAberto}
        leadId={lead.id}
        loteInteresseId={lead.lote_interesse_id}
        base={base}
      />

      <AlertDialog open={!!aceitando} onOpenChange={(o) => !o && setAceitando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar a proposta v{aceitando?.versao} como aceita?</AlertDialogTitle>
            <AlertDialogDescription>
              {aceitando
                ? `${rotuloLote(aceitando.lote)} · ${formatMoeda(aceitando.valor_total)}. `
                : ""}
              O lead {lead.nome} será movido para a etapa <strong>Fechado</strong> do funil.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (aceitando) statusMutation.mutate({ proposta: aceitando, status: "aceita" });
                setAceitando(null);
              }}
            >
              Confirmar aceite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {podeConverter ? (
        <>
          <AlertDialog open={!!converter && !clienteFormAberto && !compraAberta}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Registrar a compra agora?</AlertDialogTitle>
                <AlertDialogDescription>
                  {cliente
                    ? "O contrato abre preenchido com o lote, o valor, a entrada e as parcelas da proposta."
                    : "Primeiro criamos a ficha de cliente comprador; em seguida o contrato abre preenchido com os dados da proposta."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setConverter(null)}>Agora não</AlertDialogCancel>
                <AlertDialogAction onClick={registrarCompra}>
                  {cliente ? "Registrar compra" : "Converter em cliente"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <ClienteFormDialog
            open={clienteFormAberto}
            // Fechou sem salvar: a pergunta "Registrar a compra agora?" volta, e
            // o usuário decide por "Agora não". Salvou: o contrato abre direto.
            onOpenChange={setClienteFormAberto}
            lead={lead}
            onSaved={(criado) => {
              setClienteCriadoId(criado.id);
              setCompraAberta(true);
            }}
          />

          {clienteId ? (
            <CompraFormDialog
              open={compraAberta}
              onOpenChange={(o) => {
                setCompraAberta(o);
                if (!o) setConverter(null);
              }}
              clienteId={clienteId}
              inicial={compraInicial}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function PropostaCard({
  proposta: p,
  atual,
  ultimaVersao,
  ocupado,
  aoMudarStatus,
  aoVersionar,
}: {
  proposta: PropostaComLote;
  atual: boolean;
  ultimaVersao: number;
  ocupado: boolean;
  aoMudarStatus: (status: PropostaStatus) => void;
  aoVersionar: () => void;
}) {
  const vencida =
    PROPOSTA_ABERTA.includes(p.status) &&
    !!p.valida_ate &&
    p.valida_ate < new Date().toLocaleDateString("sv-SE");

  return (
    <Card className={atual ? undefined : "opacity-60"}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-medium text-muted-foreground">
              <span className="num text-foreground">v{p.versao}</span> · {rotuloLote(p.lote)}
            </p>
            <p className="num mt-1 text-[1.35rem] leading-none text-foreground">
              {formatMoeda(Number(p.valor_total))}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {atual ? null : <Pill>Substituída pela v{ultimaVersao}</Pill>}
            {vencida ? <Pill tone="warning">Validade vencida</Pill> : null}
            <Pill tone={PROPOSTA_STATUS_TONE[p.status]} dot>
              {PROPOSTA_STATUS_LABEL[p.status]}
            </Pill>
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-3 text-[0.8125rem]">
          {[
            ["Entrada", formatMoeda(p.entrada == null ? null : Number(p.entrada))],
            ["Parcelas", p.parcelas ? `${p.parcelas}x` : "—"],
            [
              p.status === "aceita" ? "Aceita em" : "Válida até",
              p.status === "aceita" ? formatDataCurta(p.aceite_em) : formatDataCurta(p.valida_ate),
            ],
          ].map(([rotulo, texto]) => (
            <div key={rotulo}>
              <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {rotulo}
              </dt>
              <dd className="num mt-1 text-foreground">{texto}</dd>
            </div>
          ))}
        </dl>

        {p.condicoes ? (
          <p className="whitespace-pre-line text-[0.8125rem] text-muted-foreground">
            {p.condicoes}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <Select
            value={p.status}
            onValueChange={(v: PropostaStatus) => aoMudarStatus(v)}
            disabled={ocupado}
          >
            <SelectTrigger className="h-8 w-44 text-[0.8125rem]" aria-label="Situação da proposta">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROPOSTA_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={aoVersionar}>
            <CopyPlus className="h-4 w-4" aria-hidden />
            Nova versão
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
