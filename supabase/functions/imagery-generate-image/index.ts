// Imagery Engine — Gerador de imagem
// Recebe { slide_id } → monta o prompt a partir do brief, gera a foto pela API
// direta do Google Gemini, sobe no bucket privado e devolve URL assinada.
// O texto (plan-post, validate-image) segue no gateway Lovable.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { guardInternalCall } from "../_shared/internal-auth.ts";
import { VISUAL_DIRECTION } from "../_shared/brand.ts";
import { base64ToBytes, uploadSigned } from "../_shared/imagery.ts";
import { COST_IMAGE_FLASH, COST_IMAGE_PRO, isProTemplate } from "../_shared/imagery-cost.ts";

const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GOOGLE_AI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// IDs da API direta não levam o prefixo "google/" usado pelo gateway.
const MODEL_FLASH_IMAGE = "gemini-2.5-flash-image";
const MODEL_PRO_IMAGE = "gemini-3-pro-image";

// Retrato 4:5, igual ao canvas do imagery-compose-slide (1080x1350).
const ASPECT_RATIO = "4:5";

const NEGATIVE =
  "stock photo, people smiling at camera, silhouette couple at sunset, 3d render, illustration, cartoon, vector art, watermark, text overlay, letters, logos, oversaturated HDR, purple sky, tropical caribbean cliche, low quality, distorted hands, extra fingers, lens flare, heavy instagram filter";

