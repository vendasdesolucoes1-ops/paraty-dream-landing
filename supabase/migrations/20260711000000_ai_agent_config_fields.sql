-- Adds the extra behavior fields the "Agente IA" settings panel edits
-- (Geral tab). No new tables/edge functions — ai-agent-chat is unchanged.

alter table ai_agents
  add column if not exists modelo text not null default 'gpt-4o-mini'
    check (modelo in ('gpt-4o-mini', 'gpt-4o')),
  add column if not exists mensagem_boas_vindas text,
  add column if not exists tom_voz text not null default 'profissional'
    check (tom_voz in ('profissional', 'amigavel', 'formal', 'informal')),
  add column if not exists usar_emojis boolean not null default false,
  add column if not exists ser_breve boolean not null default true;
