-- Marketing: leitura dos dados da integração Meta para o painel.
--
-- Funções de agregação usadas pelas telas Visão geral, Anúncios, Instagram e
-- Integração (src/lib/marketing-meta.ts). "O banco conta, o navegador mostra":
-- as somas por período saem prontas daqui em vez de o navegador baixar milhares
-- de linhas diárias.
--
-- Todas são SECURITY INVOKER: rodam com as permissões de quem chama, então o
-- RLS das tabelas meta_* / ig_* (leitura só da gestão) vale aqui também. Um
-- vendedor que chamar recebe zeros e listas vazias, nunca dados.
--
-- Datas: dias do calendário (as de Ads no fuso da conta de anúncios, as do
-- Instagram em São Paulo — hoje o mesmo fuso).
--
-- Alcance (reach) NÃO é somável entre dias nem entre anúncios (a mesma pessoa
-- conta de novo). As funções devolvem a soma dos alcances diários com o nome
-- `alcance_soma`; a tela o apresenta como aproximado.

-- ---------------------------------------------------------------------------
-- 0. media_url nas mídias do Instagram (foto do post de imagem/carrossel)
-- ---------------------------------------------------------------------------
-- thumbnail_url só existe para vídeo. A URL da Meta é assinada e expira em
-- alguns dias; o sync diário a renova para os posts dos últimos 30 dias e a
-- tela cai para um marcador quando a imagem não carrega.
alter table public.ig_midias add column if not exists media_url text;

