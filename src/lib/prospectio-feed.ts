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

/** Atualiza sozinho a cada minuto — publicação e métricas aparecem sem recarregar. */
export function useFeedProspectio() {
  return useQuery({
    queryKey: chaveFeedProspectio,
    queryFn: async (): Promise<FeedProspectio> => {
      const { data, error } = await supabase.functions.invoke("prospectio-feed", { method: "GET" });
      if (error) throw new Error("Não foi possível carregar a agenda do Prospectio.");
      if (data?.error) throw new ErroFeedProspectio(data.error, data.configurado === false);
      return data as FeedProspectio;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    // Token recusado ou ausente não melhora tentando de novo.
    retry: (falhas, erro) => !(erro instanceof ErroFeedProspectio) && falhas < 2,
  });
}

export const chaveConfigProspectio = ["prospectio-config"] as const;

export function useConfigProspectio() {
  return useQuery({
    queryKey: chaveConfigProspectio,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracoes")
        .select("chave, valor")
        .in("chave", ["prospectio_feed_token", "prospectio_feed_url"]);
      if (error) throw error;
      const map = Object.fromEntries((data ?? []).map((row) => [row.chave, row.valor ?? ""]));
      return {
        token: map.prospectio_feed_token ?? "",
        url: map.prospectio_feed_url ?? "",
      };
    },
  });
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
