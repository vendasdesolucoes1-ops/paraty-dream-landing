// Supabase Edge Function — post-processes a lead just created by the public
// landing-page form (anon client). Runs with service_role, so it can do
// everything the anon visitor must NOT be able to: read the lead back, assign
// a salesperson via round-robin, log the origin interaction, and hand off to
// the WhatsApp AI agent.
//
// The anon client inserts the lead WITHOUT a vendedor and WITHOUT reading it
// back (anon has INSERT but not SELECT on leads — reading would 401), then
// calls this function with the normalized phone. Round-robin only advances
// here, after the lead is confirmed to exist — never speculatively before the
// insert, so a failed insert can't burn a salesperson's turn.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { DELAY_MAX_MS, DELAY_MIN_MS, montarAbertura } from "../_shared/primeiro-contato.ts";
import { handleLeadQualification, type LeadRecord } from "../_shared/lead-qualification.ts";
import { carregarLead } from "../_shared/lead-record.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Mesma higienização das outras functions: a chave copiada do painel costuma
// vir com quebra de linha invisível, que faz o header Authorization falhar.
const OPENAI_API_KEY = (Deno.env.get("OPENAI_API_KEY") ?? "")
  .trim()
  .replace(/[\r\n\t]/g, "")
  .replace(/[^\x20-\x7E]/g, "");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface EnrichBody {
  /** id devolvido pelo upsert_lead_from_form. Obrigatório. */
  lead_id?: string | null;
  telefone?: string;
  nome?: string;
  cidade?: string | null;
  metragem?: string | null;
  tipo?: string | null;
}

