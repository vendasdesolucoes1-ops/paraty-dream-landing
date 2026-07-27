// Imagery Engine — Planner
// Recebe { tema, nicho, objetivo, tipo, n_slides } → cria o post e os slides
// com headline, sub_text e brief visual de cada arte.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { BRAND_BIBLE, CONTENT_PLAYBOOK, VISUAL_DIRECTION } from "../_shared/brand.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "plan_post",
            description: "Estrutura completa de um post de Instagram do Moradas de Paraty",
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
                        enum: ["paisagem", "detalhe", "arquitetura", "agua", "vida"],
                      },
                      image_brief: { type: "string", description: "Brief visual em inglês, 40-80 palavras" },
                    },
                    required: ["slide_n", "template_id", "headline", "needs_image"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["titulo_post", "caption_final", "slides"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "plan_post" } },
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      await admin
        .from("imagery_posts")
        .update({ status: "failed", error_message: `Planner: ${aiResp.status} ${txt.slice(0, 200)}` })
        .eq("id", post.id);
      const status = aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 500;
      const error = aiResp.status === 429
        ? "Limite de requisições atingido. Tente em alguns segundos."
        : aiResp.status === 402
          ? "Créditos de IA esgotados. Adicione créditos no workspace."
          : "Erro no serviço de IA";
      return new Response(JSON.stringify({ error, details: txt.slice(0, 300) }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    // deno-lint-ignore no-explicit-any
    let plan: any = null;
    if (toolCall?.function?.arguments) {
      try {
        plan = JSON.parse(toolCall.function.arguments);
      } catch {
        console.error("Falha ao parsear tool_call:", toolCall.function.arguments?.slice(0, 400));
      }
    }
    if (!plan) {
      const rawContent = String(aiJson.choices?.[0]?.message?.content ?? "");
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (match) {
        try { plan = JSON.parse(match[0]); } catch { /* ignore */ }
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
      needs_image: true,
    }));

    // deno-lint-ignore no-explicit-any
    const slidesRows = normalizedSlides.map((s: any) => ({
      post_id: post.id,
      slide_n: s.slide_n,
      template_id: s.template_id,
      needs_image: true,
      image_type: s.image_type ?? "paisagem",
      image_brief: s.image_brief ?? null,
      copy_data: { headline: s.headline, sub_text: s.sub_text ?? null },
      status: "pending",
    }));
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
      provider: "lovable",
      model: "google/gemini-2.5-pro",
      prompt_excerpt: userPrompt.slice(0, 500),
      response_summary: { n_slides: normalizedSlides.length },
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
