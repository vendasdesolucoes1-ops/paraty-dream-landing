// Rodapé do drawer do lead: converte o lead em cliente comprador, ou abre a
// ficha se a conversão já aconteceu. Fica fora das abas de propósito — o botão
// vale em qualquer momento do funil, não só no status "Fechado".
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Cliente, Lead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ClienteFormDialog } from "@/components/clientes/cliente-form-dialog";
import { ClienteFichaSheet } from "@/components/clientes/cliente-ficha-sheet";

export function LeadClienteSection({ lead }: { lead: Lead }) {
  const [formOpen, setFormOpen] = useState(false);
  const [fichaOpen, setFichaOpen] = useState(false);
  // A ficha abre no mesmo instante da criação; a query ainda está refazendo o
  // fetch, então guardamos a linha recém-criada para o sheet não abrir vazio.
  const [recemCriado, setRecemCriado] = useState<Cliente | null>(null);

  const { data: cliente, isLoading } = useQuery({
    queryKey: ["cliente-do-lead", lead.id],
    queryFn: async () => {
      // maybeSingle: o normal é não existir cliente ainda, e isso não é erro.
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .eq("lead_id", lead.id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Cliente) ?? null;
    },
  });

  return (
    <>
      <div className="mt-8 border-t pt-4">
        {isLoading ? null : cliente ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Este lead já é cliente comprador.</p>
            <Button variant="outline" size="sm" onClick={() => setFichaOpen(true)}>
              <UserCheck className="h-4 w-4 mr-2" />
              Abrir ficha do cliente
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Fechou negócio? Crie a ficha de comprador com contrato e documentos.
            </p>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <UserCheck className="h-4 w-4 mr-2" />
              Converter em Cliente
            </Button>
          </div>
        )}
      </div>

      <ClienteFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        lead={lead}
        onSaved={(criado) => {
          setRecemCriado(criado);
          setFichaOpen(true);
        }}
      />

      <ClienteFichaSheet
        cliente={cliente ?? recemCriado}
        open={fichaOpen}
        onOpenChange={setFichaOpen}
      />
    </>
  );
}
