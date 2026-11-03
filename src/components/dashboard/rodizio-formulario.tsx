import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Switch } from "@/components/ui/switch";
import { Bloco } from "@/components/ds/bloco";
import { LinhaAjuste } from "@/components/ajustes/campos";

const CHAVE = ["rodizio-formulario"];

// As duas funções são novas e ainda não estão nos tipos gerados do Supabase.
type RpcSolta = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: Error | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcSolta;

/**
 * Chave do rodízio para os leads do Formulário Meta (Lead Ads). Desligada, o
 * lead entra no CRM sem vendedor e só a gestão é avisada. Ao ligar, os leads
 * que ficaram esperando são repartidos entre quem participa do rodízio.
 */
export function RodizioFormulario() {
  const qc = useQueryClient();
  const { data: ativo, isLoading } = useQuery({
    queryKey: CHAVE,
    queryFn: async () => {
      const { data, error } = await rpc("rodizio_formulario_ativo");
      if (error) throw error;
      return data === true;
    },
  });
  const { data: esperando } = useQuery({
    queryKey: [...CHAVE, "esperando"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("origem", "formulario_meta")
        .is("vendedor_id", null)
        .is("deletado_em", null)
        .not("status_crm", "in", "(fechado,perdido)");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const mudar = useMutation({
    mutationFn: async (novo: boolean) => {
      const { data, error } = await rpc("definir_rodizio_formulario", { p_ativo: novo });
      if (error) throw error;
      return { novo, distribuidos: Number(data ?? 0) };
    },
    onSuccess: ({ novo, distribuidos }) => {
      qc.invalidateQueries({ queryKey: CHAVE });
      toast.success(
        novo
          ? distribuidos > 0
            ? `Rodízio ligado. ${distribuidos} leads em espera foram distribuídos.`
            : "Rodízio ligado."
          : "Rodízio desligado. Os próximos leads do formulário ficam sem vendedor.",
      );
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível mudar o rodízio."),
  });

  return (
    <Bloco
      titulo="Leads do Formulário Meta"
      descricao="Como os cadastros feitos nos formulários dos anúncios chegam à equipe."
    >
      <LinhaAjuste
        titulo="Distribuir no rodízio"
        descricao={
          ativo
            ? "Cada novo cadastro vai para o próximo vendedor do rodízio, que é avisado no sino."
            : `Desligado: o cadastro entra no CRM sem vendedor e só a gestão é avisada.${
                esperando ? ` ${esperando} aguardando — ao ligar, serão distribuídos.` : ""
              }`
        }
        controle={
          <Switch
            checked={!!ativo}
            disabled={isLoading || mudar.isPending}
            onCheckedChange={(v) => mudar.mutate(v)}
            aria-label="Distribuir leads do formulário no rodízio"
          />
        }
      />
    </Bloco>
  );
}
