import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  CHAVE_CONFIG_OPERACAO,
  CHAVE_CONSULTOR,
  CHAVE_PAUSA_HUMANA,
  CHAVE_PENDENCIAS,
  PAUSA_HUMANA_MAX,
  PAUSA_HUMANA_MIN,
  PAUSA_HUMANA_PADRAO,
  mensagemDeErro,
  soDigitos,
  telefoneValido,
  useConfigOperacao,
} from "@/lib/agente-ia";
import type { ConsultorResponsavel } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Campo, Secao } from "@/components/ajustes/campos";
import { SkeletonRows } from "@/components/ds/query-state";

const MANUAL = "__manual";

interface VendedorAtivo {
  id: string;
  nome: string;
  telefone: string | null;
}

/**
 * Quem a Sophia apresenta ao lead ("o Fernando vai te receber"), recebe as
 * visitas e os avisos de transferência pelo WhatsApp; e por quanto tempo ela
 * se cala quando alguém da equipe responde.
 */
export function OperacaoTab() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useConfigOperacao();

  const { data: vendedores } = useQuery({
    queryKey: ["vendedores-ativos-consultor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendedores")
        .select("id, nome, telefone")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as VendedorAtivo[];
    },
  });

  const inicial = useMemo(
    () => ({
      vendedorId: config?.consultor?.vendedor_id ?? MANUAL,
      nome: config?.consultor?.nome ?? "",
      telefone: config?.consultor?.telefone ?? "",
      pausa: String(config?.pausaHoras ?? PAUSA_HUMANA_PADRAO),
    }),
    [config],
  );
  const [form, setForm] = useState(inicial);
  useEffect(() => setForm(inicial), [inicial]);
  const alterado = JSON.stringify(form) !== JSON.stringify(inicial);

  const nome = form.nome.trim();
  const telefone = form.telefone.trim();
  const pausa = Number(form.pausa);
  const erroTelefone =
    (nome || telefone) && !telefoneValido(telefone)
      ? "Informe o telefone com DDD (pelo menos 10 dígitos)."
      : null;
  const erroNome = !nome && telefone ? "Informe o nome do consultor." : null;
  const erroPausa =
    !Number.isInteger(pausa) || pausa < PAUSA_HUMANA_MIN || pausa > PAUSA_HUMANA_MAX
      ? `Use um número inteiro de ${PAUSA_HUMANA_MIN} a ${PAUSA_HUMANA_MAX} horas.`
      : null;
  const valido = !erroTelefone && !erroNome && !erroPausa;

  function escolherVendedor(id: string) {
    if (id === MANUAL) {
      setForm((f) => ({ ...f, vendedorId: MANUAL }));
      return;
    }
    const v = vendedores?.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      vendedorId: id,
      nome: v?.nome ?? f.nome,
      telefone: v?.telefone ?? "",
    }));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const consultor: ConsultorResponsavel | null = nome
        ? {
            vendedor_id: form.vendedorId === MANUAL ? null : form.vendedorId,
            nome,
            telefone: soDigitos(telefone),
          }
        : null;
      const { error } = await supabase.from("configuracoes").upsert(
        [
          { chave: CHAVE_CONSULTOR, valor: consultor ? JSON.stringify(consultor) : "" },
          { chave: CHAVE_PAUSA_HUMANA, valor: String(pausa) },
        ],
        { onConflict: "chave" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Operação da Sophia salva. Vale a partir da próxima mensagem.");
      void queryClient.invalidateQueries({ queryKey: CHAVE_CONFIG_OPERACAO });
      void queryClient.invalidateQueries({ queryKey: CHAVE_PENDENCIAS });
    },
    onError: (e) => toast.error(mensagemDeErro(e, "Erro ao salvar a operação da Sophia.")),
  });

  if (isLoading) return <SkeletonRows rows={2} />;

  const vendedorSelecionado = vendedores?.find((v) => v.id === form.vendedorId);

  return (
    <div className="max-w-2xl space-y-8">
      <Secao
        titulo="Consultor responsável"
        descricao="É a pessoa que a Sophia apresenta ao lead (“o Fernando vai te receber”). Recebe as visitas marcadas e os avisos de transferência pelo WhatsApp."
      >
        <Campo id="consultor_vendedor" label="Escolher da equipe">
          <Select value={form.vendedorId} onValueChange={escolherVendedor}>
            <SelectTrigger id="consultor_vendedor">
              <SelectValue placeholder="Escolha um vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={MANUAL}>Digitar nome e telefone</SelectItem>
              {(vendedores ?? []).map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.nome}
                  {v.telefone ? "" : " (sem telefone)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="consultor_nome" label="Nome que a Sophia usa" dica={erroNome ?? undefined}>
            <Input
              id="consultor_nome"
              placeholder="Ex.: Fernando"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              aria-invalid={Boolean(erroNome)}
            />
          </Campo>
          <Campo
            id="consultor_telefone"
            label="WhatsApp do consultor"
            dica={
              erroTelefone ??
              (vendedorSelecionado && !vendedorSelecionado.telefone
                ? "Este vendedor não tem telefone no cadastro: digite aqui."
                : "Com DDD. É para onde vão os avisos de visita e transferência.")
            }
          >
            <Input
              id="consultor_telefone"
              inputMode="tel"
              placeholder="Ex.: 12 99999-9999"
              value={form.telefone}
              onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
              aria-invalid={Boolean(erroTelefone)}
            />
          </Campo>
        </div>
        {!nome ? (
          <p className="text-xs text-warning">
            Sem consultor responsável a Sophia não pode ser ligada.
          </p>
        ) : null}
      </Secao>

      <Secao titulo="Pausa por atendimento humano">
        <Campo
          id="pausa_humana"
          label="Horas em silêncio"
          dica={
            erroPausa ??
            "Quando alguém da equipe responde (pelo CRM ou pelo celular), a Sophia fica em silêncio nessa conversa por este tempo. Depois, ela só volta se o lead escrever."
          }
        >
          <div className="flex items-center gap-2">
            <Input
              id="pausa_humana"
              type="number"
              min={PAUSA_HUMANA_MIN}
              max={PAUSA_HUMANA_MAX}
              step={1}
              className="w-28"
              value={form.pausa}
              onChange={(e) => setForm((f) => ({ ...f, pausa: e.target.value }))}
              aria-invalid={Boolean(erroPausa)}
            />
            <span className="text-sm text-muted-foreground">horas</span>
          </div>
        </Campo>
      </Secao>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!alterado || !valido || saveMutation.isPending}
        >
          {saveMutation.isPending ? "Salvando..." : "Salvar alterações"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setForm(inicial)}
          disabled={!alterado || saveMutation.isPending}
        >
          Descartar
        </Button>
        {alterado ? <span className="text-xs text-warning">Alterações não salvas</span> : null}
      </div>
    </div>
  );
}
