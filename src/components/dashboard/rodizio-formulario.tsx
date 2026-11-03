import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Profile, Vendedor } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import { Bloco } from "@/components/ds/bloco";
import { Pill } from "@/components/ds/pill";
import { LinhaAjuste } from "@/components/ajustes/campos";
import { formatTelefone } from "@/lib/format";

const CHAVE = ["rodizio-leads"];

// As funções do rodízio são novas e ainda não estão nos tipos gerados do Supabase.
type RpcSolta = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcSolta;

type Situacao = { texto: string; tom: "success" | "neutral" | "warning" | "danger" };

/** Se o vendedor consegue entrar no painel para ver os leads que recebe. */
function situacaoDoAcesso(v: Vendedor, perfis: Map<string, Profile>): Situacao {
  const p = v.profile_id ? perfis.get(v.profile_id) : undefined;
  if (!p) return { texto: "Sem login no painel", tom: "warning" };
  if (p.deletado_em) return { texto: "Login excluído", tom: "danger" };
  if (!p.ativo) return { texto: "Login desativado", tom: "neutral" };
  return { texto: "Com acesso ao painel", tom: "success" };
}

/**
 * Rodízio de leads: uma chave só para WhatsApp, Formulário Meta e cadastro
 * manual, mais a lista de quem participa. Desligado, o lead entra sem
 * vendedor e só a gestão é avisada; ao ligar, os leads em aberto dos últimos
 * 30 dias que ficaram sem vendedor são repartidos.
 */
export function RodizioFormulario() {
  const qc = useQueryClient();

  const { data: ativo, isLoading } = useQuery({
    queryKey: CHAVE,
    queryFn: async () => {
      const { data, error } = await rpc("rodizio_ativo");
      if (error) throw new Error(error.message);
      return data === true;
    },
  });

  const { data: esperando } = useQuery({
    queryKey: [...CHAVE, "esperando"],
    queryFn: async () => {
      const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { count, error } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .is("vendedor_id", null)
        .is("deletado_em", null)
        .eq("is_teste", false)
        .gte("created_at", desde)
        .not("status_crm", "in", "(fechado,perdido)");
      if (error) throw error;
      return count ?? 0;
    },
  });

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

  // Inclui excluídos: é justamente quem sumiu da Equipe que precisa aparecer aqui.
  const { data: perfis } = useQuery({
    queryKey: ["perfis-dos-vendedores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, ativo, deletado_em, role");
      if (error) throw error;
      return new Map((data as Profile[]).map((p) => [p.id, p]));
    },
  });

  const mudar = useMutation({
    mutationFn: async (novo: boolean) => {
      const { data, error } = await rpc("definir_rodizio", { p_ativo: novo });
      if (error) throw new Error(error.message);
      return { novo, distribuidos: Number(data ?? 0) };
    },
    onSuccess: ({ novo, distribuidos }) => {
      qc.invalidateQueries({ queryKey: CHAVE });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(
        novo
          ? distribuidos > 0
            ? `Rodízio ligado. ${distribuidos} leads em espera foram distribuídos.`
            : "Rodízio ligado."
          : "Rodízio desligado. Os próximos leads entram sem vendedor.",
      );
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível mudar o rodízio."),
  });

  const participa = useMutation({
    mutationFn: async ({ id, ativo: novo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("vendedores").update({ ativo: novo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendedores-todos"] });
      qc.invalidateQueries({ queryKey: ["team-profiles"] });
    },
    onError: () => toast.error("Não foi possível mudar a participação no rodízio."),
  });

  const lista = vendedores ?? [];
  const mapa = perfis ?? new Map<string, Profile>();
  const naFila = lista.filter((v) => v.ativo).length;

  return (
    <Bloco
      titulo="Rodízio de leads"
      descricao="Quem recebe os leads novos do WhatsApp, do Formulário Meta e do cadastro manual."
    >
      <div className="divide-y divide-border">
        <LinhaAjuste
          titulo="Distribuir leads no rodízio"
          descricao={
            ativo
              ? `Ligado: cada lead novo vai para o próximo da fila (${naFila} ${naFila === 1 ? "vendedor" : "vendedores"}), que é avisado no sino.`
              : `Desligado: o lead entra no CRM sem vendedor e só a gestão é avisada. Dá para entregar à mão pela ficha do lead.${
                  esperando
                    ? ` ${esperando} ${esperando === 1 ? "lead aguardando" : "leads aguardando"} — ao ligar, serão distribuídos.`
                    : ""
                }`
          }
          controle={
            <Switch
              checked={!!ativo}
              disabled={isLoading || mudar.isPending}
              onCheckedChange={(v) => mudar.mutate(v)}
              aria-label="Distribuir leads no rodízio"
            />
          }
        />

        {lista.length === 0 ? (
          <p className="py-4 text-[0.8125rem] text-muted-foreground">
            Nenhum vendedor cadastrado. Crie um usuário com o papel Vendedor em "Usuários e
            acessos".
          </p>
        ) : (
          lista.map((v) => {
            const s = situacaoDoAcesso(v, mapa);
            return (
              <LinhaAjuste
                key={v.id}
                titulo={
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {v.nome}
                    <Pill tone={s.tom}>{s.texto}</Pill>
                  </span>
                }
                descricao={
                  [v.telefone ? formatTelefone(v.telefone) : "Sem telefone", v.email]
                    .filter(Boolean)
                    .join(" · ") + (v.ativo ? " — participa do rodízio." : " — fora do rodízio.")
                }
                controle={
                  <Switch
                    checked={v.ativo}
                    disabled={participa.isPending}
                    onCheckedChange={(novo) => participa.mutate({ id: v.id, ativo: novo })}
                    aria-label={`${v.nome} participa do rodízio`}
                  />
                }
              />
            );
          })
        )}
      </div>
    </Bloco>
  );
}
