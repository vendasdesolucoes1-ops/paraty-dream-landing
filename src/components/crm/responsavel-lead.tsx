import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Vendedor } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SEM = "sem-vendedor";

// atribuir_vendedor é nova e ainda não está nos tipos gerados do Supabase.
type RpcSolta = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcSolta;

/**
 * Entrega manual do lead a um vendedor, direto do cabeçalho da ficha. Só para
 * a gestão: registra no histórico e avisa o vendedor no sino.
 */
export function ResponsavelLead({
  leadId,
  vendedorId,
}: {
  leadId: string;
  vendedorId: string | null;
}) {
  const queryClient = useQueryClient();
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

  const entregar = useMutation({
    mutationFn: async (novo: string | null) => {
      const { error } = await rpc("atribuir_vendedor", {
        p_lead_id: leadId,
        p_vendedor_id: novo,
      });
      if (error) throw new Error(error.message);
      return novo;
    },
    onSuccess: (novo) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      const nome = vendedores?.find((v) => v.id === novo)?.nome;
      toast.success(nome ? `Lead entregue a ${nome}.` : "Lead ficou sem vendedor.");
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível entregar o lead."),
  });

  // Quem saiu do rodízio continua na lista só se já for o responsável atual.
  const opcoes = (vendedores ?? []).filter((v) => v.ativo || v.id === vendedorId);

  return (
    <div className="flex items-center gap-2">
      <UserCheck className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <Select
        value={vendedorId ?? SEM}
        onValueChange={(v) => entregar.mutate(v === SEM ? null : v)}
        disabled={entregar.isPending}
      >
        <SelectTrigger className="h-8 w-[15rem] text-[0.8125rem]" aria-label="Vendedor responsável">
          <SelectValue placeholder="Entregar a um vendedor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SEM}>Sem vendedor</SelectItem>
          {opcoes.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.nome}
              {v.ativo ? "" : " (fora do rodízio)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
