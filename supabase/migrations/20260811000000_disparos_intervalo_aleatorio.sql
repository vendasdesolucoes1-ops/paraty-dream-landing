-- Intervalo aleatório entre mensagens no disparador em massa.
--
-- Intervalo fixo é um padrão: 15s exatos entre cada envio, centenas de vezes,
-- é justamente o tipo de assinatura que a detecção de automação do WhatsApp
-- procura. Com faixa, cada envio sorteia um valor e o ritmo deixa de ser
-- previsível.
--
-- As duas colunas são NULLABLE de propósito: campanha com intervalo fixo
-- continua gravando só `intervalo_segundos`, e as campanhas antigas (todas)
-- ficam com NULL nas novas — nada a retroalimentar, nada a migrar.
--
-- `intervalo_segundos` continua NOT NULL e passa a guardar o valor EFETIVO
-- MÉDIO da campanha: com intervalo fixo é o próprio valor; com faixa, a média
-- dos sorteios que de fato aconteceram. Assim o histórico antigo não quebra e
-- a coluna continua respondendo "qual foi o ritmo dessa campanha" sem precisar
-- saber se ela usou faixa ou não.

alter table public.disparos_campanha
  add column if not exists intervalo_min_segundos integer,
  add column if not exists intervalo_max_segundos integer;

-- Faixa inválida (mínimo maior que o máximo) é erro de programação, não de
-- uso — a UI impede. A constraint existe para o banco não aceitar em silêncio
-- caso alguém escreva por fora.
alter table public.disparos_campanha
  drop constraint if exists disparos_campanha_intervalo_faixa_check;

alter table public.disparos_campanha
  add constraint disparos_campanha_intervalo_faixa_check
  check (
    (intervalo_min_segundos is null and intervalo_max_segundos is null)
    or (
      intervalo_min_segundos is not null
      and intervalo_max_segundos is not null
      and intervalo_min_segundos > 0
      and intervalo_min_segundos <= intervalo_max_segundos
    )
  );

comment on column public.disparos_campanha.intervalo_min_segundos is
  'Piso da faixa quando a campanha usou intervalo aleatório. NULL = intervalo fixo.';
comment on column public.disparos_campanha.intervalo_max_segundos is
  'Teto da faixa quando a campanha usou intervalo aleatório. NULL = intervalo fixo.';
comment on column public.disparos_campanha.intervalo_segundos is
  'Intervalo efetivo médio da campanha: o próprio valor quando fixo, a média dos sorteios quando aleatório.';

notify pgrst, 'reload schema';
