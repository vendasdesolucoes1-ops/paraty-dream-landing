-- Disparo: contato pulado (opt-out, sem interesse) deixa de contar como
-- "Enviado" no histórico da campanha (auditoria R-05).
alter table public.disparos_itens drop constraint if exists disparos_itens_status_check;
alter table public.disparos_itens
  add constraint disparos_itens_status_check
  check (status in ('pendente', 'enviado', 'falhou', 'pulado'));

alter table public.disparos_campanha
  add column if not exists total_pulado int not null default 0;
