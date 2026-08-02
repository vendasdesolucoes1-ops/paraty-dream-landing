// Imagery Engine — Compositor de slide
// Recebe { slide_id } → monta a arte final 1080x1350 (Satori → SVG → PNG via resvg),
// sobe no bucket privado e grava a URL assinada em final_png_url.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import satori from "https://esm.sh/satori@0.10.13";
import { initWasm, Resvg } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";
import { corsHeaders } from "../_shared/cors.ts";
import { guardInternalCall } from "../_shared/internal-auth.ts";
import { uploadSigned } from "../_shared/imagery.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Retrato 4:5 (1080x1350) — o formato que o feed do Instagram usa de fato.
// Toda imagem de fundo entra com objectFit "cover" nessas dimensões, então
// foto do acervo em outra proporção é enquadrada por center crop
// automaticamente, sem precisar de tratamento à parte.
const WIDTH = 1080;
const HEIGHT = 1350;

// Paleta do projeto convertida de OKLCH para hex. FOREST_DEEP/FOREST_SOFT
// espelham src/styles.css --forest-deep/--forest (azul-marinho desde a troca
// de cor) — este arquivo é uma função Deno separada do frontend, sem acesso
// às variáveis CSS, então os hex têm que ser mantidos em sincronia manual.
const FOREST_DEEP = "#00234C";
const FOREST_SOFT = "#123E6A";
const IVORY = "#F7F3EA";
const SAND = "#E4D9C3";
const GOLD = "#C9A24A";

const FONT_URLS = {
  displayRegular:
    "https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-400-normal.ttf",
  displayBold:
    "https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-600-normal.ttf",
  body: "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf",
  bodyMedium: "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-500-normal.ttf",
  // Anton: peso único 400, já ultra-bold/condensado por natureza — é o
  // "título de cartaz" pedido, sem precisar carregar pesos extras.
  impact: "https://cdn.jsdelivr.net/fontsource/fonts/anton@latest/latin-400-normal.ttf",
};

let fontCache: Array<{ name: string; data: ArrayBuffer; weight: number; style: "normal" }> | null =
  null;
let wasmReady = false;

async function loadFonts() {
  if (fontCache) return fontCache;
  const [dr, db, b, bm, im] = await Promise.all(
    Object.values(FONT_URLS).map((u) => fetch(u).then((r) => r.arrayBuffer())),
  );
  fontCache = [
    { name: "Display", data: dr, weight: 400, style: "normal" },
    { name: "Display", data: db, weight: 600, style: "normal" },
    { name: "Body", data: b, weight: 400, style: "normal" },
    { name: "Body", data: bm, weight: 500, style: "normal" },
    { name: "Impact", data: im, weight: 400, style: "normal" },
  ];
  return fontCache;
}

