// Criação da visita quando o agente emite [VISITA_AGENDADA].
//
// Mesmo desenho de _shared/lead-qualification.ts: vive fora da edge function
// para poder ser chamado tanto pelo painel de teste quanto, mais adiante, pela
// whatsapp-webhook.
//
// Vale para leads reais desde que a qualidade da extração de data foi
// validada nos testes. Quem dispara para lead real é a whatsapp-webhook (ao
// ver `visita_agendada` na resposta da ai-agent-chat); a ai-agent-chat só
// dispara direto para lead com is_teste = true. As duas pontas juntas
// criariam a visita duas vezes para todo lead real.
//
// Consequência prática: a partir daqui a Sophia escreve no calendário de quem
// vende. Quando a data não pôde ser identificada com confiança, a visita entra
// com horário provisório e observação em CAIXA ALTA pedindo confirmação — some
// da agenda é pior do que aparecer marcada para conferir.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { diaSemanaEmSaoPaulo, hojeEmSaoPaulo, normalizarDiaSemana } from "./data-br.ts";
import { fetchComRetry } from "./http.ts";
import type { InstanciaEnvio } from "./envio-registrado.ts";
import {
  CHAVE_JANELAS_VISITA,
  STATUS_A_CONFIRMAR,
  avaliarHorarioVisita,
  descreverJanelas,
  lerJanelasVisita,
  type MotivoAConfirmar,
} from "./janela-visita.ts";
import { notificarResponsaveis } from "./notificar.ts";
import { registrarChamadaIA } from "./telemetria.ts";
import { MODELOS } from "./modelos.ts";

const EXTRACTION_MODEL = MODELOS.extracaoVisita.id;

// Janela de sanidade. Uma data fora disso é quase sempre erro de interpretação
// ("ano que vem", data no passado, alucinação) — nesses casos é melhor uma
// visita marcada como a confirmar do que um compromisso errado na agenda.
const JANELA_MIN_DIAS = 0;
const JANELA_MAX_DIAS = 60;

const FUSO = "America/Sao_Paulo";

/** Extração + o dia da semana que o lead disse, para poder conferir um contra o outro. */
interface DataExtraida {
  quando: Date;
  /** "sábado", se o lead mencionou um dia da semana. null se falou só a data. */
  diaSemanaMencionado: string | null;
}

/** O que aconteceu com a visita — o chamador decide o que dizer ao lead. */
export interface ResultadoVisita {
  /** true = horário fora da janela ou em conflito: NÃO dizer ao lead que está confirmada. */
  aConfirmar: boolean;
  motivo: MotivoAConfirmar | null;
}

export interface LeadVisita {
  id: string;
  nome?: string | null;
  vendedor_id?: string | null;
  is_teste?: boolean | null;
}

/**
 * Próximo dia útil às 9h — usado quando não dá para confiar na data extraída.
 * A visita entra como "a confirmar" em vez de sumir.
 */
function proximoDiaUtil(agora: Date): Date {
  const d = new Date(agora.getTime());
  d.setUTCDate(d.getUTCDate() + 1);
  // 0 = domingo, 6 = sábado
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  // 9h em São Paulo (UTC-3) = 12h UTC. Suficiente para um horário provisório.
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

/**
 * Extrai data e hora combinadas na conversa. NUNCA lança: se falhar, devolve
 * null e o chamador cai no horário provisório.
 */
async function extrairDataVisita(
  supabase: SupabaseClient,
  leadId: string,
  openaiKey: string,
  agora: Date,
): Promise<DataExtraida | null> {
  try {
    if (!openaiKey) return null;

    const { data: mensagens } = await supabase
      .from("whatsapp_messages")
      .select("from_me, content")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(30);

    const transcricao = (mensagens ?? [])
      .reverse()
      .map(
        (m: Record<string, unknown>) =>
          `${m.from_me ? "Vendedor" : "Lead"}: ${String(m.content ?? "")}`,
      )
      .join("\n")
      .slice(0, 6000);

    if (!transcricao.trim()) return null;

    const { data: hoje, diaSemana } = hojeEmSaoPaulo(agora);

    const inicioIA = Date.now();
    const response = await fetchComRetry(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: EXTRACTION_MODEL,
          temperature: MODELOS.extracaoVisita.temperatura,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                `Hoje é ${hoje} (${diaSemana}), no fuso de São Paulo (UTC-3). ` +
                "Leia a conversa e extraia a data e hora combinadas para a visita ao terreno. " +
                'Responda APENAS com JSON: {"data_hora": "YYYY-MM-DDTHH:mm:ss-03:00", "dia_semana_mencionado": "sábado"} ' +
                "onde data_hora usa a data absoluta " +
                'correspondente ao que foi combinado ("sábado", "semana que vem", "dia 12"), sempre no futuro em relação a hoje. ' +
                "Se só houver o dia sem horário, use 10:00. " +
                'Em "dia_semana_mencionado" copie o dia da semana que o LEAD escreveu ("sábado", "terça"), ou null se ele ' +
                "só citou a data. NÃO deduza o dia da semana a partir da data — só preencha se a palavra apareceu na conversa. " +
                'Se nada tiver sido combinado de fato, ou se houver dúvida, responda {"data_hora": null}. ' +
                "Nunca invente uma data que o lead não aceitou.",
            },
            { role: "user", content: transcricao },
          ],
        }),
      },
      { timeoutMs: 20_000, retries: 1 },
    );

    if (!response.ok) {
      console.error("=== EXTRACAO DE DATA FALHOU ===", response.status);
      return null;
    }

    const resultado = await response.json();
    await registrarChamadaIA(supabase, {
      funcao: "extracao_visita",
      modelo: EXTRACTION_MODEL,
      leadId,
      usage: resultado.usage,
      latenciaMs: Date.now() - inicioIA,
    });
    const conteudo = resultado?.choices?.[0]?.message?.content;
    if (!conteudo) return null;

    const bruto = JSON.parse(conteudo)?.data_hora;
    if (!bruto || typeof bruto !== "string") return null;

    const quando = new Date(bruto);
    if (isNaN(quando.getTime())) return null;

    const mencionado = JSON.parse(conteudo)?.dia_semana_mencionado;
    return {
      quando,
      diaSemanaMencionado: typeof mencionado === "string" && mencionado.trim() ? mencionado : null,
    };
  } catch (error) {
    console.error("=== EXTRACAO DE DATA FALHOU ===", (error as Error)?.message);
    return null;
  }
}

