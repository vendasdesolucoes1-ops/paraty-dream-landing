-- Marketing, etapa 2: avisos da Meta, destino dos conjuntos, orçamento e série
-- diária por campanha.
--
-- 1. Colunas novas que a sincronização de estrutura passa a gravar:
--    issues_info (erros de veiculação), recommendations (avisos/recomendações),
--    ad_review_feedback (motivo de reprovação), destination_type (WhatsApp,
--    formulário, mensagens) e learning_stage_info (fase de aprendizado).
-- 2. O tipo de resultado da campanha passa a olhar também o destino do conjunto.
-- 3. marketing_anuncios devolve o orçamento diário efetivo (do conjunto ou da
--    campanha), o destino e os avisos (do próprio item e dos anúncios abaixo dele).
-- 4. marketing_ads_serie_campanhas: série diária por campanha (gráfico de
--    conversas/leads e custo por resultado, uma linha por campanha).
--
-- Tudo idempotente; as funções só ganham colunas no fim.

-- ---------------------------------------------------------------------------
-- 1. Colunas
-- ---------------------------------------------------------------------------
alter table public.meta_campanhas
  add column if not exists issues_info jsonb,
  add column if not exists recommendations jsonb;

alter table public.meta_conjuntos
  add column if not exists destination_type text,
  add column if not exists issues_info jsonb,
  add column if not exists recommendations jsonb,
  add column if not exists learning_stage_info jsonb;

alter table public.meta_anuncios
  add column if not exists issues_info jsonb,
  add column if not exists ad_review_feedback jsonb,
  add column if not exists recommendations jsonb;

-- ---------------------------------------------------------------------------
-- 2. Tipo de resultado: objetivo + otimização + destino do conjunto
-- ---------------------------------------------------------------------------
create or replace view public.meta_campanha_resultado
with (security_invoker = on) as
select c.id as campaign_id,
       case
         when c.objective in ('OUTCOME_LEADS', 'LEAD_GENERATION') then 'lead'
         when c.objective = 'MESSAGES'
           or exists (
             select 1 from public.meta_conjuntos s
              where s.campaign_id = c.id
                and (s.optimization_goal = 'CONVERSATIONS'
                     or s.destination_type in ('WHATSAPP', 'MESSENGER', 'INSTAGRAM_DIRECT')
                     or s.destination_type like 'MESSAGING%')
           ) then 'conversa'
         else 'clique'
       end as tipo_resultado
  from public.meta_campanhas c;

