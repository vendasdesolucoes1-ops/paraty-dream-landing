// Processador da fila `mensagens_agendadas`.
//
// Acionado por pg_cron a cada minuto, via net.http_post (ver a migration
// 20260809000000_fila_mensagens_agendadas.sql). O cron não sabe nada de
// WhatsApp: ele só cutuca esta função, e toda a lógica de envio segue em
// TypeScript, reaproveitando sendWhatsAppText.
//
// Por que uma fila em vez de esperar dentro da própria function: esperar com
// setTimeout dentro de EdgeRuntime.waitUntil amarra a entrega ao ciclo de vida
// de um isolate efêmero, e quando ele é recolhido a mensagem some sem erro
// nenhum no log. Aqui cada tentativa deixa estado consultável.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendWhatsAppText } from "../_shared/evolution-send.ts";
import { confirmarEnvio, descartarEnvio, registrarEnvio } from "../_shared/envio-registrado.ts";
import { podeAbordar } from "../_shared/primeiro-contato.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 20 × 4 partes × 1,5s ≈ 2 min, com folga sobre o wall clock. Como o cron roda
// de minuto em minuto, o que sobrar sai na execução seguinte.
const LOTE = 20;

/** Pausa entre as partes, como alguém digitando em blocos. */
const PAUSA_ENTRE_PARTES_MS = 1500;

/** Backoff entre tentativas de uma mensagem que falhou no envio. */
const RETENTATIVA_MS = 2 * 60 * 1000;

/** Instância caída não é falha da mensagem: espera mais um pouco e tenta de novo. */
const SEM_INSTANCIA_MS = 5 * 60 * 1000;

const MAX_TENTATIVAS = 3;

interface MensagemAgendada {
  id: string;
  lead_id: string;
  tipo: string;
  telefone: string;
  partes: string[];
  tentativas: number;
}

interface Instancia {
  id: string;
  api_url: string;
  api_key: string;
  instance_name: string;
}

/** Devolve a mensagem para 'pendente' no futuro, ou desiste depois de N falhas. */
async function marcarFalha(m: MensagemAgendada, motivo: string, adiarMs: number) {
  const tentativas = m.tentativas + 1;
  const desistir = tentativas >= MAX_TENTATIVAS;

  await supabase
    .from("mensagens_agendadas")
    .update({
      status: desistir ? "erro" : "pendente",
      tentativas,
      erro: motivo.slice(0, 2000),
      agendado_para: new Date(Date.now() + adiarMs).toISOString(),
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", m.id);
}

/** Envia as partes e registra tudo no histórico do CRM. */
async function enviar(m: MensagemAgendada, instancia: Instancia) {
  const { data: contato } = await supabase
    .from("whatsapp_contacts")
    .select("id")
    .eq("phone", m.telefone)
    .maybeSingle();

  const partes = Array.isArray(m.partes) ? m.partes : [];

  for (const [i, texto] of partes.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, PAUSA_ENTRE_PARTES_MS));

    // Gravado ANTES do envio, para o eco da Evolution encontrar a linha. Aqui
    // isso pesa mais que em qualquer outro lugar: são 4 partes em sequência,
    // ou seja, 4 ecos concorrendo com 4 inserts.
    const rowId = await registrarEnvio(supabase, {
      instance_id: instancia.id,
      contact_id: contato?.id ?? null,
      lead_id: m.lead_id,
      remote_jid: `${m.telefone}@s.whatsapp.net`,
      content: texto,
    });

    try {
      const enviado = await sendWhatsAppText(
        instancia.api_url,
        instancia.api_key,
        instancia.instance_name,
        m.telefone,
        texto,
      );
      await confirmarEnvio(supabase, rowId, enviado?.key?.id);
    } catch (error) {
      await descartarEnvio(supabase, rowId);
      throw error;
    }
  }

  await supabase.from("interacoes").insert({
    lead_id: m.lead_id,
    tipo: "sistema",
    canal: "sistema",
    conteudo:
      "Sophia iniciou a conversa por WhatsApp após o preenchimento do formulário do site.",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Reivindicação atômica (FOR UPDATE SKIP LOCKED no banco): duas execuções
    // sobrepostas do cron nunca pegam a mesma linha. Esta RPC também expira o
    // que está na fila há mais de 24h e recupera órfãs presas em 'enviando'.
    const { data, error } = await supabase.rpc("reivindicar_mensagens_agendadas", {
      p_limite: LOTE,
    });
    if (error) throw error;

    const mensagens = (data ?? []) as MensagemAgendada[];
    if (mensagens.length === 0) {
      return new Response(JSON.stringify({ ok: true, processadas: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Uma busca por lote, não por mensagem.
    const { data: instancia } = await supabase
      .from("whatsapp_instances")
      .select("id, api_url, api_key, instance_name")
      .in("status", ["connected", "open"])
      .limit(1)
      .maybeSingle();

    // Sem instância nada é consumido: as linhas voltam para pendente. A
    // tentativa não conta, porque a mensagem não tem culpa de a instância
    // estar fora do ar — quem limita esse caso é o teto de 24h.
    if (!instancia) {
      console.warn("[fila] nenhuma instância conectada", { adiadas: mensagens.length });
      const adiado = new Date(Date.now() + SEM_INSTANCIA_MS).toISOString();
      await supabase
        .from("mensagens_agendadas")
        .update({
          status: "pendente",
          agendado_para: adiado,
          erro: "nenhuma instância conectada",
          atualizado_em: new Date().toISOString(),
        })
        .in("id", mensagens.map((m) => m.id));

      return new Response(JSON.stringify({ ok: true, processadas: 0, sem_instancia: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let enviadas = 0;
    let canceladas = 0;
    let falhas = 0;

    for (const m of mensagens) {
      try {
        // Entre o enfileiramento e agora o lead pode ter escrito primeiro — e
        // aí a conversa já está acontecendo. Abordar agora atropelaria.
        if (!(await podeAbordar(supabase, m.lead_id))) {
          await supabase
            .from("mensagens_agendadas")
            .update({
              status: "cancelado",
              erro: "conversa já ativa com o lead",
              atualizado_em: new Date().toISOString(),
            })
            .eq("id", m.id);
          canceladas++;
          continue;
        }

        await enviar(m, instancia as Instancia);

        await supabase
          .from("mensagens_agendadas")
          .update({
            status: "enviado",
            enviado_em: new Date().toISOString(),
            erro: null,
            atualizado_em: new Date().toISOString(),
          })
          .eq("id", m.id);
        enviadas++;
      } catch (e) {
        // Falha de uma mensagem não derruba o lote.
        const motivo = (e as Error)?.message ?? String(e);
        console.error("[fila] envio falhou", { id: m.id, leadId: m.lead_id, motivo });
        await marcarFalha(m, motivo, RETENTATIVA_MS);
        falhas++;
      }
    }

    console.log("[fila] lote processado", { enviadas, canceladas, falhas });

    return new Response(
      JSON.stringify({ ok: true, processadas: mensagens.length, enviadas, canceladas, falhas }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[fila] erro:", error);
    return new Response(JSON.stringify({ error: (error as Error)?.message ?? String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