// Esta função é pública (o formulário chama com a chave anon). Por isso ela
// NÃO confia no corpo da requisição para nada que vá ao WhatsApp: o telefone,
// o nome e a cidade vêm do banco, e só são aceitos leads que o próprio
// formulário acabou de gravar. Sem isso, qualquer pessoa usava o número da
// empresa para mandar texto escolhido a qualquer telefone (auditoria R-03).
const JANELA_LEAD_RECENTE_MS = 2 * 60_000;
const METRAGENS_FORM = new Set(["250m²", "250-350m²", "450m²"]);
const TIPOS_FORM = new Set(["residencial", "comercial"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ipDoPedido(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "desconhecido"
  );
}

async function dentroDoLimite(chave: string, maximo: number, janelaSegundos: number) {
  const { data, error } = await supabase.rpc("consumir_limite", {
    p_chave: chave,
    p_maximo: maximo,
    p_janela_segundos: janelaSegundos,
  });
  // Falha fechada: sem conseguir contar, não abre a porta.
  if (error) {
    console.error("[enrich-lead] consumir_limite falhou:", error.message);
    return false;
  }
  return data === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: EnrichBody = await req.json();
    const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(leadId))
      return json({ ok: false, error: "lead_id obrigatório" }, 400);

    if (!(await dentroDoLimite(`enrich:ip:${ipDoPedido(req)}`, 5, 600))) {
      return json({ ok: false, error: "Muitas tentativas. Tente de novo em alguns minutos." }, 429);
    }
    if (!(await dentroDoLimite(`enrich:lead:${leadId}`, 3, 3600))) {
      return json({ ok: false, error: "Muitas tentativas." }, 429);
    }

    // Campos completos porque handleLeadQualification precisa deles para o
    // resumo do vendedor e para a guarda de "primeira qualificação".
    const lead = (await carregarLead(supabase, leadId)) as LeadRecord | null;

    // Sem lead persistido não há abordagem: falar com quem não tem registro no
    // CRM deixa a conversa órfã e o vendedor sem contexto nenhum.
    if (!lead) return json({ ok: false, error: "lead não encontrado" }, 404);

    // Só o lead que o formulário acabou de gravar (o upsert atualiza
    // updated_at também quando o telefone já existia).
    const { data: carimbo } = await supabase
      .from("leads")
      .select("updated_at")
      .eq("id", lead.id)
      .maybeSingle();
    const atualizadoEm = carimbo?.updated_at ? Date.parse(carimbo.updated_at) : 0;
    if (!atualizadoEm || Date.now() - atualizadoEm > JANELA_LEAD_RECENTE_MS) {
      return json({ ok: false, error: "lead fora da janela do formulário" }, 409);
    }

    const telefone = String(lead.telefone ?? "");
    if (!telefone) return json({ ok: false, error: "lead sem telefone" }, 422);

    // Metragem e tipo só entram na mensagem se forem exatamente as opções do
    // formulário; qualquer outro texto é descartado.
    const metragem = body.metragem && METRAGENS_FORM.has(body.metragem) ? body.metragem : null;
    const tipo = body.tipo && TIPOS_FORM.has(body.tipo.toLowerCase()) ? body.tipo : null;

    // Round-robin assignment — only now, after the lead is confirmed to exist,
    // and only if it doesn't already have a salesperson.
    if (!lead.vendedor_id) {
      const { data: vendedorId } = await supabase.rpc("get_next_round_robin_salesperson");
      if (vendedorId) {
        await supabase.from("leads").update({ vendedor_id: vendedorId }).eq("id", lead.id);
        lead.vendedor_id = vendedorId;
      }
    }

    // Lead de formulário JÁ NASCE QUALIFICADO.
    //
    // O formulário entrega nome, telefone, cidade, metragem e tipo — mais do
    // que a Sophia costuma arrancar em dez mensagens. Esperar ela recoletar
    // tudo pelo chat para o card sair de "Novo" era desperdiçar informação que
    // já estava no banco, e deixava o vendedor sem saber que o lead existe até
    // a conversa engrenar. Só "objetivo" fica faltando, e a Sophia pergunta na
    // conversa — mas isso não segura mais o estágio do card.
    //
    // Reaproveita handleLeadQualification em vez de só escrever o status: é a
    // mesma sequência que a marca [LEAD_QUALIFICADO] dispara (status, extração,
    // atribuição, notificação in-app e resumo por WhatsApp), e duplicá-la aqui
    // faria as duas divergirem no primeiro ajuste.
    //
    // O vendedor recebe UM aviso, no momento da criação: quando a Sophia
    // emitir [LEAD_QUALIFICADO] mais tarde na mesma conversa, a interação de
    // qualificação já existe e a sequência retorna sem notificar de novo.
    //
    // Sem guarda de status aqui: quem decide se já notificou é
    // handleLeadQualification, olhando a interação de qualificação registrada.
    //
    // A guarda que existia (`status_crm === 'novo'`) quebrou quando o
    // upsert_lead_from_form passou a criar o lead já como 'qualificado' — a
    // condição nascia falsa e o vendedor deixava de ser avisado exatamente do
    // lead mais completo que existe, o que preencheu a ficha inteira.
    {
      const { data: instancia } = await supabase
        .from("whatsapp_instances")
        .select("api_url, api_key, instance_name")
        .in("status", ["connected", "open"])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (instancia) {
        try {
          await handleLeadQualification(supabase, lead, instancia, OPENAI_API_KEY);
        } catch (e) {
          // O lead já está salvo e atribuído; falhar aqui não pode derrubar a
          // resposta ao formulário nem impedir a abordagem da Sophia.
          console.error("[enrich-lead] qualificação inicial falhou:", e);
        }
      } else {
        // Sem instância não há como mandar o resumo, mas o status precisa
        // andar de qualquer forma.
        await supabase.from("leads").update({ status_crm: "qualificado" }).eq("id", lead.id);
        console.warn("[enrich-lead] sem instância — lead qualificado sem resumo ao vendedor", {
          leadId: lead.id,
        });
      }
    }

    // Origin history entry — shows in the CRM lead's "Histórico" tab.
    const detalhes = [
      lead.cidade ? `Cidade: ${lead.cidade}` : null,
      metragem ? `Metragem: ${metragem}` : null,
      tipo ? `Tipo: ${tipo}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    // Wording works for both a brand-new lead and a returning visitor who
    // re-submitted the form (the upsert may have updated an existing lead).
    await supabase.from("interacoes").insert({
      lead_id: lead.id,
      tipo: "sistema",
      canal: "formulario_site",
      conteudo: `Contato recebido pelo formulário do site (Landing Page).${
        detalhes ? ` ${detalhes}.` : ""
      }`,
    });

    // Abordagem inicial da Sophia: entra na fila, não é enviada aqui.
    //
    // A instância conectada NÃO é mais condição para enfileirar — só para
    // enviar. Antes, instância fora do ar significava mensagem evaporada em
    // silêncio; agora a linha fica pendente esperando ela voltar (com teto de
    // 24h, aplicado no banco).
    const partes = montarAbertura({
      nome: (lead.nome as string | null) ?? null,
      cidade: (lead.cidade as string | null) ?? null,
      metragem,
      tipo,
    });

    const espera = DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));

    // Conflito com uma linha pendente/enviando do mesmo lead é o caso normal de
    // reenvio do formulário ou retry desta função — o índice único parcial
    // rejeita, e é exatamente o que queremos. Por isso o erro não é lançado.
    const { error: filaError } = await supabase.from("mensagens_agendadas").insert({
      lead_id: lead.id,
      tipo: "primeiro_contato",
      telefone,
      partes,
      agendado_para: new Date(Date.now() + espera).toISOString(),
    });

    if (filaError) {
      console.warn("[enrich-lead] não enfileirou primeiro contato", {
        leadId: lead.id,
        code: filaError.code,
        message: filaError.message,
      });
    }

    return json({ ok: true, lead_id: lead.id });
  } catch (error) {
    console.error("enrich-lead error", (error as Error)?.message);
    return json({ ok: false, error: "Erro interno" }, 500);
  }
});
