-- Quando a Sophia passou o lead ao corretor.
--
-- A partir daí ela não faz mais perguntas de qualificação nem convida para
-- visita nesta conversa: só tira dúvidas (sophia.ts, encaminhar-corretor.ts).
alter table public.leads add column if not exists encaminhado_em timestamptz;

comment on column public.leads.encaminhado_em is
  'Quando a Sophia passou o lead ao corretor; daí em diante ela só tira dúvidas.';
