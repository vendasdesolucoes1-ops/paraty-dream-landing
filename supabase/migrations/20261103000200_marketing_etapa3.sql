-- Marketing, etapa 3: carga histórica que termina sozinha, progresso visível e
-- alcance orgânico do Instagram separado do alcance da conta.
--
-- 1. meta_anuncios.creative_ig_media_id: o post do Instagram que cada anúncio
--    impulsiona (creative.effective_instagram_media_id).
-- 2. marketing_ig_resumo: nova métrica `alcance_organico` (soma do alcance dos
--    posts, reels e stories publicados no período que NÃO viraram anúncio) e
--    nenhuma comparação quando o período anterior não tem todos os dias.
-- 3. marketing_progresso_carga(): progresso das cargas históricas (Ads em
--    meses, Instagram em semanas) para a aba Integração.
-- 4. Cron: continua as cargas de 10 em 10 min enquanto não concluírem e marca
--    como erro execuções que ficaram "executando" (Edge Function encerrada pelo
--    limite de tempo antes de registrar o fim).
--
-- Tudo idempotente.

-- ---------------------------------------------------------------------------
-- 1. Post impulsionado por anúncio
-- ---------------------------------------------------------------------------
alter table public.meta_anuncios add column if not exists creative_ig_media_id text;
create index if not exists meta_anuncios_creative_ig_media_idx
  on public.meta_anuncios (creative_ig_media_id) where creative_ig_media_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Resumo do Instagram com alcance orgânico e comparação só com base completa
