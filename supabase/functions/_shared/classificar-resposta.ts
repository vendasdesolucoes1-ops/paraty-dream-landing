// Classifica a resposta de um lead que está (ou acabou de estar) numa cadência
// de follow-up e aplica a regra determinística da intenção (issue #52).
// Grava o sinal em `lead_sinais`; só confirma visita sozinho com confiança
// alta; o resto vira aviso para o vendedor. Nunca lança: é trabalho de fundo.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchComRetry } from "./http.ts";
import { notificarResponsaveis } from "./notificar.ts";
import { registrarChamadaIA } from "./telemetria.ts";
import {
  acaoDaIntencao,
  decidirIntencao,
  FORMATO_CLASSIFICACAO,
  lerClassificacao,
  promptClassificador,
  VERSAO_CLASSIFICADOR,
  type Classificacao,
} from "./intencao-followup.ts";

const MODELO = Deno.env.get("FOLLOWUP_MODELO") ?? "gpt-4o-mini";

export async function classificarRespostaFollowUp(
  supabase: SupabaseClient,
  leadId: string,
  texto: string,
): Promise<Classificacao | null> {
  try {
    if (!texto.trim()) return null;

    // Só quem está numa cadência (ou saiu dela no último dia) é classificado:
    // o custo fica restrito ao follow-up.
    const umDiaAtras = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: inscricoes } = await supabase
      .from("inscricoes")
      .select("id, visita_id, status, encerrada_em")
      .eq("lead_id", leadId)
      .or(`status.in.(ativa,pausada),encerrada_em.gte.${umDiaAtras}`);
    if (!inscricoes?.length) return null;

    const comVisita = inscricoes.find((i) => i.visita_id);
    let visitaAgendadaId: string | null = null;
    if (comVisita) {
      const { data: visita } = await supabase
        .from("visitas")
        .select("id, status, data_hora")
        .eq("id", comVisita.visita_id)
        .maybeSingle();
      if (visita && visita.status === "agendada" && new Date(visita.data_hora) > new Date()) {
        visitaAgendadaId = visita.id;
      }
    }

    let doModelo: Classificacao | null = null;
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (apiKey) {
      const inicio = Date.now();
      let erro: string | null = null;
      let usage: { prompt_tokens?: number; completion_tokens?: number } | null = null;
      try {
        const resposta = await fetchComRetry(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: MODELO,
              temperature: 0.2,
              max_tokens: 150,
              response_format: FORMATO_CLASSIFICACAO,
              messages: [
                { role: "system", content: promptClassificador(Boolean(visitaAgendadaId)) },
                { role: "user", content: texto.slice(0, 2000) },
              ],
            }),
          },
          { timeoutMs: 15_000, retries: 1 },
        );
        if (resposta.ok) {
          const dados = await resposta.json();
          usage = dados.usage ?? null;
          doModelo = lerClassificacao(dados.choices?.[0]?.message?.content ?? "");
        } else {
          erro = `HTTP ${resposta.status}`;
          await resposta.body?.cancel();
        }
      } catch (e) {
        erro = (e as Error).message;
      }
      await registrarChamadaIA(supabase, {
        funcao: "followup-classificador",
        modelo: MODELO,
        leadId,
        usage,
        latenciaMs: Date.now() - inicio,
        erro,
        versaoPrompt: VERSAO_CLASSIFICADOR,
      });
    }

    const final = decidirIntencao(texto, doModelo, Boolean(visitaAgendadaId));
    if (!final) return null;

    await supabase.from("lead_sinais").insert({
      lead_id: leadId,
      inscricao_id: (inscricoes.find((i) => i.status === "ativa") ?? inscricoes[0]).id,
      intencao: final.intencao,
      confianca: final.confianca,
      motivo: final.motivo,
      origem: final.origem,
      modelo: final.origem === "modelo" ? MODELO : null,
      versao_prompt: VERSAO_CLASSIFICADOR,
    });

    const acao = acaoDaIntencao(final);
    if (acao.confirmarVisita && visitaAgendadaId) {
      const { data: confirmada } = await supabase
        .from("visitas")
        .update({ status: "confirmada" })
        .eq("id", visitaAgendadaId)
        .eq("status", "agendada")
        .select("id")
        .maybeSingle();
      if (confirmada) {
        await supabase.from("interacoes").insert({
          lead_id: leadId,
          tipo: "sistema",
          canal: "sistema",
          conteudo:
            "Visita confirmada pelo lead em resposta ao lembrete (classificação automática).",
        });
      }
    }
    if (acao.avisar) {
      await notificarResponsaveis(supabase, leadId, acao.avisar);
      await supabase.from("interacoes").insert({
        lead_id: leadId,
        tipo: "sistema",
        canal: "sistema",
        conteudo: `${acao.avisar.titulo} (classificação automática da resposta ao follow-up).`,
      });
    }
    return final;
  } catch (e) {
    console.error("[followup] classificação falhou:", (e as Error).message);
    return null;
  }
}