async function toDataUrl(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Falha ao baixar imagem do slide (${resp.status})`);
  const buf = new Uint8Array(await resp.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  const mime = resp.headers.get("content-type")?.split(";")[0] ?? "image/png";
  return `data:${mime};base64,${btoa(bin)}`;
}

// deno-lint-ignore no-explicit-any
type Node = any;

const goldRule = (width: number): Node => ({
  type: "div",
  props: { style: { width, height: 3, backgroundColor: GOLD } },
});

function coverImage(src: string, extra: Record<string, unknown> = {}): Node {
  return {
    type: "img",
    props: { src, width: WIDTH, height: HEIGHT, style: { objectFit: "cover", ...extra } },
  };
}

function scrim(from: string, to: string): Node {
  return {
    type: "div",
    props: {
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: WIDTH,
        height: HEIGHT,
        backgroundImage: `linear-gradient(to bottom, ${from}, ${to})`,
      },
    },
  };
}

function headlineSize(text: string): number {
  const len = text.length;
  if (len <= 14) return 108;
  if (len <= 24) return 88;
  if (len <= 38) return 72;
  return 60;
}

// "Comercial" = tem selos e/ou cta gerados pelo planner. Não existe campo de
// pilar temático gravado — esta é a distinção que fica disponível sem mexer
// no schema: um post de pilar Lugar puro naturalmente não pede selo/CTA no
// slide, então continua no modo limpo atual.
function isComercial(selos: string[], cta: string | null): boolean {
  return selos.length > 0 || !!cta;
}

// Não existe asset de logo (imagem) em nenhum lugar do projeto — _shared/brand.ts
// é só texto de tom de voz, sem arquivo visual. A "marca aplicada num canto" vira
// este selo tipográfico: friso dourado + wordmark em versalete, o mesmo padrão que
// já existia isolado em T01_CAPA, agora reutilizável em qualquer template.
function wordmark(color: string = SAND): Node {
  return {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", gap: 14 },
      children: [
        goldRule(72),
        {
          type: "div",
          props: {
            style: {
              fontFamily: "Body",
              fontSize: 18,
              letterSpacing: 5,
              color,
              textTransform: "uppercase",
            },
            children: "Moradas de Paraty",
          },
        },
      ],
    },
  };
}

// Grid 2x2 (ou linha, se ≤2) de badges curtos. "✓" num círculo dourado
// translúcido faz de ícone — Satori não carrega ícone SVG externo sem mais uma
// fonte/asset, e o glifo já lê bem em 1080px.
function selosGrid(selos: string[]): Node {
  const items = selos.slice(0, 4);
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: 14,
        width: 720,
      },
      children: items.map((selo) => ({
        type: "div",
        props: {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 10,
            backgroundColor: "rgba(247,243,234,0.12)",
            border: `1px solid rgba(201,162,74,0.55)`,
            borderRadius: 999,
            padding: "10px 20px 10px 14px",
          },
          children: [
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  backgroundColor: GOLD,
                  color: FOREST_DEEP,
                  fontFamily: "Body",
                  fontWeight: 500,
                  fontSize: 16,
                },
                children: "✓",
              },
            },
            {
              type: "div",
              props: {
                style: { fontFamily: "Body", fontWeight: 500, fontSize: 24, color: IVORY },
                children: selo,
              },
            },
          ],
        },
      })),
    },
  };
}

// Mesma badge, tonalidade invertida para fundo claro (templateCena usa
// painel ivory) — texto/borda em forest, sem o fundo translúcido que só
// funciona sobre imagem/fundo escuro.
function selosDarkOnLight(selos: string[]): Node {
  const items = selos.slice(0, 4);
  return {
    type: "div",
    props: {
      style: { display: "flex", flexWrap: "wrap", gap: 12, width: 420 },
      children: items.map((selo) => ({
        type: "div",
        props: {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 8,
            backgroundColor: "rgba(0,35,76,0.06)",
            border: `1px solid rgba(201,162,74,0.7)`,
            borderRadius: 999,
            padding: "8px 16px 8px 10px",
          },
          children: [
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  backgroundColor: GOLD,
                  color: FOREST_DEEP,
                  fontFamily: "Body",
                  fontWeight: 500,
                  fontSize: 13,
                },
                children: "✓",
              },
            },
            {
              type: "div",
              props: {
                style: { fontFamily: "Body", fontWeight: 500, fontSize: 19, color: FOREST_DEEP },
                children: selo,
              },
            },
          ],
        },
      })),
    },
  };
}

// Faixa dourada de rodapé com o CTA real do planner — generaliza a faixa que
// já existia (hardcoded) só no T05_CTA.
function ctaBand(cta: string): Node {
  return {
    type: "div",
    props: {
      style: {
        position: "absolute",
        bottom: 0,
        left: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: WIDTH,
        height: 108,
        backgroundColor: GOLD,
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              fontFamily: "Body",
              fontWeight: 500,
              fontSize: 30,
              letterSpacing: 3,
              color: FOREST_DEEP,
              textTransform: "uppercase",
            },
            children: cta,
          },
        },
      ],
    },
  };
}

function templateCapa(
  image: string,
  headline: string,
  sub: string | undefined,
  selos: string[],
  cta: string | null,
): Node {
  const comercial = isComercial(selos, cta);
  // Modo comercial ganha faixa de CTA no rodapé — o bloco de texto sobe para
  // não colidir com ela.
  const bottomOffset = comercial && cta ? 88 + 108 : 88;

  return {
    type: "div",
    props: {
      style: { display: "flex", position: "relative", width: WIDTH, height: HEIGHT },
      children: [
        coverImage(image, { position: "absolute", top: 0, left: 0 }),
        scrim(`rgba(0,35,76,0.08)`, `rgba(0,35,76,0.88)`),
        {
          type: "div",
          props: {
            style: { display: "flex", position: "absolute", top: 72, left: 80 },
            children: [wordmark()],
          },
        },
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              bottom: bottomOffset,
              left: 80,
              width: WIDTH - 160,
              display: "flex",
              flexDirection: "column",
              gap: 22,
            },
            children: [
              {
                type: "div",
                props: {
                  style: comercial
                    ? {
                        fontFamily: "Impact",
                        fontSize: headlineSize(headline) * 0.86,
                        lineHeight: 1,
                        color: IVORY,
                        textTransform: "uppercase",
                      }
                    : {
                        fontFamily: "Display",
                        fontWeight: 600,
                        fontSize: headlineSize(headline),
                        lineHeight: 1.05,
                        color: IVORY,
                      },
                  children: headline,
                },
              },
              ...(sub
                ? [
                    {
                      type: "div",
                      props: {
                        style: {
                          fontFamily: "Body",
                          fontSize: 30,
                          lineHeight: 1.4,
                          color: SAND,
                          maxWidth: 760,
                        },
                        children: sub,
                      },
                    },
                  ]
                : []),
              ...(selos.length > 0 ? [selosGrid(selos)] : []),
            ],
          },
        },
        ...(comercial && cta ? [ctaBand(cta)] : []),
      ],
    },
  };
}

function templateCena(
  image: string,
  headline: string,
  sub: string | undefined,
  selos: string[],
  cta: string | null,
): Node {
  const comercial = isComercial(selos, cta);
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        position: "relative",
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: IVORY,
      },
      children: [
        {
          type: "div",
          props: {
            style: { display: "flex", width: 594, height: HEIGHT, overflow: "hidden" },
            children: [
              {
                type: "img",
                props: { src: image, width: 594, height: HEIGHT, style: { objectFit: "cover" } },
              },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 26,
              width: 486,
              height: HEIGHT,
              padding: 64,
              paddingBottom: comercial && cta ? 64 + 108 : 64,
            },
            children: [
              wordmark(FOREST_SOFT),
              {
                type: "div",
                props: {
                  style: comercial
                    ? {
                        fontFamily: "Impact",
                        fontSize: 52,
                        lineHeight: 1.02,
                        color: FOREST_DEEP,
                        textTransform: "uppercase",
                      }
                    : {
                        fontFamily: "Display",
                        fontWeight: 600,
                        fontSize: 62,
                        lineHeight: 1.08,
                        color: FOREST_DEEP,
                      },
                  children: headline,
                },
              },
              ...(sub
                ? [
                    {
                      type: "div",
                      props: {
                        style: {
                          fontFamily: "Body",
                          fontSize: 26,
                          lineHeight: 1.5,
                          color: FOREST_SOFT,
                        },
                        children: sub,
                      },
                    },
                  ]
                : []),
              ...(selos.length > 0 ? [selosDarkOnLight(selos)] : []),
            ],
          },
        },
        ...(comercial && cta ? [ctaBand(cta)] : []),
      ],
    },
  };
}

function templateDado(
  image: string,
  headline: string,
  sub: string | undefined,
  selos: string[],
  cta: string | null,
): Node {
  const comercial = isComercial(selos, cta);
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        position: "relative",
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: FOREST_DEEP,
      },
      children: [
        {
          type: "div",
          props: {
            style: { display: "flex", width: 540, height: HEIGHT, overflow: "hidden" },
            children: [
              {
                type: "img",
                props: { src: image, width: 540, height: HEIGHT, style: { objectFit: "cover" } },
              },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 28,
              width: 540,
              height: HEIGHT,
              padding: 64,
              paddingBottom: comercial && cta ? 64 + 108 : 64,
            },
            children: [
              wordmark(),
              {
                type: "div",
                props: {
                  style: {
                    fontFamily: comercial ? "Impact" : "Display",
                    fontWeight: comercial ? 400 : 600,
                    fontSize: headline.length <= 8 ? 132 : 92,
                    lineHeight: 1,
                    color: GOLD,
                    textTransform: comercial ? "uppercase" : "none",
                  },
                  children: headline,
                },
              },
              goldRule(88),
              ...(sub
                ? [
                    {
                      type: "div",
                      props: {
                        style: { fontFamily: "Body", fontSize: 28, lineHeight: 1.5, color: SAND },
                        children: sub,
                      },
                    },
                  ]
                : []),
              ...(selos.length > 0 ? [selosGrid(selos)] : []),
            ],
          },
        },
        ...(comercial && cta ? [ctaBand(cta)] : []),
      ],
    },
  };
}

function templateLista(
  image: string,
  headline: string,
  sub: string | undefined,
  _selos: string[],
  cta: string | null,
): Node {
  const parts = (sub ?? "").split("||").map((p) => p.split("|"));
  const items = parts
    .filter((p) => p.length >= 2)
    .slice(0, 3)
    .map((p, i) => ({
      n: (p[0] ?? String(i + 1).padStart(2, "0")).trim(),
      titulo: (p[1] ?? "").trim(),
      apoio: (p[2] ?? "").trim(),
    }));

  return {
    type: "div",
    props: {
      style: { display: "flex", position: "relative", width: WIDTH, height: HEIGHT },
      children: [
        coverImage(image, { position: "absolute", top: 0, left: 0 }),
        scrim("rgba(31,58,46,0.92)", "rgba(31,58,46,0.97)"),
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: 0,
              left: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 44,
              width: WIDTH,
              height: HEIGHT,
              padding: 88,
              paddingBottom: cta ? 88 + 108 : 88,
            },
            children: [
              wordmark(),
              {
                type: "div",
                props: {
                  style: { display: "flex", flexDirection: "column", gap: 18 },
                  children: [
                    goldRule(72),
                    {
                      type: "div",
                      props: {
                        style: {
                          fontFamily: "Display",
                          fontWeight: 600,
                          fontSize: 66,
                          lineHeight: 1.08,
                          color: IVORY,
                        },
                        children: headline,
                      },
                    },
                  ],
                },
              },
              ...items.map((item) => ({
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    flexDirection: "row",
                    gap: 26,
                    alignItems: "flex-start",
                  },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: {
                          fontFamily: "Display",
                          fontWeight: 600,
                          fontSize: 44,
                          color: GOLD,
                          width: 78,
                        },
                        children: item.n,
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: { display: "flex", flexDirection: "column", gap: 8, width: 730 },
                        children: [
                          {
                            type: "div",
                            props: {
                              style: {
                                fontFamily: "Body",
                                fontWeight: 500,
                                fontSize: 34,
                                color: IVORY,
                              },
                              children: item.titulo,
                            },
                          },
                          ...(item.apoio
                            ? [
                                {
                                  type: "div",
                                  props: {
                                    style: {
                                      fontFamily: "Body",
                                      fontSize: 25,
                                      lineHeight: 1.45,
                                      color: SAND,
                                    },
                                    children: item.apoio,
                                  },
                                },
                              ]
                            : []),
                        ],
                      },
                    },
                  ],
                },
              })),
            ],
          },
        },
        ...(cta ? [ctaBand(cta)] : []),
      ],
    },
  };
}

function templateCta(
  image: string,
  headline: string,
  sub: string | undefined,
  selos: string[],
  cta: string | null,
): Node {
  return {
    type: "div",
    props: {
      style: { display: "flex", position: "relative", width: WIDTH, height: HEIGHT },
      children: [
        coverImage(image, { position: "absolute", top: 0, left: 0 }),
        scrim("rgba(31,58,46,0.35)", "rgba(31,58,46,0.9)"),
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: 0,
              left: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              gap: 28,
              width: WIDTH,
              height: HEIGHT,
              padding: 96,
            },
            children: [
              goldRule(96),
              {
                type: "div",
                props: {
                  style: {
                    fontFamily: "Display",
                    fontWeight: 600,
                    fontSize: 78,
                    lineHeight: 1.08,
                    color: IVORY,
                    textAlign: "center",
                  },
                  children: headline,
                },
              },
              ...(sub
                ? [
                    {
                      type: "div",
                      props: {
                        style: {
                          fontFamily: "Body",
                          fontSize: 28,
                          lineHeight: 1.5,
                          color: SAND,
                          textAlign: "center",
                          maxWidth: 720,
                        },
                        children: sub,
                      },
                    },
                  ]
                : []),
              ...(selos.length > 0 ? [selosGrid(selos)] : []),
            ],
          },
        },
        ctaBand(cta ?? "Moradas de Paraty · Fale com a gente"),
      ],
    },
  };
}

function buildTree(
  templateId: string,
  image: string,
  headline: string,
  sub: string | undefined,
  selos: string[],
  cta: string | null,
): Node {
  switch (templateId) {
    case "T02_CENA":
      return templateCena(image, headline, sub, selos, cta);
    case "T03_DADO":
      return templateDado(image, headline, sub, selos, cta);
    case "T04_LISTA":
      return templateLista(image, headline, sub, selos, cta);
    case "T05_CTA":
      return templateCta(image, headline, sub, selos, cta);
    default:
      return templateCapa(image, headline, sub, selos, cta);
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
    const { data: slide } = await admin
      .from("imagery_slides")
      .select("*")
      .eq("id", slideId)
      .single();
    if (!slide) throw new Error("Slide não encontrado");

    await admin.from("imagery_slides").update({ status: "composing" }).eq("id", slideId);

    const sourceUrl = slide.treated_image_url || slide.raw_image_url;
    if (!sourceUrl) throw new Error("Slide sem imagem base");

    const copy = (slide.copy_data ?? {}) as {
      headline?: string;
      sub_text?: string;
      selos?: string[];
      cta?: string | null;
    };
    const headline = copy.headline ?? "Moradas de Paraty";
    const sub = copy.sub_text ?? undefined;
    const selos = Array.isArray(copy.selos) ? copy.selos.filter(Boolean) : [];
    const cta = copy.cta ?? null;

    const [fonts, imageData] = await Promise.all([loadFonts(), toDataUrl(sourceUrl)]);
    const tree = buildTree(slide.template_id, imageData, headline, sub, selos, cta);

    const svg = await satori(tree, { width: WIDTH, height: HEIGHT, fonts });

    if (!wasmReady) {
      await initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm"));
      wasmReady = true;
    }
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } });
    const png = resvg.render().asPng();

    const path = `${slide.post_id}/${slide.id}_final_${Date.now()}.png`;
    const finalUrl = await uploadSigned(admin, path, png, "image/png");

    await admin
      .from("imagery_slides")
      .update({ final_png_url: finalUrl, status: "ready", error_message: null })
      .eq("id", slideId);

    await admin.from("imagery_logs").insert({
      slide_id: slideId,
      post_id: slide.post_id,
      step: "compose",
      provider: "satori+resvg",
      response_summary: { template: slide.template_id },
      duracao_ms: Date.now() - t0,
      success: true,
    });

    return new Response(JSON.stringify({ url: finalUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("imagery-compose-slide error:", msg);
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
