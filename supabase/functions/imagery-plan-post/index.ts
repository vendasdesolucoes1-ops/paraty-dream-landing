// Imagery Engine — Planner
// Recebe { tema, nicho, objetivo, tipo, n_slides } → cria o post e os slides
// com headline, sub_text e brief visual de cada arte.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { DAILY_BUDGET_USD, estimatePostCost } from "../_shared/imagery-cost.ts";
import { BRAND_BIBLE, CONTENT_PLAYBOOK, VISUAL_DIRECTION } from "../_shared/brand.ts";
import { BRAND_SLUG } from "../_shared/acervo.ts";

const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GOOGLE_AI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_PLANNER = "gemini-3-flash-preview";

// Google list price oficial, gemini-3-flash-preview, verificado 2026-07-29.
const PLANNER_IN_PER_1M = 0.5;
const PLANNER_OUT_PER_1M = 3.0;

/**
 * Custo real da chamada a partir do usageMetadata. A família Gemini 3 também
 * raciocina: thoughtsTokenCount é cobrado como output e costuma superar a
 * resposta em si, então ignorá-lo subestimaria o gasto por larga margem.
 */
function plannerCost(usage: Record<string, number> | undefined): number {
  if (!usage) return 0;
  const input = Number(usage.promptTokenCount ?? 0);
  const output = Number(usage.candidatesTokenCount ?? 0) + Number(usage.thoughtsTokenCount ?? 0);
  const custo = (input * PLANNER_IN_PER_1M + output * PLANNER_OUT_PER_1M) / 1_000_000;
  return Number(custo.toFixed(6));
}

const SYSTEM_PROMPT = `Você é o Planner do Imagery Engine do Moradas de Paraty.
Planeja posts de Instagram nível revista: fotografia editorial em cor natural +
tipografia serifada elegante.

${BRAND_BIBLE}

${CONTENT_PLAYBOOK}

${VISUAL_DIRECTION}

TEMPLATES DISPONÍVEIS (escolha 1 por slide):

1. T01_CAPA — Foto fullbleed + headline serifada grande no rodapé, filete dourado no topo.
   Slide 1 SEMPRE. needs_image = true.

2. T02_CENA — Split 55/45. Foto à esquerda, texto respirando à direita.
   Use para contar uma cena, uma sensação, um detalhe do lugar. needs_image = true.

3. T03_DADO — Split 50/50. Foto à esquerda, número/medida grande em dourado à direita.
   headline DEVE ser o dado curto ("9 MIN", "1815", "500 M²"). sub = contexto curto.
   Use apenas com dado real vindo do briefing ou dos fatos oficiais. needs_image = true.

4. T04_LISTA — Lista de 3 itens numerados sobre fundo verde profundo, foto lateral discreta.
   headline = título da seção.
   sub = itens no formato "01|título 1|apoio curto 1||02|título 2|apoio 2||03|título 3|apoio 3".
   needs_image = true.

5. T05_CTA — Foto fullbleed + frase final + faixa dourada inferior com o convite.
   Último slide SEMPRE. needs_image = true.

REGRAS DE TEXTO:
- headline: 2 a 7 palavras. Nunca use "/" nem "|" no headline (reservados para o sub do T04_LISTA).
- sub_text: até 15 palavras, apoia sem repetir o headline.
- Sem emoji, sem hashtag nos slides (hashtag só na caption).
- caption_final: 90 a 180 palavras, prosa fluida, sem bullets, sem emoji, UM CTA no fim.

DISTRIBUIÇÃO:
- n_slides = 1: exatamente 1 slide T01_CAPA.
- n_slides > 1: slide 1 = T01_CAPA, último = T05_CTA, miolo mistura T02_CENA, T03_DADO e T04_LISTA.

TIPOS DE IMAGEM (image_type) — escolha o que a cena pede:
- aerea: vista de drone do loteamento, a malha de lotes na encosta, a mata em volta,
  o rio cortando o terreno. PREFIRA ESTE quando o slide fala do empreendimento em si,
  da localização ou da dimensão do projeto — é o acervo mais forte da marca.
- paisagem: a serra, a mata, o horizonte, sem foco no loteamento.
- arquitetura: Paraty histórica, casario colonial, ruas de pedra.
- agua: o rio Perequê-Açu, cachoeiras, poços.
- detalhe: close tátil — pedra molhada, samambaia, madeira, telha.
- vida: o cotidiano de quem mora aqui, sem rostos para a câmera.

image_brief (40-80 palavras, em inglês, para o gerador de imagem):
- Cena concreta e específica do tema, em Paraty ou na Mata Atlântica.
- SEMPRE terminar com: "natural color editorial photography, golden hour, soft mist,
  deep Atlantic Forest greens, film grain, no text, no people looking at camera".

Devolva APENAS via tool call.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const t0 = Date.now();
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { tema, nicho, objetivo, tipo = "carrossel", n_slides = 5 } = body ?? {};
    const requestedSlides = Math.max(1, Math.min(8, Number(n_slides) || 1));
    if (!tema || !objetivo) {
      return new Response(JSON.stringify({ error: "Faltam campos: tema e objetivo" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Teto de gasto: soma o que este usuário já consumiu nas últimas 24h e
    // recusa antes de gastar qualquer coisa. Roda com service_role de propósito
    // — o usuário não pode ler o gasto alheio, mas a cota considera só o dele.
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: gastoRows, error: gastoErr } = await admin
      .from("imagery_logs")
      .select("custo_usd, imagery_posts!inner(user_id)")
      .gte("created_at", desde)
      .eq("imagery_posts.user_id", user.id);
    if (gastoErr) throw gastoErr;

    const gasto24h = (gastoRows ?? []).reduce(
      (acc: number, row: { custo_usd: number | null }) => acc + Number(row.custo_usd ?? 0),
      0,
    );
    const estimativa = estimatePostCost(requestedSlides);

    if (gasto24h + estimativa.estimado > DAILY_BUDGET_USD) {
      return new Response(
        JSON.stringify({
          error: "cota_diaria_excedida",
          message:
            `Cota diária de geração atingida (US$ ${DAILY_BUDGET_USD.toFixed(2)}). ` +
            `Você já usou US$ ${gasto24h.toFixed(2)} nas últimas 24h e este post custaria cerca de ` +
            `US$ ${estimativa.estimado.toFixed(2)}. Tente novamente mais tarde ou reduza o número de slides.`,
          gasto_24h_usd: Number(gasto24h.toFixed(4)),
          limite_usd: DAILY_BUDGET_USD,
          estimativa_usd: estimativa.estimado,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Diretrizes de marca salvas no painel
    const { data: assets } = await admin
      .from("brand_assets")
      .select("type, title, content")
      .eq("is_active", true);
    const dbBrand = (assets ?? [])
      .filter((a: { content: string | null }) => !!a.content)
      .map((a: { type: string; title: string; content: string }) =>
        `[${a.type.toUpperCase()}] ${a.title}: ${a.content}`
      )
      .join("\n");

    const { data: post, error: postErr } = await admin
      .from("imagery_posts")
      .insert({
        user_id: user.id,
        tipo,
        tema,
        nicho: nicho ?? null,
        objetivo,
        n_slides: requestedSlides,
        status: "planning",
      })
      .select()
      .single();
    if (postErr) throw postErr;

    const userPrompt = `TEMA: ${tema}
