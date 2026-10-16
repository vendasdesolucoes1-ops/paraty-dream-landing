-- Janelas de horário de visita e status "a_confirmar" (issue #56).
--
-- Antes a Sophia confirmava qualquer horário que o lead aceitasse, sem olhar
-- em que dias há visita nem a agenda do vendedor.
--
-- Agora:
--   configuracoes.janelas_visita → JSON editável no painel (Configurações):
--     {"dias":[{"dia":6,"inicio":"09:00","fim":"16:00"},...],
--      "duracao_min":60,"fuso":"America/Sao_Paulo"}
--     dia: 0 = domingo … 6 = sábado. Leitura e escrita seguem a RLS de
--     configuracoes (gestão escreve; a chave não é sensível).
--   visitas.status ganha 'a_confirmar': visita pedida fora da janela ou em
--     conflito com outra do mesmo vendedor. Entra na agenda, mas um humano
--     confirma o horário com o lead.

insert into public.configuracoes (chave, valor)
values (
  'janelas_visita',
  '{"dias":[{"dia":1,"inicio":"09:00","fim":"17:00"},{"dia":2,"inicio":"09:00","fim":"17:00"},{"dia":3,"inicio":"09:00","fim":"17:00"},{"dia":4,"inicio":"09:00","fim":"17:00"},{"dia":5,"inicio":"09:00","fim":"17:00"},{"dia":6,"inicio":"09:00","fim":"16:00"}],"duracao_min":60,"fuso":"America/Sao_Paulo"}'
)
on conflict (chave) do nothing;

alter table public.visitas drop constraint if exists visitas_status_check;
alter table public.visitas
  add constraint visitas_status_check
  check (status in ('agendada', 'a_confirmar', 'confirmada', 'realizada', 'cancelada', 'no_show'));

-- Conferência de conflito: visitas do vendedor perto de um horário.
create index if not exists idx_visitas_vendedor_data_hora
  on public.visitas (vendedor_id, data_hora);
