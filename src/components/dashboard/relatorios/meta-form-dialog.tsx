import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Campo, FormGaveta, Secao } from "@/components/visoes/form-gaveta";
import { supabase } from "@/lib/supabase";
import {
  INDICADORES_META,
  chaveRelatorios,
  criarMeta,
  type IndicadorMeta,
  type Periodo,
} from "@/lib/relatorios";
import type { Vendedor } from "@/lib/types";

// O Select do Radix não aceita valor vazio: a meta da equipe usa esta chave.
const EQUIPE = "equipe";

/**
 * Cadastro de meta pela gestão: de quem (um vendedor ou a equipe), qual
 * indicador, o alvo e o período. O período já vem preenchido com o filtro da
 * tela. A RLS só deixa admin/gestor gravar.
 */
export function MetaFormDialog({
  periodoInicial,
  trigger,
}: {
  periodoInicial: Periodo;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [vendedorId, setVendedorId] = useState(EQUIPE);
  const [indicador, setIndicador] = useState<IndicadorMeta>("vendas");
  const [alvo, setAlvo] = useState("");
  const [inicio, setInicio] = useState(periodoInicial.inicio);
  const [fim, setFim] = useState(periodoInicial.fim);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setInicio(periodoInicial.inicio);
      setFim(periodoInicial.fim);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const valor = Number(alvo.replace(",", "."));
      if (!Number.isFinite(valor) || valor <= 0) throw new Error("Informe um alvo maior que zero.");
      if (!inicio || !fim || fim < inicio) {
        throw new Error("A data final precisa ser igual ou posterior à inicial.");
      }
      await criarMeta({
        vendedor_id: vendedorId === EQUIPE ? null : vendedorId,
        indicador,
        alvo: valor,
        periodo_inicio: inicio,
        periodo_fim: fim,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...chaveRelatorios, "metas"] });
      toast.success("Meta cadastrada.");
      setOpen(false);
      setAlvo("");
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  const descricaoIndicador = INDICADORES_META.find((i) => i.value === indicador)?.descricao;

  return (
    <FormGaveta
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) mutation.reset();
      }}
      trigger={trigger}
      icone={Target}
      titulo="Nova meta"
      subtitulo="Acompanhada em Relatórios, contra o realizado."
      descricao="Defina o alvo de um vendedor ou da equipe para um período."
      formId="form-meta"
      onSubmit={handleSubmit}
      rotuloSalvar="Criar meta"
      rotuloSalvando="Salvando..."
      rotuloAtalho="criar"
      salvando={mutation.isPending}
      erro={
        mutation.isError
          ? mutation.error instanceof Error && mutation.error.message
            ? mutation.error.message
            : "Erro ao salvar a meta. Tente novamente."
          : null
      }
    >
      <Secao titulo="Meta">
        <Campo id="meta-vendedor" label="De quem" obrigatorio>
          <Select value={vendedorId} onValueChange={setVendedorId}>
            <SelectTrigger id="meta-vendedor">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EQUIPE}>Equipe inteira</SelectItem>
              {(vendedores ?? []).map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="meta-indicador" label="Indicador" obrigatorio dica={descricaoIndicador}>
            <Select value={indicador} onValueChange={(v) => setIndicador(v as IndicadorMeta)}>
              <SelectTrigger id="meta-indicador">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INDICADORES_META.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo id="meta-alvo" label="Alvo" obrigatorio>
            <Input
              id="meta-alvo"
              type="number"
              inputMode="numeric"
              min={1}
              step="1"
              required
              placeholder="Ex.: 10"
              value={alvo}
              onChange={(e) => setAlvo(e.target.value)}
            />
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Período">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="meta-inicio" label="De" obrigatorio>
            <Input
              id="meta-inicio"
              type="date"
              required
              value={inicio}
              max={fim}
              onChange={(e) => setInicio(e.target.value)}
            />
          </Campo>
          <Campo id="meta-fim" label="Até" obrigatorio>
            <Input
              id="meta-fim"
              type="date"
              required
              value={fim}
              min={inicio}
              onChange={(e) => setFim(e.target.value)}
            />
          </Campo>
        </div>
      </Secao>
    </FormGaveta>
  );
}
