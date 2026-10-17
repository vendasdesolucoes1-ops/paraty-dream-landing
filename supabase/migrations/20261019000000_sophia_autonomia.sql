-- Autonomia da Sophia, escolhida no painel (Configurações → Agente IA →
-- Comportamento). Define quais ferramentas ela recebe e o que os sinais podem
-- fazer (ver _shared/ferramentas-sophia.ts):
--   responder  — conversa e pré-qualifica, sem mexer no CRM
--   qualificar — + grava os dados do lead e marca como qualificado
--   agendar    — + vê horários livres e marca a visita (padrão, igual a antes)

alter table public.ai_agents
  add column if not exists autonomia text not null default 'agendar'
    check (autonomia in ('responder', 'qualificar', 'agendar'));

notify pgrst, 'reload schema';