// 503 do Google é sobrecarga temporária do serviço, não erro nosso — merece
// esperar e tentar de novo em vez de desistir na primeira. Outros códigos
// (400 de parâmetro errado, 401 de key inválida etc.) são erro estrutural:
// tentar de novo não muda o resultado, então falha direto.
const RETRY_BACKOFF_MS = 4_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGoogleImageApi(
  model: string,
  prompt: string,
): Promise<{ ok: true; b64: string } | { ok: false; status: number; body: string }> {
  const resp = await fetch(`${GOOGLE_AI_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": GOOGLE_AI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      // 4:5 retrato — mesmo formato do feed real do Instagram. O compose
      // monta em 1080x1350, então pedir a imagem já nessa proporção evita
      // perder enquadramento num crop depois.
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: ASPECT_RATIO },
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!resp.ok) {
    return { ok: false, status: resp.status, body: (await resp.text()).slice(0, 200) };
  }

  const json = await resp.json();
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const b64 = parts.find((p: { inlineData?: { data?: string } }) => p?.inlineData?.data)?.inlineData
    ?.data;
  if (!b64) {
    const motivo = json.candidates?.[0]?.finishReason ?? json.promptFeedback?.blockReason ?? "";
    // Sem imagem na resposta mas HTTP 200 — não é 503, cai como erro normal
    // (sem retry de backoff, sem fallback de modelo).
    return {
      ok: false,
      status: 200,
      body: `nenhuma imagem retornada${motivo ? ` (${motivo})` : ""}`,
    };
  }
  return { ok: true, b64 };
}

/**
 * Gera a imagem com resiliência a sobrecarga temporária (503), sem abrir mão
 * do teto de 1 retry por slide que já existe no orchestrate (retry de
 * qualidade) — este aqui é um segundo eixo independente, de disponibilidade:
 *
 * 1ª tentativa: modelo pedido (pro na capa, flash nos demais).
 * Se 503: espera RETRY_BACKOFF_MS, tenta o MESMO modelo de novo.
 * Se 503 de novo E o modelo era o pro: cai para o flash automaticamente —
 *   ele já provou ser estável, e é melhor entregar a capa com o modelo mais
 *   barato do que devolver "Falhou" pro usuário destravar manualmente nisso
 *   pela segunda vez em poucos dias.
 * Qualquer erro que não seja 503 (400, 401, resposta sem imagem) falha na
 *   hora — não é sobrecarga temporária, tentar de novo não muda nada.
 */
async function generateWithResilience(
  model: string,
  prompt: string,
  allowModelFallback: boolean,
): Promise<{ b64: string; modelUsado: string }> {
  const primeira = await callGoogleImageApi(model, prompt);
  if (primeira.ok) return { b64: primeira.b64, modelUsado: model };
  if (primeira.status !== 503) {
    throw new Error(`${model}: ${primeira.status} ${primeira.body}`);
  }

  await sleep(RETRY_BACKOFF_MS);
  const segunda = await callGoogleImageApi(model, prompt);
  if (segunda.ok) return { b64: segunda.b64, modelUsado: model };
  if (segunda.status !== 503 || !allowModelFallback) {
    throw new Error(`${model}: ${segunda.status} ${segunda.body} (após retry com backoff)`);
  }

  // Ainda 503 depois do backoff, e é a capa (único caso com fallback
  // habilitado): tenta o flash, que já demonstrou ser estável. Sem backoff
  // aqui — é um modelo diferente, não a mesma fila sobrecarregada.
  const fallback = await callGoogleImageApi(MODEL_FLASH_IMAGE, prompt);
  if (fallback.ok) return { b64: fallback.b64, modelUsado: MODEL_FLASH_IMAGE };
  throw new Error(
    `${model}: 503 persistente, fallback ${MODEL_FLASH_IMAGE} também falhou: ${fallback.status} ${fallback.body}`,
  );
}

function typeHint(imageType: string): string {
  switch (imageType) {
    case "aerea":
      return "Aerial drone view of a hillside residential land development in Paraty, Brazil: gently terraced plots following the natural topography, native Atlantic Forest kept between them, a clear river winding along the edge, Serra do Mar ridges behind. Respectful of the terrain, no dense construction.";
    case "paisagem":
      return "Wide environmental shot of the Atlantic Forest hills meeting the sea in Paraty, layered mountains, low mist between the trees, calm horizon.";
    case "detalhe":
      return "Intimate close-up detail: wet stone, fern leaves, colonial wood, rope, clay tile, morning dew. Shallow depth of field, tactile.";
    case "arquitetura":
      return "Colonial Paraty architecture: whitewashed walls, coloured window frames, irregular cobblestone streets, terracotta roofs. Quiet, no crowd.";
    case "agua":
      return "Fresh water of the Atlantic Forest: the Perequê-Açu river, a waterfall over dark granite, clear pools, long exposure softness.";
    case "vida":
      return "Everyday life without faces to camera: hands, a wooden boat, a table set outdoors, a dog on a veranda, seen from behind or cropped.";
    default:
      return "Editorial landscape of Paraty and the Atlantic Forest.";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Etapa interna e cara do pipeline: só o orchestrate pode invocar.
  const denied = guardInternalCall(req, corsHeaders);
  if (denied) return denied;

  const t0 = Date.now();
  let slideId: string | undefined;

  try {
    const body = await req.json();
    slideId = body?.slide_id;
    if (!slideId) {
      return new Response(JSON.stringify({ error: "slide_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: slide, error } = await admin
      .from("imagery_slides")
      .select("*")
      .eq("id", slideId)
      .single();
    if (error || !slide) throw new Error("Slide não encontrado");

    // Slide de texto puro: nada a gerar.
    if (!slide.needs_image) {
      await admin.from("imagery_slides").update({ status: "ready" }).eq("id", slideId);
      return new Response(JSON.stringify({ skipped: true, source: "nenhuma" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fundo veio do acervo (foto real do empreendimento): o planner já gravou a
    // URL. Nada é gerado, nada é cobrado, e o orchestrate pula a validação.
    if (slide.image_source === "acervo" && slide.raw_image_url) {
      await admin
        .from("imagery_slides")
        .update({ status: "ready", error_message: null })
        .eq("id", slideId);

      await admin.from("imagery_logs").insert({
        slide_id: slideId,
        post_id: slide.post_id,
        step: "generate_image",
        provider: "acervo",
        model: null,
        response_summary: { image_type: slide.image_type, acervo_id: slide.acervo_id },
        custo_usd: 0,
        duracao_ms: Date.now() - t0,
        success: true,
      });

      return new Response(JSON.stringify({ url: slide.raw_image_url, source: "acervo", cost: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!slide.image_brief) {
      await admin.from("imagery_slides").update({ status: "ready" }).eq("id", slideId);
      return new Response(JSON.stringify({ skipped: true, source: "sem_brief" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("imagery_slides").update({ status: "generating" }).eq("id", slideId);

    const imageType = slide.image_type ?? "paisagem";
    const prompt = [
      slide.image_brief,
      typeHint(imageType),
      VISUAL_DIRECTION,
      "Vertical 4:5 portrait composition. Leave calm negative space in the lower half, so title, badges and a call-to-action bar can be placed over it.",
      `Avoid: ${NEGATIVE}`,
    ].join("\n\n");

    // O modelo caro fica só na capa (T01), que é o slide exibido no feed.
    // Fallback automático pro flash também só se aplica ali — é a única
    // combinação onde existe um modelo "de baixo" pra cair.
    const usaPro = isProTemplate(slide.template_id);
    const model = usaPro ? MODEL_PRO_IMAGE : MODEL_FLASH_IMAGE;

    // API direta do Google (Generative Language). Difere do gateway em três
    // pontos: auth por x-goog-api-key, modelo no path, e a imagem volta em
    // candidates[].content.parts[].inlineData em vez de data[0].b64_json.
    const { b64, modelUsado } = await generateWithResilience(model, prompt, usaPro);
    // Custo segue o modelo que de fato gerou a imagem, não o planejado — se
    // caiu pro fallback, o slide custou o preço do flash, não do pro.
    const cost = modelUsado === MODEL_PRO_IMAGE ? COST_IMAGE_PRO : COST_IMAGE_FLASH;

    const path = `${slide.post_id}/${slide.id}_raw_${Date.now()}.png`;
    const signedUrl = await uploadSigned(admin, path, base64ToBytes(b64), "image/png");

    await admin
      .from("imagery_slides")
      .update({ raw_image_url: signedUrl, status: "ready", error_message: null })
      .eq("id", slideId);

    await admin.from("imagery_logs").insert({
      slide_id: slideId,
      post_id: slide.post_id,
      step: "generate_image",
      provider: "google_direct",
      model: modelUsado,
      prompt_excerpt: prompt.slice(0, 500),
      response_summary: {
        image_type: imageType,
        template_id: slide.template_id,
        modelo_planejado: model,
        // Só diverge do planejado quando o pro caiu 503 duas vezes e o
        // fallback pro flash foi acionado.
        fallback_usado: modelUsado !== model,
      },
      custo_usd: cost,
      duracao_ms: Date.now() - t0,
      success: true,
    });

    return new Response(
      JSON.stringify({ url: signedUrl, model: modelUsado, cost, source: "gerado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("imagery-generate-image error:", msg);
    if (slideId) {
      try {
        const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
        await admin
          .from("imagery_slides")
          .update({ status: "failed", error_message: msg.slice(0, 500) })
          .eq("id", slideId);
      } catch {
        /* ignore */
      }
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
