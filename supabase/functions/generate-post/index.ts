// Supabase Edge Function — generates an Instagram post (copy + image) for
// Moradas de Paraty using OpenAI (gpt-4o-mini for copy, DALL-E 3 for image).

import { corsHeaders } from "../_shared/cors.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

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

async function generateCopy(body: GeneratePostBody): Promise<CopyResult> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(body) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI chat completion error: ${await response.text()}`);
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

async function generateImage(tema: string): Promise<string> {
  const prompt = `Luxury real estate Instagram post for 'Moradas de Paraty' residential development in Paraty Brazil. ${tema}. Premium nature photography style, Atlantic Forest, mountains, golden hour light. Text overlay space at bottom. Sophisticated, serene, high-end real estate aesthetic. 1:1 square format.`;

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      size: "1024x1024",
      quality: "standard",
      n: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI image generation error: ${await response.text()}`);
  }

  const result = await response.json();
  return result.data?.[0]?.url ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: GeneratePostBody = await req.json();
    if (!body.tema) throw new Error("tema is required");

    const [copyResult, imagemUrl] = await Promise.all([
      generateCopy(body),
      generateImage(body.tema),
    ]);

    return new Response(
      JSON.stringify({
        titulo: copyResult.titulo,
        copy: copyResult.copy,
        hashtags: copyResult.hashtags,
        imagem_url: imagemUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