/** true se a data cai na janela em que uma visita faz sentido. */
function dataPlausivel(data: Date, agora: Date): boolean {
  const dias = (data.getTime() - agora.getTime()) / 86_400_000;
  return dias >= JANELA_MIN_DIAS - 1 && dias <= JANELA_MAX_DIAS;
}

/**
 * Janela de visitas (configuracoes) e a agenda do vendedor perto do horário.
 * Sem configuração, vale o padrão; sem agenda legível, sem conflito.
 */
async function conferirHorario(
  supabase: SupabaseClient,
  vendedorId: string | null,
  quando: Date,
  ignorarVisitaId: string | undefined,
): Promise<{ motivo: MotivoAConfirmar | null; descricaoJanela: string }> {
  const { data: config } = await supabase
    .from("configuracoes")
    .select("valor")
    .eq("chave", CHAVE_JANELAS_VISITA)
    .maybeSingle();
  const janelas = lerJanelasVisita(config?.valor ?? null);

  let ocupados: Date[] = [];
  if (vendedorId) {
    const margemMs = janelas.duracao_min * 60_000;
    let q = supabase
      .from("visitas")
      .select("id, data_hora")
      .eq("vendedor_id", vendedorId)
      .in("status", ["agendada", STATUS_A_CONFIRMAR, "confirmada"])
      .gt("data_hora", new Date(quando.getTime() - margemMs).toISOString())
      .lt("data_hora", new Date(quando.getTime() + margemMs).toISOString());
    if (ignorarVisitaId) q = q.neq("id", ignorarVisitaId);
    const { data: agenda } = await q;
    ocupados = (agenda ?? []).map((v: Record<string, unknown>) => new Date(String(v.data_hora)));
  }

  return {
    motivo: avaliarHorarioVisita(quando, janelas, ocupados),
    descricaoJanela: descreverJanelas(janelas),
  };
}

/**
 * Cria (ou atualiza) a visita do lead. Idempotente por lead: uma segunda
 * emissão de [VISITA_AGENDADA] na mesma conversa reagenda a visita existente
 * em vez de encher a agenda de duplicatas.
 *
 * Horário fora da janela de visitas ou em conflito com outra visita do mesmo
 * vendedor: a visita entra como "a_confirmar", o vendedor é avisado e o
 * resultado diz ao chamador para não confirmar ao lead.
 */
