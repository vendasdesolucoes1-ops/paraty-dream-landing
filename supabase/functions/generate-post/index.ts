// Supabase Edge Function — generates an Instagram post (copy + image) for
// Moradas de Paraty.
//   copy  → OpenAI gpt-4o-mini
//   image → Lovable AI Gateway (google/gemini-2.5-flash-image), persisted to
//           the marketing-imagens Storage bucket.
//
// The image provider returns base64 rather than a URL, so nothing here depends
// on a third-party link that can expire — the URL handed back to the frontend
// always points at Supabase Storage.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const IMAGE_MODEL = "google/gemini-2.5-flash-image";
const IMAGE_COST_USD = 0.015;
const COPY_MODEL = "gpt-4o-mini";
// gpt-4o-mini on a prompt this size costs a fraction of a cent; kept as a flat
// estimate so the spend report stays complete rather than exact.
const COPY_COST_USD = 0.0002;

const SYSTEM_PROMPT =
  "Você é especialista em marketing imobiliário de alto padrão para loteamentos. Escreva posts para Instagram do Moradas de Paraty — um loteamento residencial premium em Paraty/RJ, a 9 minutos do Centro Histórico, entre a Mata Atlântica e o Rio Perequê-açu. Tom: sofisticado, inspirador, próximo. Nunca use exclamações excessivas nem linguagem de vendedor agressivo.";

interface GeneratePostBody {
  tema: string;
  tipo_lote?: string;
  metragem?: string;
  valor?: string;
  destaque?: string;
}

interface CopyResult {
  titulo: string;
  copy: string;
  hashtags: string[];
}

interface ImageResult {
  b64: string;
  model: string;
  cost: number;
}

function buildUserPrompt(body: GeneratePostBody): string {
  const parts = [`Crie um post para Instagram sobre: ${body.tema}.`];
  if (body.tipo_lote) parts.push(`Tipo de lote: ${body.tipo_lote}.`);
  if (body.metragem) parts.push(`Metragem: ${body.metragem} m².`);
  if (body.valor) parts.push(`Valor a partir de: ${body.valor}.`);
  if (body.destaque) parts.push(`Destaque especial: ${body.destaque}.`);
  parts.push(
    "Retorne JSON com: { titulo, copy (máx 300 chars), hashtags (array com 15 hashtags relevantes) }",
  );
  return parts.join(" ");
}

// Photographic direction matching the real aerial material used on the landing
// page: lush green, mountains, clear sky, architecture-magazine editorial tone.
// Explicitly steers away from illustration/render looks.
function buildImagePrompt(body: GeneratePostBody): string {
  const subject = [`Tema do post: ${body.tema}.`];
  if (body.tipo_lote) subject.push(`Lote ${body.tipo_lote.toLowerCase()}.`);
  if (body.metragem) subject.push(`Terreno de aproximadamente ${body.metragem} m².`);
  if (body.destaque) subject.push(`Destaque: ${body.destaque}.`);

  return [
    "Fotografia editorial realista de um loteamento residencial de alto padrão em Paraty, Rio de Janeiro, Brasil.",
    subject.join(" "),
    "Cenário: Mata Atlântica exuberante e densa em verde vibrante, montanhas da Serra do Mar ao fundo, rio de água limpa cruzando a paisagem, céu azul limpo com poucas nuvens, luz natural de sol pleno ou final de tarde dourada.",
    "Estilo: fotografia aérea ou de nível do solo, lente grande angular, cores naturais e saturação equilibrada, aparência de revista de arquitetura e paisagismo, composição limpa e aspiracional, sensação de amplitude e tranquilidade.",
    "Formato quadrado 1:1, com área de respiro na parte inferior para sobreposição de texto.",
    "Obrigatoriamente fotorrealista. Não gerar ilustração, desenho, cartoon, render 3D artificial, arte digital estilizada, moldura ou texto embutido na imagem.",
  ].join(" ");
}

async function generateCopy(body: GeneratePostBody): Promise<CopyResult> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: COPY_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(body) },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`${COPY_MODEL}: ${response.status} ${txt.slice(0, 200)}`);
  }

  const result = await response.json();
  const raw: string = result.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);

  return {
    titulo: parsed.titulo ?? "",
    copy: parsed.copy ?? "",
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
  };
}

async function generateImage(prompt: string): Promise<ImageResult> {
  const model = IMAGE_MODEL;
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`${model}: ${resp.status} ${txt.slice(0, 200)}`);
  }
  const j = await resp.json();
  const dataUrl = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!dataUrl) throw new Error(`${model}: sem imagem retornada`);
  const b64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, "");
  return { b64, model, cost: IMAGE_COST_USD };
}