revoke all on public.meta_campanha_resultado from public, anon;
grant select on public.meta_campanha_resultado to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Lista por nível com orçamento efetivo, destino e avisos
-- ---------------------------------------------------------------------------
-- avisos = { erros: [...issues_info], revisao: {...ad_review_feedback},
--            recomendacoes: [...recommendations] } — só as chaves com conteúdo.
-- Em campanha e conjunto, `erros` junta os do próprio item e os dos anúncios
-- abaixo dele (a Meta costuma reportar o erro no anúncio).
drop function if exists public.marketing_anuncios(date, date, text);
create function public.marketing_anuncios(p_inicio date, p_fim date, p_nivel text)
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
  orcamento_diario  bigint,     -- centavos; do conjunto ou da campanha (CBO)
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
  criado_em         timestamptz,
  tipo_resultado    text,
  destino           text,       -- destination_type do conjunto (ou o primeiro da campanha)
  avisos            jsonb
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
  ),
  erros_anuncio as (
    select a.campaign_id, a.adset_id, e.valor
      from public.meta_anuncios a
      cross join lateral jsonb_array_elements(coalesce(a.issues_info, '[]'::jsonb)) as e(valor)
  )
  select c.id, c.name, c.status, c.effective_status,
         c.id, c.name, null::text, null::text,
         c.objective, null::text, null::text, null::text,
         coalesce(c.daily_budget,
                  (select sum(s2.daily_budget) from public.meta_conjuntos s2
                    where s2.campaign_id = c.id and s2.effective_status = 'ACTIVE'))::bigint,
         c.lifetime_budget,
         coalesce(sum(m.spend), 0), coalesce(sum(m.impressions), 0)::bigint,
         coalesce(sum(m.reach), 0)::bigint, coalesce(sum(m.clicks), 0)::bigint,
         coalesce(sum(m.inline_link_clicks), 0)::bigint, coalesce(sum(m.leads), 0)::bigint,
         coalesce(sum(m.mensagens_iniciadas), 0)::bigint, coalesce(sum(m.compras), 0)::bigint,
         coalesce(sum(m.reservas), 0)::bigint, c.created_time,
         coalesce(r.tipo_resultado, 'clique'),
         (select s3.destination_type from public.meta_conjuntos s3
           where s3.campaign_id = c.id and s3.destination_type is not null
           order by s3.effective_status = 'ACTIVE' desc, s3.id limit 1),
         jsonb_strip_nulls(jsonb_build_object(
           'erros', nullif(coalesce(c.issues_info, '[]'::jsonb)
                    || coalesce((select jsonb_agg(ea.valor) from erros_anuncio ea where ea.campaign_id = c.id), '[]'::jsonb),
                    '[]'::jsonb),
           'recomendacoes', c.recommendations
         ))
    from public.meta_campanhas c
    left join public.meta_campanha_resultado r on r.campaign_id = c.id
    left join m on m.campaign_id = c.id
   where p_nivel = 'campanha'
   group by c.id, r.tipo_resultado
  union all
  select s.id, s.name, s.status, s.effective_status,
         s.campaign_id, c.name, s.id, s.name,
         c.objective, null, null, null,
         coalesce(s.daily_budget, c.daily_budget), coalesce(s.lifetime_budget, c.lifetime_budget),
         coalesce(sum(m.spend), 0), coalesce(sum(m.impressions), 0)::bigint,
         coalesce(sum(m.reach), 0)::bigint, coalesce(sum(m.clicks), 0)::bigint,
         coalesce(sum(m.inline_link_clicks), 0)::bigint, coalesce(sum(m.leads), 0)::bigint,
         coalesce(sum(m.mensagens_iniciadas), 0)::bigint, coalesce(sum(m.compras), 0)::bigint,
         coalesce(sum(m.reservas), 0)::bigint, s.created_time,
         coalesce(r.tipo_resultado, 'clique'),
         s.destination_type,
         jsonb_strip_nulls(jsonb_build_object(
           'erros', nullif(coalesce(s.issues_info, '[]'::jsonb)
                    || coalesce((select jsonb_agg(ea.valor) from erros_anuncio ea where ea.adset_id = s.id), '[]'::jsonb),
                    '[]'::jsonb),
           'recomendacoes', s.recommendations
         ))
    from public.meta_conjuntos s
    left join public.meta_campanhas c on c.id = s.campaign_id
    left join public.meta_campanha_resultado r on r.campaign_id = s.campaign_id
    left join m on m.adset_id = s.id
   where p_nivel = 'conjunto'
   group by s.id, c.id, r.tipo_resultado
  union all
  select a.id, a.name, a.status, a.effective_status,
         a.campaign_id, c.name, a.adset_id, s.name,
         c.objective, a.creative_thumbnail_url, a.creative_title, a.creative_body,
         coalesce(s.daily_budget, c.daily_budget), coalesce(s.lifetime_budget, c.lifetime_budget),
         coalesce(sum(m.spend), 0), coalesce(sum(m.impressions), 0)::bigint,
         coalesce(sum(m.reach), 0)::bigint, coalesce(sum(m.clicks), 0)::bigint,
         coalesce(sum(m.inline_link_clicks), 0)::bigint, coalesce(sum(m.leads), 0)::bigint,
         coalesce(sum(m.mensagens_iniciadas), 0)::bigint, coalesce(sum(m.compras), 0)::bigint,
         coalesce(sum(m.reservas), 0)::bigint, a.created_time,
         coalesce(r.tipo_resultado, 'clique'),
         s.destination_type,
         jsonb_strip_nulls(jsonb_build_object(
           'erros', a.issues_info,
           'revisao', a.ad_review_feedback,
           'recomendacoes', a.recommendations
         ))
    from public.meta_anuncios a
    left join public.meta_campanhas c on c.id = a.campaign_id
    left join public.meta_conjuntos s on s.id = a.adset_id
    left join public.meta_campanha_resultado r on r.campaign_id = a.campaign_id
    left join m on m.ad_id = a.id
   where p_nivel = 'anuncio'
   group by a.id, c.id, s.id, r.tipo_resultado
$$;

-- ---------------------------------------------------------------------------
-- 4. Série diária por campanha
-- ---------------------------------------------------------------------------
-- Uma linha por (dia, campanha) para as campanhas com gasto no período ou
-- ativas agora; dias sem veiculação voltam com zero.
create or replace function public.marketing_ads_serie_campanhas(p_inicio date, p_fim date)
returns table (
  data             date,
  campanha_id      text,
  campanha_nome    text,
  effective_status text,
  tipo_resultado   text,
  investimento     numeric,
  leads            bigint,
  mensagens        bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with camps as (
    select c.id, c.name, c.effective_status, coalesce(r.tipo_resultado, 'clique') as tipo
      from public.meta_campanhas c
      left join public.meta_campanha_resultado r on r.campaign_id = c.id
     where c.effective_status = 'ACTIVE'
        or exists (select 1 from public.meta_insights_diarios i
                    where i.campaign_id = c.id and i.data between p_inicio and p_fim and i.spend > 0)
  )
  select d::date, c.id, c.name, c.effective_status, c.tipo,
         coalesce(sum(i.spend), 0),
         coalesce(sum(i.leads), 0)::bigint,
         coalesce(sum(i.mensagens_iniciadas), 0)::bigint
    from generate_series(p_inicio::timestamp, p_fim::timestamp, interval '1 day') d
   cross join camps c
    left join public.meta_insights_diarios i on i.campaign_id = c.id and i.data = d::date
   where p_fim >= p_inicio and p_fim - p_inicio <= 400
   group by d, c.id, c.name, c.effective_status, c.tipo
   order by d, c.name
$$;

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'marketing_anuncios(date, date, text)',
    'marketing_ads_serie_campanhas(date, date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
