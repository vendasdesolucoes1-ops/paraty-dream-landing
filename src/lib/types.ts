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

export type LeadOrigem = "lp" | "whatsapp" | "indicacao" | "instagram";
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

export interface Vendedor {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  posicao_round_robin: number;
  created_at: string;
}

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
