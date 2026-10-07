// Seleção manual de leads para o disparador, com histórico de contato.
//
// O que esta lista resolve: antes, disparar para o CRM era escolher um status e
// aceitar quem viesse. Não dava para tirar um contato específico da lista nem
// para saber quem já tinha sido alvo de um disparo anterior — e reabordar a
// mesma pessoa duas vezes na mesma semana é o caminho mais curto para virar
// denúncia, que é o que bane o número.
//
// O "já recebeu" daqui NÃO é o status do funil (`status_crm`). São duas coisas
// diferentes: um lead "qualificado" pode nunca ter entrado num disparo, e um
// lead "novo" pode já ter recebido três. Por isso as duas informações aparecem
// lado a lado, em badges de estilos distintos.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { chaveTelefone, cn } from "@/lib/utils";
import type { DisparoCampanha, Lead } from "@/lib/types";
import { Pill } from "@/components/ds/pill";
import { Campo } from "@/components/ajustes/campos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Um envio já concluído, reduzido ao que a lista precisa saber. */
interface EnvioAnterior {
  lead_id: string | null;
  telefone: string;
  enviado_em: string | null;
  campanha_id: string;
}

export interface LeadSelecionavel {
  nome: string;
  telefone: string;
  leadId: string;
}

/**
 * Teto de linhas lidas de disparos_itens. Uma imobiliária com anos de disparo
 * pode ter dezenas de milhares; carregar tudo no navegador para montar um badge
 * não se paga. As mais recentes são as que importam para "já recebeu".
 */
const LIMITE_ENVIOS = 5000;

function formatarData(valor: string | null): string {
  if (!valor) return "";
  return new Date(valor).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function LeadSelectionList({
  selectedIds,
  onChange,
  disabled,
}: {
  selectedIds: Set<string>;
  onChange: (ids: Set<string>) => void;
  disabled?: boolean;
}) {
  const [busca, setBusca] = useState("");
  // Campanha de referência: quando escolhida, o "já recebeu" passa a significar
  // "já recebeu ESTA campanha" — é o modo para completar um disparo que caiu no
  // meio, sem remandar para quem já tinha recebido.
  const [campanhaRef, setCampanhaRef] = useState<string>("todas");

  const { data: leads, isLoading: carregandoLeads } = useQuery({
    queryKey: ["disparador-leads-selecao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, telefone, status_crm")
        .is("deletado_em", null)
        .not("telefone", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Pick<Lead, "id" | "nome" | "telefone" | "status_crm">[];
    },
  });

  const { data: campanhas } = useQuery({
    queryKey: ["disparos-campanhas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disparos_campanha")
        .select("*")
        .order("iniciado_em", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as DisparoCampanha[];
    },
  });

  const { data: envios, isLoading: carregandoEnvios } = useQuery({
    queryKey: ["disparos-envios-concluidos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disparos_itens")
        .select("lead_id, telefone, enviado_em, campanha_id")
        .eq("status", "enviado")
        .order("enviado_em", { ascending: false })
        .limit(LIMITE_ENVIOS);
      if (error) throw error;
      return data as unknown as EnvioAnterior[];
    },
  });

  // Índice de "quem já recebeu", por lead_id e por sufixo de telefone. Os dois
  // porque lead_id é NULL em item vindo de CSV/manual: sem a chave de telefone,
  // um lead do CRM contatado por outra fonte apareceria como nunca contatado.
  const jaRecebeu = useMemo(() => {
    const porLead = new Map<string, string | null>();
    const porTelefone = new Map<string, string | null>();

    for (const envio of envios ?? []) {
      if (campanhaRef !== "todas" && envio.campanha_id !== campanhaRef) continue;
      // A consulta já vem ordenada do mais recente para o mais antigo, então a
      // primeira ocorrência de cada chave é a data que interessa.
      if (envio.lead_id && !porLead.has(envio.lead_id)) {
        porLead.set(envio.lead_id, envio.enviado_em);
      }
      const chave = chaveTelefone(envio.telefone);
      if (chave && !porTelefone.has(chave)) porTelefone.set(chave, envio.enviado_em);
    }
    return { porLead, porTelefone };
  }, [envios, campanhaRef]);

  function ultimoEnvio(lead: { id: string; telefone: string | null }): string | null | undefined {
    if (jaRecebeu.porLead.has(lead.id)) return jaRecebeu.porLead.get(lead.id);
    const chave = chaveTelefone(lead.telefone);
    if (chave && jaRecebeu.porTelefone.has(chave)) return jaRecebeu.porTelefone.get(chave);
    return undefined;
  }

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = leads ?? [];
    if (!termo) return lista;
    return lista.filter(
      (l) =>
        (l.nome ?? "").toLowerCase().includes(termo) ||
        (l.telefone ?? "").replace(/\D/g, "").includes(termo.replace(/\D/g, "")),
    );
  }, [leads, busca]);

  const pendentes = useMemo(
    () => filtrados.filter((l) => ultimoEnvio(l) === undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtrados, jaRecebeu],
  );

  function alternar(id: string) {
    const proximo = new Set(selectedIds);
    if (proximo.has(id)) proximo.delete(id);
    else proximo.add(id);
    onChange(proximo);
  }

  const carregando = carregandoLeads || carregandoEnvios;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="busca-lead" label="Buscar lead">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="busca-lead"
              className="pl-9"
              placeholder="Nome ou telefone"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              disabled={disabled}
            />
          </div>
        </Campo>

        <Campo label="Comparar com">
          <Select value={campanhaRef} onValueChange={setCampanhaRef} disabled={disabled}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Qualquer disparo anterior</SelectItem>
              {(campanhas ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {formatarData(c.iniciado_em)} · {c.mensagem_template.slice(0, 40)}
                  {c.mensagem_template.length > 40 ? "…" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || pendentes.length === 0}
          onClick={() => onChange(new Set(pendentes.map((l) => l.id)))}
        >
          Selecionar só os pendentes ({pendentes.length})
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || filtrados.length === 0}
          onClick={() => onChange(new Set(filtrados.map((l) => l.id)))}
        >
          Selecionar todos ({filtrados.length})
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || selectedIds.size === 0}
          onClick={() => onChange(new Set())}
        >
          Limpar seleção
        </Button>
      </div>

      {carregando ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum lead encontrado.</p>
      ) : (
        <div className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
          {filtrados.map((lead) => {
            const enviadoEm = ultimoEnvio(lead);
            const contatado = enviadoEm !== undefined;
            const marcado = selectedIds.has(lead.id);
            return (
              <label
                key={lead.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-3.5 py-3 transition-colors",
                  marcado ? "bg-accent/10" : "hover:bg-muted/50",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <Checkbox
                  checked={marcado}
                  onCheckedChange={() => alternar(lead.id)}
                  disabled={disabled}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{lead.nome || "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground">{lead.telefone}</p>
                </div>
                <Pill className="hidden sm:inline-flex">{lead.status_crm}</Pill>
                <Pill tone={contatado ? "warning" : "success"}>
                  {contatado
                    ? enviadoEm
                      ? `já recebeu · ${formatarData(enviadoEm)}`
                      : "já recebeu"
                    : "pendente"}
                </Pill>
              </label>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"} selecionado
        {selectedIds.size === 1 ? "" : "s"}. &ldquo;Já recebeu&rdquo; é sobre disparos em massa —
        não tem relação com o status do funil ao lado.
      </p>
    </div>
  );
}
