// Imagery Engine — Publicação no Instagram (Graph API)
// Imagem única: /media + /media_publish.
// Carrossel: um container por slide (is_carousel_item), depois o container pai.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v21.0";

async function graphPost(path: string, params: Record<string, string>) {
  const resp = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const json = await resp.json();
  if (!resp.ok || json.error) {
    throw new Error(json?.error?.message ?? `Graph API: ${resp.status}`);
  }
  return json;
}

async function waitContainer(containerId: string, token: string) {
  for (let i = 0; i < 30; i++) {
    const resp = await fetch(
      `${GRAPH}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`,
    );
    const json = await resp.json();
    if (json.status_code === "FINISHED") return;
    if (json.status_code === "ERROR" || json.status_code === "EXPIRED") {
      throw new Error(`Instagram rejeitou a mídia: ${json.status ?? json.status_code}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Tempo esgotado aguardando o Instagram processar a mídia");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let postId: string | undefined;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    postId = body?.post_id;
    if (!postId) {
      return new Response(JSON.stringify({ error: "post_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: config } = await admin
      .from("configuracoes")
      .select("chave, valor")
      .in("chave", ["instagram_token", "instagram_user_id"]);
    const cfg = Object.fromEntries((config ?? []).map((c) => [c.chave, c.valor ?? ""]));
    const token = cfg.instagram_token;
    const igUserId = cfg.instagram_user_id;
    if (!token || !igUserId) {
      throw new Error("Configure o token e o User ID do Instagram em Marketing → Configurações.");
    }

    const { data: post } = await admin
      .from("imagery_posts")
      .select("*")
      .eq("id", postId)
      .single();
    if (!post) throw new Error("Post não encontrado");

    const { data: slides } = await admin
      .from("imagery_slides")
      .select("id, slide_n, final_png_url")
      .eq("post_id", postId)
      .order("slide_n");

    const images = (slides ?? []).filter((s) => !!s.final_png_url);
    if (images.length === 0) throw new Error("Nenhuma arte pronta para publicar");

    const copy = (post.copy_data ?? {}) as { caption?: string; hashtags?: string[] };
    const hashtags = Array.isArray(copy.hashtags) ? copy.hashtags : [];
    const caption = (post.ig_caption ?? body.caption ?? copy.caption ?? "") +
      (hashtags.length ? `\n\n${hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}` : "");

    await admin.from("imagery_posts").update({ ig_status: "publishing", ig_error: null }).eq(
      "id",
      postId,
    );

    let creationId: string;

    if (images.length === 1) {
      const container = await graphPost(`${igUserId}/media`, {
        image_url: images[0].final_png_url!,
        caption,
        access_token: token,
      });
      await waitContainer(container.id, token);
      creationId = container.id;
    } else {
      const childIds: string[] = [];
      for (const slide of images.slice(0, 10)) {
        const child = await graphPost(`${igUserId}/media`, {
          image_url: slide.final_png_url!,
          is_carousel_item: "true",
          access_token: token,
        });
        await waitContainer(child.id, token);
        childIds.push(child.id);
      }
      const parent = await graphPost(`${igUserId}/media`, {
        media_type: "CAROUSEL",
        children: childIds.join(","),
        caption,
        access_token: token,
      });
      await waitContainer(parent.id, token);
      creationId = parent.id;
    }

    const published = await graphPost(`${igUserId}/media_publish`, {
      creation_id: creationId,
      access_token: token,
    });

    let permalink: string | null = null;
    try {
      const permResp = await fetch(
        `${GRAPH}/${published.id}?fields=permalink&access_token=${encodeURIComponent(token)}`,
      );
      const permJson = await permResp.json();
      permalink = permJson.permalink ?? null;
    } catch { /* opcional */ }

    await admin
      .from("imagery_posts")
      .update({
        ig_status: "published",
        ig_media_id: published.id,
        ig_permalink: permalink,
        ig_caption: caption,
        ig_published_at: new Date().toISOString(),
        ig_error: null,
        status: "published",
      })
      .eq("id", postId);

    await admin.from("imagery_logs").insert({
      post_id: postId,
      step: "publish_instagram",
      provider: "meta_graph",
      response_summary: { media_id: published.id, slides: images.length },
      success: true,
    });

    return new Response(
      JSON.stringify({ success: true, media_id: published.id, permalink }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("imagery-publish-instagram error:", msg);
    if (postId) {
      await admin
        .from("imagery_posts")
        .update({ ig_status: "failed", ig_error: msg.slice(0, 500) })
        .eq("id", postId);
      await admin.from("imagery_logs").insert({
        post_id: postId,
        step: "publish_instagram",
        provider: "meta_graph",
        success: false,
        error_message: msg.slice(0, 500),
      });
    }
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
