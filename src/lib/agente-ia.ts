// Configurações da Sophia que vivem em `configuracoes` e as pendências para
// ligá-la. Mesmo formato que as funções leem (supabase/functions/_shared/sophia.ts
// e a função pendencias_ativar_ia()) — mudar um é mudar o outro.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ConsultorResponsavel, MaterialAgenteTipo } from "@/lib/types";

export const CHAVE_CONSULTOR = "consultor_responsavel";
export const CHAVE_PAUSA_HUMANA = "pausa_humana_horas";
export const PAUSA_HUMANA_PADRAO = 24;
export const PAUSA_HUMANA_MIN = 1;
export const PAUSA_HUMANA_MAX = 720;

export const CHAVE_PENDENCIAS = ["pendencias-ativar-ia"] as const;
export const CHAVE_CONFIG_OPERACAO = ["config", "operacao-sophia"] as const;

/** Prefixo do erro que o banco levanta ao tentar ligar a IA com pendências. */
export const PREFIXO_ERRO_ATIVACAO = "A IA não pode ser ligada ainda:";

export function soDigitos(telefone: string | null | undefined): string {
  return (telefone ?? "").replace(/\D/g, "");
}

export function telefoneValido(telefone: string | null | undefined): boolean {
  return soDigitos(telefone).length >= 10;
}

/** Lê o JSON salvo; null quando vazio, quebrado ou sem nome. */
export function lerConsultor(valor: string | null | undefined): ConsultorResponsavel | null {
  try {
    const obj = JSON.parse(valor ?? "");
    if (!obj || typeof obj !== "object") return null;
    const nome = typeof obj.nome === "string" ? obj.nome.trim() : "";
    if (!nome) return null;
    return {
      vendedor_id: typeof obj.vendedor_id === "string" && obj.vendedor_id ? obj.vendedor_id : null,
      nome,
      telefone: typeof obj.telefone === "string" ? obj.telefone : "",
    };
  } catch {
    return null;
  }
}

export function lerPausaHumana(valor: string | null | undefined): number {
  const n = Number(String(valor ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < PAUSA_HUMANA_MIN || n > PAUSA_HUMANA_MAX) {
    return PAUSA_HUMANA_PADRAO;
  }
  return Math.round(n);
}

/** Consultor responsável e pausa por atendimento humano, numa leitura só. */
export function useConfigOperacao() {
  return useQuery({
    queryKey: CHAVE_CONFIG_OPERACAO,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracoes")
        .select("chave, valor")
        .in("chave", [CHAVE_CONSULTOR, CHAVE_PAUSA_HUMANA]);
      if (error) throw error;
      const porChave = new Map((data ?? []).map((c) => [c.chave, c.valor]));
      return {
        consultor: lerConsultor(porChave.get(CHAVE_CONSULTOR)),
        pausaHoras: lerPausaHumana(porChave.get(CHAVE_PAUSA_HUMANA)),
      };
    },
  });
}

/** O que falta para ligar a Sophia (vazio = pode ligar). */
export async function buscarPendenciasAtivacao(): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC fora dos tipos gerados
  const { data, error } = await (supabase.rpc as any)("pendencias_ativar_ia");
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown[]).map(String).filter(Boolean) : [];
}

export function usePendenciasAtivacao(habilitado = true) {
  return useQuery({
    queryKey: CHAVE_PENDENCIAS,
    queryFn: buscarPendenciasAtivacao,
    enabled: habilitado,
  });
}

/** Mensagem legível de um erro do Supabase (PostgrestError nem sempre é Error). */
export function mensagemDeErro(e: unknown, padrao: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = String((e as { message: unknown }).message ?? "").trim();
    if (m) return m;
  }
  return padrao;
}

// ---------------------------------------------------------------------------
// Materiais

export const BUCKET_MATERIAIS = "materiais-agente";

export const TIPOS_MATERIAL: {
  valor: MaterialAgenteTipo;
  rotulo: string;
  aceita: string;
}[] = [
  { valor: "localizacao", rotulo: "Localização (pin)", aceita: "" },
  { valor: "foto", rotulo: "Foto", aceita: "image/*" },
  { valor: "video_drone", rotulo: "Vídeo de drone", aceita: "video/*" },
  { valor: "video_lote", rotulo: "Vídeo do lote demarcado", aceita: "video/*" },
  { valor: "pdf", rotulo: "PDF", aceita: "application/pdf" },
];

export function rotuloTipoMaterial(tipo: string): string {
  return TIPOS_MATERIAL.find((t) => t.valor === tipo)?.rotulo ?? tipo;
}

/** Nome de arquivo sem acento, espaço nem caractere que o Storage recusa. */
export function nomeArquivoSeguro(nome: string): string {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return limpo.slice(-80) || "arquivo";
}