-- ---------------------------------------------------------------------------
create or replace function public.marketing_ig_resumo(p_inicio date, p_fim date)
returns table (
  metrica         text,
  valor           numeric,
  valor_anterior  numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with lim as (
    select p_inicio - (p_fim - p_inicio + 1) as ant_inicio,
           p_inicio - 1 as ant_fim,
           (p_fim - p_inicio + 1) as dias
  ),
  -- O período anterior só serve de base se tiver todos os dias com dado
  -- (a carga histórica pode ainda não ter chegado lá).
  base as (
    select (select count(distinct i.data) from public.ig_insights_conta_diario i, lim
             where i.metrica = 'reach' and i.data between lim.ant_inicio and lim.ant_fim)
           >= (select dias from lim) as completa
  ),
  impulsionados as (
    select distinct a.creative_ig_media_id as id
      from public.meta_anuncios a
     where a.creative_ig_media_id is not null
  ),
  organicos as (
    select (m."timestamp" at time zone 'America/Sao_Paulo')::date as dia, mi.valor
      from public.ig_midias m
      join public.ig_midia_insights mi on mi.midia_id = m.id and mi.metrica = 'reach'
     where m.id not in (select id from impulsionados)
  )
  select i.metrica,
         sum(i.valor) filter (where i.data between p_inicio and p_fim),
         case when (select completa from base)
              then sum(i.valor) filter (where i.data between lim.ant_inicio and lim.ant_fim) end
    from public.ig_insights_conta_diario i, lim
   where i.data between lim.ant_inicio and p_fim
     and p_fim >= p_inicio
   group by i.metrica
  union all
  select 'alcance_organico',
         coalesce((select sum(o.valor) from organicos o where o.dia between p_inicio and p_fim), 0),
         case when (select completa from base)
              then coalesce((select sum(o.valor) from organicos o, lim
                              where o.dia between lim.ant_inicio and lim.ant_fim), 0) end
   where p_fim >= p_inicio
     and exists (select 1 from public.ig_midias)
  union all
  -- Seguidores: foto mais recente até o fim do período e até o fim do anterior.
  select 'seguidores',
         (select c.followers_count from public.ig_conta_diaria c
           where c.data <= p_fim order by c.data desc limit 1),
         (select c.followers_count from public.ig_conta_diaria c
           where c.data <= p_inicio - 1 order by c.data desc limit 1)
   where exists (select 1 from public.ig_conta_diaria)
$$;

-- ---------------------------------------------------------------------------
-- 3. Progresso das cargas históricas
-- ---------------------------------------------------------------------------
-- Ads: uma janela por mês, do mais recente para o limite (37 meses).
-- Instagram: uma janela por semana (o total vem salvo no estado).
create or replace function public.marketing_progresso_carga()
returns table (
  carga        text,      -- 'ads' | 'instagram'
  unidade      text,      -- 'meses' | 'semanas'
  concluido    boolean,
  feitas       integer,
  total        integer,
  proximo_ate  date,
  limite       date,
  atualizado_em timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select 'ads', 'meses',
         coalesce((e.valor->>'concluido')::boolean, false),
         coalesce((e.valor->>'janelasConcluidas')::int, 0),
         case when coalesce((e.valor->>'concluido')::boolean, false)
              then coalesce((e.valor->>'janelasConcluidas')::int, 0)
              else coalesce((e.valor->>'janelasConcluidas')::int, 0)
                   + (extract(year from age(date_trunc('month', (e.valor->>'proximoAte')::date),
                                            date_trunc('month', (e.valor->>'limite')::date)))::int * 12
                      + extract(month from age(date_trunc('month', (e.valor->>'proximoAte')::date),
                                               date_trunc('month', (e.valor->>'limite')::date)))::int)
                   + 1
         end,
         case when coalesce((e.valor->>'concluido')::boolean, false) then null
              else (e.valor->>'proximoAte')::date end,
         (e.valor->>'limite')::date,
         e.atualizado_em
    from public.meta_sync_estado e
   where e.chave = 'ads_historico'
  union all
  select 'instagram', 'semanas',
         coalesce((e.valor->>'concluido')::boolean, false),
         coalesce((e.valor->>'semanasConcluidas')::int, 0),
         coalesce((e.valor->>'semanasTotal')::int, 0),
         case when coalesce((e.valor->>'concluido')::boolean, false) then null
              else (e.valor->>'proximoAte')::date end,
         (e.valor->>'limite')::date,
         e.atualizado_em
    from public.meta_sync_estado e
   where e.chave = 'ig_historico'
$$;

revoke all on function public.marketing_progresso_carga() from public, anon;
grant execute on function public.marketing_progresso_carga() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Cron: continuar as cargas até concluir; limpar execuções travadas
-- ---------------------------------------------------------------------------
do $$
declare
  j record;
begin
  for j in
    select * from (values
      ('meta-carga-ads',       '*/10 * * * *',   'meta-backfill?escopo=ads',       'ads_historico'),
      ('meta-carga-instagram', '5-59/10 * * * *', 'meta-backfill?escopo=instagram', 'ig_historico')
    ) as t(nome, agenda, caminho, chave)
  loop
    if exists (select 1 from cron.job where jobname = j.nome) then
      perform cron.unschedule(j.nome);
    end if;
    -- Só chama enquanto a carga não estiver concluída (sem estado = ainda não começou).
    perform cron.schedule(
      j.nome,
      j.agenda,
      format($cron$
        select net.http_post(
          url     := 'https://mokgxoygbjvtketoyraf.supabase.co/functions/v1/%s',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-internal-secret', (
              select decrypted_secret from vault.decrypted_secrets
               where name = 'cron_meta_secret' limit 1
            )
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 150000
        )
         where not coalesce((select (valor->>'concluido')::boolean
                               from public.meta_sync_estado where chave = %L), false);
      $cron$, j.caminho, j.chave)
    );
  end loop;

  if exists (select 1 from cron.job where jobname = 'meta-limpa-execucoes') then
    perform cron.unschedule('meta-limpa-execucoes');
  end if;
  perform cron.schedule(
    'meta-limpa-execucoes',
    '*/15 * * * *',
    $cron$
      update public.meta_sync_execucoes
         set status = 'erro',
             finalizado_em = now(),
             erro = 'Interrompida pelo limite de tempo da Edge Function; a próxima execução continua de onde parou.'
       where status = 'executando'
         and iniciado_em < now() - interval '10 minutes';
    $cron$
  );
end $$;

notify pgrst, 'reload schema';
