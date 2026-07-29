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

const NEGATIVE =
  "stock photo, people smiling at camera, silhouette couple at sunset, 3d render, illustration, cartoon, vector art, watermark, text overlay, letters, logos, oversaturated HDR, purple sky, tropical caribbean cliche, low quality, distorted hands, extra fingers, lens flare, heavy instagram filter";

function typeHint(imageType: string): string {
  switch (imageType) {
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

    if (!slide.needs_image || !slide.image_brief) {
      await admin.from("imagery_slides").update({ status: "ready" }).eq("id", slideId);
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("imagery_slides").update({ status: "generating" }).eq("id", slideId);

    const imageType = slide.image_type ?? "paisagem";
    const prompt = [
      slide.image_brief,
      typeHint(imageType),
      VISUAL_DIRECTION,
      "Square 1:1 composition. Leave calm negative space so elegant serif text can be placed over it.",
      `Avoid: ${NEGATIVE}`,
    ].join("\n\n");

    // O modelo caro fica só na capa (T01), que é o slide exibido no feed.
    const usaPro = isProTemplate(slide.template_id);
    const model = usaPro ? MODEL_PRO_IMAGE : MODEL_FLASH_IMAGE;
    const cost = usaPro ? COST_IMAGE_PRO : COST_IMAGE_FLASH;

    // API direta do Google (Generative Language). Difere do gateway em três
    // pontos: auth por x-goog-api-key, modelo no path, e a imagem volta em
    // candidates[].content.parts[].inlineData em vez de data[0].b64_json.
    const resp = await fetch(
      `${GOOGLE_AI_BASE}/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": GOOGLE_AI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
        signal: AbortSignal.timeout(90_000),
      },
    );

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`${model}: ${resp.status} ${txt.slice(0, 200)}`);
    }

    const json = await resp.json();
    // A resposta mistura partes de texto e de imagem; pegamos a primeira que
    // traga inlineData.
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const b64 = parts.find(
      (p: { inlineData?: { data?: string } }) => p?.inlineData?.data,
    )?.inlineData?.data;
    if (!b64) {
      const motivo = json.candidates?.[0]?.finishReason ?? json.promptFeedback?.blockReason ?? "";
      throw new Error(`${model}: nenhuma imagem retornada${motivo ? ` (${motivo})` : ""}`);
    }

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
      model,
      prompt_excerpt: prompt.slice(0, 500),
      response_summary: { image_type: imageType, template_id: slide.template_id },
      custo_usd: cost,
      duracao_ms: Date.now() - t0,
      success: true,
    });

    return new Response(JSON.stringify({ url: signedUrl, model, cost }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
      } catch { /* ignore */ }
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
