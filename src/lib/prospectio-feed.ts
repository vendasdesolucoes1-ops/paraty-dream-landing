// Agenda do Prospectio: posts que a agência agenda no Prospectio para o
// Instagram do Moradas, lidos pela edge function prospectio-feed.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tone } from "@/components/ds/pill";

export type StatusPostProspectio = "rascunho" | "agendado" | "publicando" | "publicado" | "falhou";

export interface MetricasProspectio {
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saved: number | null;
  shares: number | null;
  engajamento: number;
  atualizado_em: string;
  erro: string | null;
}

export interface PostProspectio {
  id: string;
  titulo: string | null;
  legenda: string;
  hashtags: string[];
  legenda_completa: string;
  plataforma: string;
  status: StatusPostProspectio;
  agendado_para: string | null;
  imagens: string[];
  erro_publicacao: string | null;
  instagram_media_id: string | null;
  instagram_permalink: string | null;
  metricas: MetricasProspectio | null;
  criado_em: string;
  atualizado_em: string;
}

export interface FeedProspectio {
  gerado_em: string;
  conta: { nome_empresa: string | null; instagram_username: string | null };
  posts: PostProspectio[];
}

export const STATUS_PROSPECTIO: Record<StatusPostProspectio, { label: string; tone: Tone }> = {
  rascunho: { label: "Rascunho", tone: "neutral" },
  agendado: { label: "Agendado", tone: "info" },
  publicando: { label: "Publicando", tone: "warning" },
  publicado: { label: "Publicado", tone: "success" },
  falhou: { label: "Falhou", tone: "danger" },
};

/** Erro de negócio da função (config ausente, token recusado) — a mensagem vai pra tela. */
export class ErroFeedProspectio extends Error {
  constructor(
    message: string,
    readonly naoConfigurado = false,
  ) {
    super(message);
  }
}

export const chaveFeedProspectio = ["prospectio-feed"] as const;

export const URL_PADRAO_PROSPECTIO = "https://prospectio.com.br/api/integracoes/marketing/posts";

/**
 * Busca o feed direto do Prospectio, com o token salvo em configuracoes
 * (chave sensível: só a gestão lê — a mesma que vê esta aba). O endpoint do
 * Prospectio libera CORS e não usa cookie; quem autentica é só o token.
 */
async function buscarFeed(): Promise<FeedProspectio> {
  const config = await lerConfigProspectio();
  if (!config.token) {
    throw new ErroFeedProspectio(
      "Cole o token do Prospectio em “Conexão com o Prospectio”, logo abaixo.",
      true,
    );
  }
  let resposta: Response;
  try {
    resposta = await fetch(config.url || URL_PADRAO_PROSPECTIO, {
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new Error("Não foi possível falar com o Prospectio agora.");
  }
  if (resposta.status === 401) {
    throw new ErroFeedProspectio(
      "O Prospectio recusou o token (revogado ou trocado). Gere um novo e cole abaixo.",
    );
  }
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok || !corpo?.ok) {
    throw new Error(corpo?.error ?? `O Prospectio não respondeu (HTTP ${resposta.status}).`);
  }
  return corpo as FeedProspectio;
}

/** Atualiza sozinho a cada minuto — publicação e métricas aparecem sem recarregar. */
export function useFeedProspectio() {
  return useQuery({
    queryKey: chaveFeedProspectio,
    queryFn: buscarFeed,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    // Token recusado ou ausente não melhora tentando de novo.
    retry: (falhas, erro) => !(erro instanceof ErroFeedProspectio) && falhas < 2,
  });
}

export const chaveConfigProspectio = ["prospectio-config"] as const;

async function lerConfigProspectio() {
  const { data, error } = await supabase
    .from("configuracoes")
    .select("chave, valor")
    .in("chave", ["prospectio_feed_token", "prospectio_feed_url"]);
  if (error) throw error;
  const map = Object.fromEntries((data ?? []).map((row) => [row.chave, row.valor ?? ""]));
  return {
    token: (map.prospectio_feed_token ?? "").trim(),
    url: (map.prospectio_feed_url ?? "").trim(),
  };
}

export function useConfigProspectio() {
  return useQuery({ queryKey: chaveConfigProspectio, queryFn: lerConfigProspectio });
}

const FUSO = "America/Sao_Paulo";

/** Chave do dia (AAAA-MM-DD) no fuso de Paraty, para agrupar a agenda. */
export function diaDoPost(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date(iso));
}

export function rotuloDia(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}

export function horaDoPost(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function dataHoraDoPost(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Agrupa por dia (fuso de Paraty) mantendo a ordem do feed; sem data vai para "Sem data". */
export function agruparPorDia(
  posts: PostProspectio[],
): { dia: string | null; posts: PostProspectio[] }[] {
  const grupos = new Map<string | null, PostProspectio[]>();
  for (const p of posts) {
    const dia = p.agendado_para ? diaDoPost(p.agendado_para) : null;
    const lista = grupos.get(dia);
    if (lista) lista.push(p);
    else grupos.set(dia, [p]);
  }
  return [...grupos.entries()].map(([dia, lista]) => ({ dia, posts: lista }));
}