export async function handleVisitaAgendada(
  supabase: SupabaseClient,
  lead: LeadVisita,
  openaiKey: string,
  instancia?: InstanciaEnvio | null,
): Promise<ResultadoVisita> {
  const agora = new Date();

  const extraida = await extrairDataVisita(supabase, lead.id, openaiKey, agora);

  // Rede de segurança contra o erro mais caro: o lead diz "sábado, dia 9", 9
  // cai num domingo, e alguém viaja no dia errado. A primeira defesa é a
  // Sophia apontar a divergência na conversa (bloco HOJE do prompt); esta é a
  // segunda, para quando ela confirmar mesmo assim.
  //
  // Divergindo, a data NÃO é gravada como certa: a visita entra como a
  // confirmar, com o conflito escrito na observação, e um humano decide.
  const diaReal = extraida ? diaSemanaEmSaoPaulo(extraida.quando) : null;
  const diaDito = extraida?.diaSemanaMencionado ?? null;
  const conflitoDeDia =
    diaDito !== null &&
    diaReal !== null &&
    normalizarDiaSemana(diaDito) !== normalizarDiaSemana(diaReal);

  const confiavel = extraida !== null && dataPlausivel(extraida.quando, agora) && !conflitoDeDia;
  const dataHora = confiavel ? extraida!.quando : proximoDiaUtil(agora);

  // Já existe visita em aberto? Reagenda em vez de criar outra.
  const { data: existentes } = await supabase
    .from("visitas")
    .select("id, status")
    .eq("lead_id", lead.id)
    .in("status", ["agendada", STATUS_A_CONFIRMAR, "confirmada"])
    .limit(1);

  const visitaAberta = existentes?.[0]?.id as string | undefined;

  // Só faz sentido conferir janela e agenda com uma data em que se confia; o
  // horário provisório já sai marcado como a confirmar na observação.
  const conferencia = confiavel
    ? await conferirHorario(supabase, lead.vendedor_id ?? null, dataHora, visitaAberta).catch(
        (e) => {
          console.error("[lead-visita] conferência de horário falhou:", (e as Error)?.message);
          return { motivo: null, descricaoJanela: "" };
        },
      )
    : { motivo: null, descricaoJanela: "" };
  const motivo = conferencia.motivo;
  const quandoTexto = dataHora.toLocaleString("pt-BR", { timeZone: FUSO });
  const explicacaoMotivo =
    motivo === "fora_da_janela"
      ? `o horário pedido (${quandoTexto}) está fora da janela de visitas (${conferencia.descricaoJanela})`
      : motivo === "conflito_agenda"
        ? `o horário pedido (${quandoTexto}) conflita com outra visita na agenda do vendedor`
        : "";

  const status = motivo
    ? STATUS_A_CONFIRMAR
    : existentes?.[0]?.status === STATUS_A_CONFIRMAR
      ? "agendada"
      : undefined;

  const observacoes = motivo
    ? `Pedida pela Sophia — HORÁRIO A CONFIRMAR: ${explicacaoMotivo}. Confirme com o lead antes de sair.`
    : confiavel
      ? "Agendada automaticamente pela Sophia, a partir do que foi combinado na conversa."
      : conflitoDeDia
        ? `Agendada automaticamente pela Sophia — DATA CONFLITANTE, A CONFIRMAR: o lead falou em` +
          ` "${diaDito}", mas a data combinada (${extraida!.quando.toLocaleDateString("pt-BR", { timeZone: FUSO })})` +
          ` cai numa ${diaReal}. Confirme com ele antes de sair. Este é um horário provisório.`
        : "Agendada automaticamente pela Sophia — HORÁRIO A CONFIRMAR: não foi possível" +
          " identificar a data combinada na conversa. Este é um horário provisório.";

  if (visitaAberta) {
    const { error } = await supabase
      .from("visitas")
      .update({ data_hora: dataHora.toISOString(), observacoes, ...(status ? { status } : {}) })
      .eq("id", visitaAberta);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("visitas").insert({
      lead_id: lead.id,
      vendedor_id: lead.vendedor_id ?? null,
      data_hora: dataHora.toISOString(),
      status: status ?? "agendada",
      observacoes,
    });
    if (error) throw error;
  }

  await supabase.from("interacoes").insert({
    lead_id: lead.id,
    tipo: "sistema",
    canal: "sistema",
    conteudo: motivo
      ? `Visita ${visitaAberta ? "reagendada" : "criada"} como A CONFIRMAR — ${explicacaoMotivo}. A Sophia não confirmou ao lead.`
      : confiavel
        ? `Visita ${visitaAberta ? "reagendada" : "agendada"} automaticamente para ${dataHora.toLocaleString("pt-BR", { timeZone: FUSO })}.`
        : conflitoDeDia
          ? `Visita ${visitaAberta ? "reagendada" : "criada"} com horário provisório (${dataHora.toLocaleString("pt-BR", { timeZone: FUSO })}) — o lead falou em "${diaDito}", mas a data combinada cai numa ${diaReal}. Confirme com ele antes de sair.`
          : `Visita ${visitaAberta ? "reagendada" : "criada"} com horário provisório (${dataHora.toLocaleString("pt-BR", { timeZone: FUSO })}) — a data combinada não pôde ser identificada na conversa. Confirme na Agenda.`,
  });

  if (motivo) {
    await notificarResponsaveis(
      supabase,
      lead.id,
      {
        tipo: "visita_a_confirmar",
        titulo: "Visita a confirmar",
        corpo: `O lead pediu visita, mas ${explicacaoMotivo}. Combine o horário com ele pela conversa.`,
      },
      instancia ?? null,
    );
  }

  return { aConfirmar: motivo !== null, motivo };
}
