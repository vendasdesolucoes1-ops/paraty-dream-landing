export type LoteTipo = "residencial" | "comercial";
export type LoteStatus = "disponivel" | "reservado" | "vendido";

export interface Lote {
  id: string;
  numero_lote: string;
  quadra: string | null;
  metragem: number | null;
  tipo: LoteTipo | null;
  valor: number | null;
  status: LoteStatus;
  posicao_x: number | null;
  posicao_y: number | null;
  observacoes: string | null;
  created_at: string;
}

export type LeadOrigem = "lp" | "whatsapp" | "indicacao" | "instagram" | "google_maps";
export type LeadStatus =
  | "novo"
  | "qualificado"
  | "agendado"
  | "visitou"
  | "proposta"
  | "fechado"
  | "perdido";

export interface Lead {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  metragem_interesse: number | null;
  tipo_lote_interesse: string | null;
  origem: LeadOrigem | null;
  status_crm: LeadStatus;
  lote_interesse_id: string | null;
  vendedor_id: string | null;
  score: number;
  created_at: string;
  updated_at: string;
}

export type ProfileRole = "admin" | "gestor" | "vendedor";

export interface Profile {
  id: string;
  nome: string | null;
  email: string | null;
  role: ProfileRole;
  vendedor_id: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export const PROFILE_ROLE_OPTIONS: { value: ProfileRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "gestor", label: "Gestor" },
  { value: "vendedor", label: "Vendedor" },
];

export interface Vendedor {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  posicao_round_robin: number;
  profile_id: string | null;
  created_at: string;
}

export type InteracaoTipo = "whatsapp" | "ligacao" | "email" | "visita" | "nota" | "sistema";

export interface Interacao {
  id: string;
  lead_id: string | null;
  tipo: InteracaoTipo | null;
  conteudo: string | null;
  canal: string | null;
  created_at: string;
}

export type DocumentoCategoria =
  | "institucional"
  | "contrato"
  | "documento_pessoal"
  | "proposta"
  | "outro";

export interface Documento {
  id: string;
  titulo: string;
  categoria: DocumentoCategoria;
  lead_id: string | null;
  storage_path: string;
  tipo_arquivo: string;
  tamanho_bytes: number | null;
  uploaded_by: string | null;
  tags: string[] | null;
  observacoes: string | null;
  created_at: string;
}

export interface DocumentoWithLead extends Documento {
  lead: Pick<Lead, "id" | "nome"> | null;
}

export const DOCUMENTO_CATEGORIA_OPTIONS: { value: DocumentoCategoria; label: string }[] = [
  { value: "institucional", label: "Institucional" },
  { value: "contrato", label: "Contrato" },
  { value: "documento_pessoal", label: "Documento Pessoal" },
  { value: "proposta", label: "Proposta" },
  { value: "outro", label: "Outro" },
];

export const LEAD_STATUS_COLUMNS: { value: LeadStatus; label: string }[] = [
  { value: "novo", label: "Novo" },
  { value: "qualificado", label: "Qualificado" },
  { value: "agendado", label: "Agendado" },
  { value: "visitou", label: "Visitou" },
  { value: "proposta", label: "Proposta" },
  { value: "fechado", label: "Fechado" },
  { value: "perdido", label: "Perdido" },
];

export const LEAD_ORIGEM_OPTIONS: { value: LeadOrigem; label: string }[] = [
  { value: "lp", label: "Landing Page" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "indicacao", label: "Indicação" },
  { value: "instagram", label: "Instagram" },
];

export const LOTE_TIPO_OPTIONS: { value: LoteTipo; label: string }[] = [
  { value: "residencial", label: "Residencial" },
  { value: "comercial", label: "Comercial" },
];

export const LOTE_STATUS_OPTIONS: { value: LoteStatus; label: string }[] = [
  { value: "disponivel", label: "Disponível" },
  { value: "reservado", label: "Reservado" },
  { value: "vendido", label: "Vendido" },
];

export type VisitaStatus = "agendada" | "confirmada" | "realizada" | "cancelada" | "no_show";

export interface Visita {
  id: string;
  lead_id: string;
  vendedor_id: string | null;
  data_hora: string;
  status: VisitaStatus;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VisitaWithRelations extends Visita {
  lead: Pick<Lead, "id" | "nome" | "telefone"> | null;
  vendedor: Pick<Vendedor, "id" | "nome"> | null;
}

export const VISITA_STATUS_OPTIONS: { value: VisitaStatus; label: string }[] = [
  { value: "agendada", label: "Agendada" },
  { value: "confirmada", label: "Confirmada" },
  { value: "realizada", label: "Realizada" },
  { value: "no_show", label: "No-show" },
  { value: "cancelada", label: "Cancelada" },
];

export interface WhatsappInstance {
  id: string;
  instance_name: string;
  api_url: string;
  api_key: string;
  status: string;
  qr_code: string | null;
  qr_code_expires_at: string | null;
  created_at: string;
}

export type AiAgentModelo = "gpt-4o-mini" | "gpt-4o";
export type AiAgentTomVoz = "profissional" | "amigavel" | "formal" | "informal";

export interface AiAgent {
  id: string;
  name: string;
  instance_id: string | null;
  is_active: boolean;
  system_prompt: string | null;
  transfer_keywords: string[] | null;
  transfer_to_human_enabled: boolean;
  modelo: AiAgentModelo;
  mensagem_boas_vindas: string | null;
  tom_voz: AiAgentTomVoz;
  usar_emojis: boolean;
  ser_breve: boolean;
  created_at: string;
}

export type PostMarketingStatus = "rascunho" | "publicado" | "agendado" | "erro";

export interface PostMarketing {
  id: string;
  titulo: string | null;
  copy_texto: string;
  hashtags: string | null;
  imagem_url: string | null;
  status: PostMarketingStatus;
  instagram_post_id: string | null;
  publicado_em: string | null;
  created_at: string;
}

export interface WhatsappMessage {
  id: string;
  instance_id: string | null;
  contact_id: string | null;
  lead_id: string | null;
  remote_jid: string | null;
  message_id: string | null;
  from_me: boolean;
  message_type: string | null;
  content: string | null;
  status: string | null;
  created_at: string;
}
