// Imagery Engine — Gerador de imagem
// Recebe { slide_id } → monta o prompt a partir do brief, gera a foto pelo
// Lovable AI Gateway, sobe no bucket privado e devolve URL assinada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { guardInternalCall } from "../_shared/internal-auth.ts";
import { VISUAL_DIRECTION } from "../_shared/brand.ts";
import { base64ToBytes, uploadSigned } from "../_shared/imagery.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    // Capa e paisagens usam o modelo de maior fidelidade; detalhes usam o rápido.
    const model = ["paisagem", "arquitetura", "agua"].includes(imageType)
      ? "google/gemini-3-pro-image"
      : "google/gemini-2.5-flash-image";
    const cost = model === "google/gemini-3-pro-image" ? 0.04 : 0.015;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`${model}: ${resp.status} ${txt.slice(0, 200)}`);
    }

    const json = await resp.json();
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error(`${model}: nenhuma imagem retornada`);

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
      provider: "lovable_gateway",
      model,
      prompt_excerpt: prompt.slice(0, 500),
      response_summary: { image_type: imageType },
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
