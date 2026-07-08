// Supabase Edge Function — publishes a generated post to Instagram via the
// Meta Graph API (two-step: create media container, then publish it), and
// updates posts_marketing with the result.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const GRAPH_API_BASE = "https://graph.facebook.com/v19.0";

interface PublishBody {
  post_id: string;
  copy_texto: string;
  hashtags: string[] | string;
  imagem_url: string;
  instagram_token: string;
  instagram_user_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let postId: string | undefined;

  try {
    const body: PublishBody = await req.json();
    const { post_id, copy_texto, hashtags, imagem_url, instagram_token, instagram_user_id } =
      body;
    postId = post_id;

    if (!instagram_token || !instagram_user_id) {
      throw new Error("Instagram token/user id not configured");
    }

    const hashtagsText = Array.isArray(hashtags) ? hashtags.join(" ") : (hashtags ?? "");
    const caption = `${copy_texto}\n\n${hashtagsText}`;

    // 1. Create the media container
    const mediaResponse = await fetch(`${GRAPH_API_BASE}/${instagram_user_id}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: imagem_url,
        caption,
        access_token: instagram_token,
      }),
    });
    const mediaResult = await mediaResponse.json();
    if (!mediaResponse.ok || !mediaResult.id) {
      throw new Error(`Instagram media creation error: ${JSON.stringify(mediaResult)}`);
    }

    // 2. Publish the container
    const publishResponse = await fetch(
      `${GRAPH_API_BASE}/${instagram_user_id}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: mediaResult.id,
          access_token: instagram_token,
        }),
      },
    );
    const publishResult = await publishResponse.json();
    if (!publishResponse.ok || !publishResult.id) {
      throw new Error(`Instagram publish error: ${JSON.stringify(publishResult)}`);
    }

    // 3. Update the post record
    await supabase
      .from("posts_marketing")
      .update({
        status: "publicado",
        instagram_post_id: publishResult.id,
        publicado_em: new Date().toISOString(),
      })
      .eq("id", post_id);

    return new Response(
      JSON.stringify({ success: true, instagram_post_id: publishResult.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    if (postId) {
      await supabase.from("posts_marketing").update({ status: "erro" }).eq("id", postId);
    }

    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