async function uploadImagemGerada(postId: string, b64: string): Promise<string> {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const path = `${postId}_${Date.now()}.png`;
  const { error } = await supabase.storage.from("marketing-imagens").upload(path, bin, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("marketing-imagens").getPublicUrl(path);
  return data.publicUrl;
}

interface LogEntry {
  post_id: string | null;
  step: string;
  provider: string;
  model: string | null;
  prompt_excerto: string;
  custo_usd: number;
  duracao_ms: number;
  success: boolean;
  error_message: string | null;
}

// Logging must never take the request down with it — a failed audit write is
// reported to the function logs and swallowed.
async function writeLogs(entries: LogEntry[]) {
  if (entries.length === 0) return;
  const { error } = await supabase.from("marketing_logs").insert(entries);
  if (error) console.error("marketing_logs insert failed:", error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: GeneratePostBody = await req.json();
    if (!body.tema) throw new Error("tema is required");

    // Generated up front so the storage object can be named before the
    // posts_marketing row exists.
    const postId = crypto.randomUUID();
    const imagePrompt = buildImagePrompt(body);

    const copyStarted = Date.now();
    const imageStarted = Date.now();

    // allSettled, not all: a failure on one side must not discard the other
    // side's already-billed result.
    const [copySettled, imageSettled] = await Promise.allSettled([
      generateCopy(body).then((r) => ({ result: r, ms: Date.now() - copyStarted })),
      generateImage(imagePrompt).then((r) => ({ result: r, ms: Date.now() - imageStarted })),
    ]);

    const copyResult = copySettled.status === "fulfilled" ? copySettled.value.result : null;
    let imagemUrl = "";
    let uploadError: string | null = null;

    if (imageSettled.status === "fulfilled") {
      try {
        imagemUrl = await uploadImagemGerada(postId, imageSettled.value.result.b64);
      } catch (err) {
        uploadError = String(err);
      }
    }

    // Both halves failed — nothing worth persisting.
    if (!copyResult && !imagemUrl) {
      await writeLogs([
        {
          post_id: null,
          step: "copy",
          provider: "openai",
          model: COPY_MODEL,
          prompt_excerto: body.tema.slice(0, 200),
          custo_usd: copySettled.status === "fulfilled" ? COPY_COST_USD : 0,
          duracao_ms: copySettled.status === "fulfilled" ? copySettled.value.ms : 0,
          success: copySettled.status === "fulfilled",
          error_message:
            copySettled.status === "rejected" ? String(copySettled.reason).slice(0, 500) : null,
        },
        {
          post_id: null,
          step: "imagem",
          provider: "lovable_gateway",
          model: IMAGE_MODEL,
          prompt_excerto: imagePrompt.slice(0, 200),
          custo_usd: imageSettled.status === "fulfilled" ? IMAGE_COST_USD : 0,
          duracao_ms: imageSettled.status === "fulfilled" ? imageSettled.value.ms : 0,
          success: false,
          error_message: (imageSettled.status === "rejected"
            ? String(imageSettled.reason)
            : (uploadError ?? "falha desconhecida")
          ).slice(0, 500),
        },
      ]);

      console.error("generate-post: both copy and image failed", {
        copy: copySettled.status === "rejected" ? copySettled.reason : null,
        image: imageSettled.status === "rejected" ? imageSettled.reason : uploadError,
      });

      return new Response(
        JSON.stringify({ error: "Não foi possível gerar o post. Tente novamente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // The row is written here, not in the frontend: marketing_logs.post_id has
    // an FK to posts_marketing, so the post must exist before the logs land.
    // This also makes the record atomic with the generation that was paid for.
    const { error: insertError } = await supabase.from("posts_marketing").insert({
      id: postId,
      titulo: copyResult?.titulo ?? "",
      copy_texto: copyResult?.copy ?? "",
      hashtags: copyResult?.hashtags.join(" ") ?? "",
      imagem_url: imagemUrl,
      status: "rascunho",
    });
    if (insertError) throw new Error(`posts_marketing insert: ${insertError.message}`);

    await writeLogs([
      {
        post_id: postId,
        step: "copy",
        provider: "openai",
        model: COPY_MODEL,
        prompt_excerto: body.tema.slice(0, 200),
        custo_usd: copySettled.status === "fulfilled" ? COPY_COST_USD : 0,
        duracao_ms: copySettled.status === "fulfilled" ? copySettled.value.ms : 0,
        success: copySettled.status === "fulfilled",
        error_message:
          copySettled.status === "rejected" ? String(copySettled.reason).slice(0, 500) : null,
      },
      {
        post_id: postId,
        step: "imagem",
        provider: "lovable_gateway",
        model: IMAGE_MODEL,
        prompt_excerto: imagePrompt.slice(0, 200),
        // The gateway bills on generation, so a successful generation whose
        // upload failed still cost money and is recorded as such.
        custo_usd: imageSettled.status === "fulfilled" ? IMAGE_COST_USD : 0,
        duracao_ms: imageSettled.status === "fulfilled" ? imageSettled.value.ms : 0,
        success: !!imagemUrl,
        error_message: imagemUrl
          ? null
          : (imageSettled.status === "rejected"
              ? String(imageSettled.reason)
              : (uploadError ?? "falha desconhecida")
            ).slice(0, 500),
      },
    ]);

    return new Response(
      JSON.stringify({
        post_id: postId,
        titulo: copyResult?.titulo ?? "",
        copy: copyResult?.copy ?? "",
        hashtags: copyResult?.hashtags ?? [],
        imagem_url: imagemUrl,
        parcial: !copyResult || !imagemUrl,
        falhou: !copyResult ? "copy" : !imagemUrl ? "imagem" : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("generate-post error:", error);
    return new Response(
      JSON.stringify({ error: "Não foi possível gerar o post. Tente novamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
