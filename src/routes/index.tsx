import { createFileRoute } from "@tanstack/react-router";
import { ParallaxLanding } from "@/components/landing/ParallaxLanding";
import "@/components/landing/parallax.css";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Moradas de Paraty — Loteamento Residencial Sophia Saíde" },
      {
        name: "description",
        content:
          "Lotes residenciais e comerciais de 250 a 450 m², a 9 minutos do Centro Histórico de Paraty. Natureza, infraestrutura entregue e financiamento direto.",
      },
      { property: "og:title", content: "Moradas de Paraty" },
      {
        property: "og:description",
        content: "Da Mata Atlântica ao seu novo lugar de viver em Paraty.",
      },
      {
        property: "og:image",
        content: "/moradas/scroll-01-natureza-loteamento.webp",
      },
      {
        name: "twitter:image",
        content: "/moradas/scroll-01-natureza-loteamento.webp",
      },
    ],
    links: [
      {
        rel: "preload",
        href: "/moradas/scroll-01-natureza-loteamento.webp",
        as: "image",
        type: "image/webp",
      },
    ],
  }),
  component: ParallaxLanding,
});
