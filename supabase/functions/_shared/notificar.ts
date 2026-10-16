// Avisar as pessoas responsáveis por um lead.
//
// Usado quando a IA sai de cena (pedido de humano, falha do modelo): o lead
// espera uma pessoa, e antes ninguém era avisado — a Sophia dizia "já estou
// chamando alguém" e a conversa ficava parada.
//
// Dois canais: notificação no painel (dono do lead + admin/gestor) e WhatsApp
// para o vendedor dono, quando houver instância e telefone.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWhatsAppText } from "./evolution-send.ts";
import { enviarTextoRegistrado, type InstanciaEnvio } from "./envio-registrado.ts";

interface Aviso {
  tipo: string;
  titulo: string;
  corpo: string;
}

export async function notificarResponsaveis(
  supabase: SupabaseClient,
  leadId: string,
  aviso: Aviso,
  instancia?: InstanciaEnvio | null,
): Promise<void> {
  try {
    const { data: lead } = await supabase
      .from("leads")
      .select("id, nome, vendedor_id, is_teste")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead) return;

    const { data: vendedor } = lead.vendedor_id
      ? await supabase
          .from("vendedores")
          .select("nome, telefone, profile_id")
          .eq("id", lead.vendedor_id)
          .maybeSingle()
      : { data: null };

    const { data: gestao } = await supabase
      .from("profiles")
      .select("id")
      .in("role", ["admin", "gestor"])
      .eq("ativo", true)
      .is("deletado_em", null);

    const destinatarios = new Set<string>((gestao ?? []).map((p) => p.id as string));
    if (vendedor?.profile_id) destinatarios.add(vendedor.profile_id as string);

    const link = `/dashboard/crm?lead=${leadId}`;
    if (destinatarios.size) {
      await supabase.from("notifications").insert(
        [...destinatarios].map((userId) => ({
          user_id: userId,
          type: aviso.tipo,
          title: aviso.titulo,
          body: aviso.corpo,
          link,
        })),
      );
    }

    // Lead de teste não acorda o vendedor de verdade.
    if (instancia && vendedor?.telefone && !lead.is_teste) {
      const texto = `${aviso.titulo}: ${lead.nome ?? "lead sem nome"}. ${aviso.corpo}`;
      await enviarTextoRegistrado(
        supabase,
        (i, tel, txt) => sendWhatsAppText(i.api_url, i.api_key, i.instance_name, tel, txt),
        instancia,
        vendedor.telefone as string,
        texto,
      ).catch((e) =>
        console.error("[notificar] WhatsApp ao vendedor falhou:", (e as Error).message),
      );
    }
  } catch (e) {
    // Avisar é importante, mas não pode derrubar a resposta ao lead.
    console.error("[notificar] falhou:", (e as Error)?.message);
  }
}