-- ---------------------------------------------------------------------------
-- 1. Ads: resumo do período e do período anterior de mesmo tamanho
-- ---------------------------------------------------------------------------
create or replace function public.marketing_ads_resumo(p_inicio date, p_fim date)
returns table (
  periodo          text,      -- 'atual' | 'anterior'
  inicio           date,
  fim              date,
  moeda            text,
  investimento     numeric,
  impressoes       bigint,
  alcance_soma     bigint,
  cliques          bigint,
  cliques_link     bigint,
  leads            bigint,
  mensagens        bigint,
  compras          bigint,
  valor_compras    numeric,
  reservas         bigint,
  anuncios_com_gasto integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with periodos as (
    select 'atual'::text as periodo, p_inicio as inicio, p_fim as fim
    union all
    select 'anterior', p_inicio - (p_fim - p_inicio + 1), p_inicio - 1
  )
  select p.periodo, p.inicio, p.fim,
         (select c.moeda from public.meta_conta_anuncios c order by c.sincronizado_em desc limit 1),
         coalesce(sum(i.spend), 0),
         coalesce(sum(i.impressions), 0)::bigint,
         coalesce(sum(i.reach), 0)::bigint,
         coalesce(sum(i.clicks), 0)::bigint,
         coalesce(sum(i.inline_link_clicks), 0)::bigint,
         coalesce(sum(i.leads), 0)::bigint,
         coalesce(sum(i.mensagens_iniciadas), 0)::bigint,
         coalesce(sum(i.compras), 0)::bigint,
         coalesce(sum(i.valor_compras), 0),
         coalesce(sum(i.reservas), 0)::bigint,
         count(distinct i.ad_id) filter (where i.spend > 0)::integer
    from periodos p
    left join public.meta_insights_diarios i on i.data between p.inicio and p.fim
   where p_fim >= p_inicio
   group by p.periodo, p.inicio, p.fim
   order by p.periodo desc   -- 'atual' primeiro
$$;

-- ---------------------------------------------------------------------------
-- 2. Ads: série diária (conta inteira ou uma campanha/conjunto/anúncio)
-- ---------------------------------------------------------------------------
-- Dias sem veiculação voltam com zero (o gráfico não "pula" dias).
create or replace function public.marketing_ads_serie(
  p_inicio date,
  p_fim    date,
  p_nivel  text default null,   -- null | 'campanha' | 'conjunto' | 'anuncio'
  p_id     text default null
)
returns table (
  data          date,
  investimento  numeric,
  impressoes    bigint,
  cliques_link  bigint,
  leads         bigint,
  mensagens     bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select d::date,
         coalesce(sum(i.spend), 0),
         coalesce(sum(i.impressions), 0)::bigint,
         coalesce(sum(i.inline_link_clicks), 0)::bigint,
         coalesce(sum(i.leads), 0)::bigint,
         coalesce(sum(i.mensagens_iniciadas), 0)::bigint
    from generate_series(p_inicio::timestamp, p_fim::timestamp, interval '1 day') d
    left join public.meta_insights_diarios i
      on i.data = d::date
     and (
       p_id is null
       or (p_nivel = 'campanha' and i.campaign_id = p_id)
       or (p_nivel = 'conjunto' and i.adset_id = p_id)
       or (p_nivel = 'anuncio'  and i.ad_id = p_id)
     )
   where p_fim >= p_inicio and p_fim - p_inicio <= 1200
   group by d
   order by d
$$;

-- ---------------------------------------------------------------------------
-- 3. Ads: campanhas, conjuntos ou anúncios com as métricas do período
-- ---------------------------------------------------------------------------
-- Lista todos os itens do nível (inclusive pausados/arquivados sem gasto no
-- período, com zeros); a tela filtra por status e ordena.
create or replace function public.marketing_anuncios(p_inicio date, p_fim date, p_nivel text)
returns table (
  id                text,
  nome              text,
  status            text,
  effective_status  text,
  campanha_id       text,
  campanha_nome     text,
  conjunto_id       text,
  conjunto_nome     text,
  objetivo          text,
  thumbnail_url     text,
  titulo            text,
  corpo             text,
  orcamento_diario  bigint,
  orcamento_total   bigint,
  investimento      numeric,
  impressoes        bigint,
  alcance_soma      bigint,
  cliques           bigint,
  cliques_link      bigint,
  leads             bigint,
  mensagens         bigint,
  compras           bigint,
  reservas          bigint,
  criado_em         timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with m as (
    select i.ad_id, i.adset_id, i.campaign_id, i.spend, i.impressions, i.reach, i.clicks,
           i.inline_link_clicks, i.leads, i.mensagens_iniciadas, i.compras, i.reservas
      from public.meta_insights_diarios i
     where i.data between p_inicio and p_fim
  )
  select c.id, c.name, c.status, c.effective_status,
         c.id, c.name, null::text, null::text,
         c.objective, null::text, null::text, null::text,
         c.daily_budget, c.lifetime_budget,
         coalesce(sum(m.spend), 0), coalesce(sum(m.impressions), 0)::bigint,
         coalesce(sum(m.reach), 0)::bigint, coalesce(sum(m.clicks), 0)::bigint,
         coalesce(sum(m.inline_link_clicks), 0)::bigint, coalesce(sum(m.leads), 0)::bigint,
         coalesce(sum(m.mensagens_iniciadas), 0)::bigint, coalesce(sum(m.compras), 0)::bigint,
         coalesce(sum(m.reservas), 0)::bigint, c.created_time
    from public.meta_campanhas c
    left join m on m.campaign_id = c.id
   where p_nivel = 'campanha'
   group by c.id
  union all
  select s.id, s.name, s.status, s.effective_status,
         s.campaign_id, c.name, s.id, s.name,
         c.objective, null, null, null,
         s.daily_budget, s.lifetime_budget,
         coalesce(sum(m.spend), 0), coalesce(sum(m.impressions), 0)::bigint,
         coalesce(sum(m.reach), 0)::bigint, coalesce(sum(m.clicks), 0)::bigint,
         coalesce(sum(m.inline_link_clicks), 0)::bigint, coalesce(sum(m.leads), 0)::bigint,
         coalesce(sum(m.mensagens_iniciadas), 0)::bigint, coalesce(sum(m.compras), 0)::bigint,
         coalesce(sum(m.reservas), 0)::bigint, s.created_time
    from public.meta_conjuntos s
    left join public.meta_campanhas c on c.id = s.campaign_id
    left join m on m.adset_id = s.id
   where p_nivel = 'conjunto'
   group by s.id, c.id
  union all
  select a.id, a.name, a.status, a.effective_status,
         a.campaign_id, c.name, a.adset_id, s.name,
         c.objective, a.creative_thumbnail_url, a.creative_title, a.creative_body,
         null, null,
         coalesce(sum(m.spend), 0), coalesce(sum(m.impressions), 0)::bigint,
         coalesce(sum(m.reach), 0)::bigint, coalesce(sum(m.clicks), 0)::bigint,
         coalesce(sum(m.inline_link_clicks), 0)::bigint, coalesce(sum(m.leads), 0)::bigint,
         coalesce(sum(m.mensagens_iniciadas), 0)::bigint, coalesce(sum(m.compras), 0)::bigint,
         coalesce(sum(m.reservas), 0)::bigint, a.created_time
    from public.meta_anuncios a
    left join public.meta_campanhas c on c.id = a.campaign_id
    left join public.meta_conjuntos s on s.id = a.adset_id
    left join m on m.ad_id = a.id
   where p_nivel = 'anuncio'
   group by a.id, c.id, s.id
$$;

-- ---------------------------------------------------------------------------
-- 4. Ads: breakdowns (idade+gênero, plataforma+posição, região)
-- ---------------------------------------------------------------------------
create or replace function public.marketing_breakdown(
  p_inicio date,
  p_fim    date,
  p_tipo   text,                 -- 'idade_genero' | 'plataforma_posicao' | 'regiao'
  p_nivel  text default null,
  p_id     text default null
)
returns table (
  dim1          text,
  dim2          text,
  investimento  numeric,
  impressoes    bigint,
  cliques_link  bigint,
  leads         bigint,
  mensagens     bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select b.dim1, b.dim2,
         coalesce(sum(b.spend), 0),
         coalesce(sum(b.impressions), 0)::bigint,
         coalesce(sum(b.inline_link_clicks), 0)::bigint,
         coalesce(sum(b.leads), 0)::bigint,
         coalesce(sum(b.mensagens_iniciadas), 0)::bigint
    from public.meta_insights_breakdowns b
   where b.tipo = p_tipo
     and b.data between p_inicio and p_fim
     and (
       p_id is null
       or (p_nivel = 'campanha' and b.campaign_id = p_id)
       or (p_nivel = 'conjunto' and b.adset_id = p_id)
       or (p_nivel = 'anuncio'  and b.ad_id = p_id)
     )
   group by b.dim1, b.dim2
   order by 3 desc, 4 desc
$$;

-- ---------------------------------------------------------------------------
-- 5. Instagram: resumo por métrica (período atual e anterior) + seguidores
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
  with lim as (select p_inicio - (p_fim - p_inicio + 1) as ant_inicio, p_inicio - 1 as ant_fim)
  select i.metrica,
         sum(i.valor) filter (where i.data between p_inicio and p_fim),
         sum(i.valor) filter (where i.data between lim.ant_inicio and lim.ant_fim)
    from public.ig_insights_conta_diario i, lim
   where i.data between lim.ant_inicio and p_fim
     and p_fim >= p_inicio
   group by i.metrica
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
-- 6. Instagram: série diária (formato longo: data, métrica, valor)
-- ---------------------------------------------------------------------------
create or replace function public.marketing_ig_serie(p_inicio date, p_fim date)
returns table (
  data     date,
  metrica  text,
  valor    numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select i.data, i.metrica, i.valor
    from public.ig_insights_conta_diario i
   where i.data between p_inicio and p_fim
  union all
  select c.data, 'seguidores', c.followers_count
    from public.ig_conta_diaria c
   where c.data between p_inicio and p_fim and c.followers_count is not null
   order by 1, 2
$$;

-- ---------------------------------------------------------------------------
-- 7. Instagram: posts/reels/stories do período com as métricas em colunas
-- ---------------------------------------------------------------------------
create or replace function public.marketing_ig_midias(
  p_inicio date,
  p_fim    date,
  p_tipo   text default null    -- null | 'FEED' | 'REELS' | 'STORY'
)
returns table (
  id                  text,
  caption             text,
  media_type          text,
  media_product_type  text,
  permalink           text,
  publicado_em        timestamptz,
  imagem_url          text,
  curtidas            integer,
  comentarios         integer,
  alcance             numeric,
  views               numeric,
  salvos              numeric,
  compartilhamentos   numeric,
  interacoes          numeric,
  tempo_medio_ms      numeric,
  respostas           numeric,
  metricas_em         timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select m.id, m.caption, m.media_type, m.media_product_type, m.permalink, m."timestamp",
         coalesce(m.thumbnail_url, m.media_url),
         m.like_count, m.comments_count,
         max(x.valor) filter (where x.metrica = 'reach'),
         max(x.valor) filter (where x.metrica = 'views'),
         max(x.valor) filter (where x.metrica = 'saved'),
         max(x.valor) filter (where x.metrica = 'shares'),
         max(x.valor) filter (where x.metrica = 'total_interactions'),
         max(x.valor) filter (where x.metrica = 'ig_reels_avg_watch_time'),
         max(x.valor) filter (where x.metrica = 'replies'),
         max(x.capturado_em)
    from public.ig_midias m
    left join public.ig_midia_insights x on x.midia_id = m.id
   where m."timestamp" >= public.inicio_do_dia_brt(p_inicio)
     and m."timestamp" <  public.inicio_do_dia_brt(p_fim + 1)
     and (p_tipo is null or m.media_product_type = p_tipo)
   group by m.id
   order by m."timestamp" desc
   limit 300
$$;

-- ---------------------------------------------------------------------------
-- 8. Instagram: demografia da foto mais recente de cada breakdown
-- ---------------------------------------------------------------------------
create or replace function public.marketing_ig_demografia()
returns table (
  tipo   text,
  chave  text,
  valor  integer,
  data   date
)
language sql
stable
security invoker
set search_path = public
as $$
  select d.tipo, d.chave, d.valor, d.data
    from public.ig_demografia d
   where d.data = (select max(d2.data) from public.ig_demografia d2 where d2.tipo = d.tipo)
   order by d.tipo, d.valor desc
$$;

-- ---------------------------------------------------------------------------
-- 9. Integração: situação de cada job
-- ---------------------------------------------------------------------------
create or replace function public.marketing_status_integracao()
returns table (
  job                text,
  ultima_em          timestamptz,
  ultimo_status      text,
  ultimo_erro        text,
  codigo_erro        integer,
  registros          integer,
  detalhes           jsonb,
  ultimo_sucesso_em  timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (e.job)
         e.job, e.iniciado_em, e.status, e.erro, e.codigo_erro, e.registros, e.detalhes,
         (select max(s.iniciado_em) from public.meta_sync_execucoes s
           where s.job = e.job and s.status = 'sucesso')
    from public.meta_sync_execucoes e
   order by e.job, e.iniciado_em desc
$$;

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'marketing_ads_resumo(date, date)',
    'marketing_ads_serie(date, date, text, text)',
    'marketing_anuncios(date, date, text)',
    'marketing_breakdown(date, date, text, text, text)',
    'marketing_ig_resumo(date, date)',
    'marketing_ig_serie(date, date)',
    'marketing_ig_midias(date, date, text)',
    'marketing_ig_demografia()',
    'marketing_status_integracao()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
