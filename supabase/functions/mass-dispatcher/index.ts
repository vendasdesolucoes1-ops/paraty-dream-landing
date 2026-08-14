// Supabase Edge Function — envia UMA mensagem de WhatsApp pela Evolution API.
// Chamada uma vez por contato pelo laço do frontend, que controla o intervalo
// entre envios (no cliente) para poder mostrar progresso/pausa/parada ao vivo e
// para lista grande nunca esbarrar no timeout da edge function.
//
// Aceita texto, mídia (imagem/vídeo/documento) ou os dois. Com os dois, saem
// como DUAS mensagens: primeiro o texto, depois a mídia. É de propósito —
// legenda em documento é ignorada pelo WhatsApp, e mesmo em imagem a legenda
// longa fica truncada na conversa. Duas mensagens é o que uma pessoa faria.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { assertConnected, getEvolutionSession } from "../_shared/evolution-instance.ts";
import {
  sendWhatsAppAudio,
  sendWhatsAppMedia,
  sendWhatsAppText,
  type EvolutionMediaType,
} from "../_shared/evolution-send.ts";
import { telefoneBloqueado } from "../_shared/contato-bloqueado.ts";


const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => vars[key] ?? "");
}

interface DispatchBody {
  instance_name: string;
  phone: string;
  nome?: string;
  message: string;
  /** URL pública (assinada) do anexo. Ausente = só texto. */
  midia_url?: string;
  /** 'audio' usa a rota de PTT; o resto vai por sendMedia. */
  midia_tipo?: EvolutionMediaType | "audio";
  midia_nome?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instance_name, phone, nome, message, midia_url, midia_tipo, midia_nome }: DispatchBody =
      await req.json();

    // Antes de qualquer coisa, inclusive de tocar na instância: quem pediu para
    // não ser mais procurado não recebe disparo. A checagem é aqui no servidor
    // e não só na interface porque a lista de contatos é montada no navegador e
    // enviada contato a contato — uma campanha aberta antes do bloqueio, ou uma
    // aba deixada aberta, continuaria disparando com a lista velha.
    //
    // 200 é o código certo, não erro: para o laço do frontend este contato foi
    // resolvido e a campanha segue para o próximo. Um 500 aqui faria a interface
    // mostrar falha de envio, que é diferente de "não devia enviar".
    if (await telefoneBloqueado(supabase, phone)) {
      console.log("[mass-dispatcher] contato bloqueado, envio pulado");
      return new Response(JSON.stringify({ ok: true, pulado: "contato_bloqueado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: instance, error } = await supabase
      .from("whatsapp_instances")
      .select("*")
      .eq("instance_name", instance_name)
      .single();
    if (error || !instance) throw new Error("instance not found");
    // Nunca dispara por uma instância desconectada: a Evolution aceitaria a
    // chamada e a mensagem sumiria, ou sairia pelo aparelho errado.
    assertConnected(await getEvolutionSession(instance));

    const text = renderTemplate(message, { nome: nome ?? "", telefone: phone });

    // Texto primeiro, quando houver: quem recebe vê o contexto antes do anexo.
    if (text.trim()) {
      await sendWhatsAppText(instance.api_url, instance.api_key, instance_name, phone, text);
    }

    if (midia_url) {
      if (midia_tipo === "audio") {
        await sendWhatsAppAudio(instance.api_url, instance.api_key, instance_name, phone, midia_url);
      } else {
        await sendWhatsAppMedia(instance.api_url, instance.api_key, instance_name, phone, {
          url: midia_url,
          tipo: midia_tipo ?? "image",
          nomeArquivo: midia_nome,
        });
      }
    }

    if (!text.trim() && !midia_url) {
      throw new Error("nada a enviar: mensagem e mídia vazias");
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