PILAR: ${nicho ?? "livre"}
OBJETIVO: ${objetivo}
TIPO: ${tipo}
QUANTIDADE DE SLIDES: ${requestedSlides}
${dbBrand ? `\nDIRETRIZES SALVAS DA MARCA:\n${dbBrand}` : ""}

Gere a estrutura completa.`;

    const aiResp = await fetch(`${GOOGLE_AI_BASE}/${MODEL_PLANNER}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": GOOGLE_AI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        // O Google não tem role "system": as instruções de marca vão em
        // systemInstruction, fora de contents. Dentro de contents elas viravam
        // só mais uma mensagem do usuário e o planner as tratava como sugestão.
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        tools: [{
          functionDeclarations: [{
            name: "plan_post",
            description: "Estrutura completa de um post de Instagram do Moradas de Paraty",
            // O subset OpenAPI do Google não aceita additionalProperties — o
            // campo derruba a requisição com 400 INVALID_ARGUMENT.
            parameters: {
              type: "object",
              properties: {
                titulo_post: { type: "string" },
                caption_final: { type: "string", description: "Legenda de 90 a 180 palavras" },
                hashtags: { type: "array", items: { type: "string" }, maxItems: 8 },
                slides: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      slide_n: { type: "number" },
                      template_id: {
                        type: "string",
                        enum: ["T01_CAPA", "T02_CENA", "T03_DADO", "T04_LISTA", "T05_CTA"],
                      },
                      headline: { type: "string", description: "2 a 7 palavras" },
                      sub_text: { type: "string", description: "Apoio, até 15 palavras" },
                      needs_image: { type: "boolean" },
                      image_type: {
                        type: "string",
                        enum: ["aerea", "paisagem", "detalhe", "arquitetura", "agua", "vida"],
                      },
                      image_brief: { type: "string", description: "Brief visual em inglês, 40-80 palavras" },
                    },
                    required: ["slide_n", "template_id", "headline", "needs_image"],
                  },
                },
              },
              required: ["titulo_post", "caption_final", "slides"],
            },
          }],
        }],
        // mode ANY obriga o modelo a chamar a função em vez de responder texto.
        toolConfig: {
          functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["plan_post"] },
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      await admin
        .from("imagery_posts")
        .update({ status: "failed", error_message: `Planner: ${aiResp.status} ${txt.slice(0, 200)}` })
        .eq("id", post.id);
      // Sem 402 aqui: o planner agora é cobrado direto no Google, que sinaliza
      // estouro de cota com 429 e chave inválida com 403.
      const status = aiResp.status === 429 ? aiResp.status : 500;
      const error = aiResp.status === 429
        ? "Limite de requisições do Google atingido. Tente em alguns segundos."
        : aiResp.status === 403
          ? "Chave do Google AI inválida ou sem permissão."
          : "Erro no serviço de IA";
      return new Response(JSON.stringify({ error, details: txt.slice(0, 300) }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    // deno-lint-ignore no-explicit-any
    const parts: any[] = aiJson.candidates?.[0]?.content?.parts ?? [];

    // functionCall.args já vem como OBJETO no Google — diferente do gateway,
    // onde function.arguments era string JSON. Aplicar JSON.parse aqui lançaria
    // e o plano cairia silenciosamente no fallback de texto.
    // deno-lint-ignore no-explicit-any
    let plan: any = parts.find((p) => p?.functionCall?.args)?.functionCall?.args ?? null;

    if (!plan) {
      // Fallback: o modelo respondeu texto em vez de chamar a função.
      const rawContent = parts
        .map((p) => (typeof p?.text === "string" ? p.text : ""))
        .join("");
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (match) {
        try { plan = JSON.parse(match[0]); } catch { /* ignore */ }
      }
      if (!plan) {
        console.error(
          "Planner sem functionCall. finishReason:",
          aiJson.candidates?.[0]?.finishReason,
          "| texto:",
          rawContent.slice(0, 400),
        );
      }
    }
    if (!plan || !Array.isArray(plan.slides) || plan.slides.length === 0) {
      throw new Error("A IA não retornou um plano válido. Tente novamente.");
    }

    // deno-lint-ignore no-explicit-any
    const normalizedSlides = plan.slides.slice(0, requestedSlides).map((s: any, idx: number) => ({
      ...s,
      slide_n: idx + 1,
      template_id: requestedSlides === 1
        ? "T01_CAPA"
        : idx === 0
          ? "T01_CAPA"
          : idx === requestedSlides - 1
            ? "T05_CTA"
            : (s.template_id ?? "T02_CENA"),
    }));

    // A origem da imagem é decidida AQUI, no servidor — não pelo modelo. Para
    // cada slide que precisa de imagem, tentamos primeiro o acervo de fotos
    // reais do empreendimento; gerar por IA é a exceção.
    const slidesRows = [];
    for (const s of normalizedSlides) {
      const precisaImagem = s.needs_image !== false;
      const imageType = s.image_type ?? "paisagem";

      let imageSource = precisaImagem ? "gerar" : "nenhuma";
      let acervoId: string | null = null;
      let rawImageUrl: string | null = null;

      if (precisaImagem) {
        // pick_acervo_image já filtra por brand_slug, ignora contem_pessoas e
        // incrementa o uso atomicamente (rotação menos-usado-recentemente).
        const { data: fundo, error: acervoErr } = await admin.rpc("pick_acervo_image", {
          p_tag: imageType,
          p_brand_slug: BRAND_SLUG,
        });
        if (acervoErr) {
          // Falha no acervo não pode derrubar o post: cai para geração.
          console.error("pick_acervo_image falhou:", acervoErr.message);
        } else if (fundo?.file_url) {
          imageSource = "acervo";
          acervoId = fundo.id;
          rawImageUrl = fundo.file_url;
        }
      }

      slidesRows.push({
        post_id: post.id,
        slide_n: s.slide_n,
        template_id: s.template_id,
        needs_image: precisaImagem,
        image_type: imageType,
        image_brief: s.image_brief ?? null,
        image_source: imageSource,
        acervo_id: acervoId,
        raw_image_url: rawImageUrl,
        copy_data: { headline: s.headline, sub_text: s.sub_text ?? null },
        status: "pending",
      });
    }

    const { error: slidesErr } = await admin.from("imagery_slides").insert(slidesRows);
    if (slidesErr) throw slidesErr;

    await admin
      .from("imagery_posts")
      .update({
        copy_data: {
          titulo: plan.titulo_post,
          caption: plan.caption_final,
          hashtags: plan.hashtags ?? [],
        },
        status: "draft",
      })
      .eq("id", post.id);

    await admin.from("imagery_logs").insert({
      post_id: post.id,
      step: "plan",
      provider: "google_direct",
      model: MODEL_PLANNER,
      prompt_excerpt: userPrompt.slice(0, 500),
      response_summary: { n_slides: normalizedSlides.length, usage: aiJson.usageMetadata ?? null },
      custo_usd: plannerCost(aiJson.usageMetadata),
      duracao_ms: Date.now() - t0,
      success: true,
    });

    return new Response(
      JSON.stringify({ post_id: post.id, plan: { ...plan, slides: normalizedSlides } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("imagery-plan-post error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
