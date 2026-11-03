-- Marketing: resultado por objetivo da campanha e contatos sem duplicar.
--
-- Até aqui o painel dividia o investimento TOTAL (inclusive das campanhas de
-- WhatsApp) pelos leads do formulário, e somava as conversas das campanhas de
-- formulário (o botão "Chamar no WhatsApp" da tela final) como se fossem outras
-- pessoas. Agora cada campanha tem um tipo de resultado:
--
--   lead     → objetivo de Leads (OUTCOME_LEADS / LEAD_GENERATION): conta leads.
--   conversa → objetivo de Mensagens, ou conjunto otimizado para conversas
--              (WhatsApp/Direct/Messenger): conta conversas iniciadas.
--   clique   → qualquer outro objetivo: conta cliques no link.
--
-- Contatos únicos = leads das campanhas de lead + conversas das campanhas de
-- conversa. As conversas das campanhas de lead ficam à parte, como "leads que
-- também chamaram no WhatsApp" (são as mesmas pessoas).
--
-- As funções só ganham colunas no fim: a versão anterior da tela continua
-- funcionando até o novo front ser publicado. Tudo idempotente.

-- ---------------------------------------------------------------------------
-- 1. Tipo de resultado de cada campanha
-- ---------------------------------------------------------------------------
create or replace view public.meta_campanha_resultado
with (security_invoker = on) as
select c.id as campaign_id,
       case
         when c.objective in ('OUTCOME_LEADS', 'LEAD_GENERATION') then 'lead'
         when c.objective = 'MESSAGES'
           or exists (
             select 1 from public.meta_conjuntos s
              where s.campaign_id = c.id and s.optimization_goal = 'CONVERSATIONS'
           ) then 'conversa'
         else 'clique'
       end as tipo_resultado
  from public.meta_campanhas c;

comment on view public.meta_campanha_resultado is
  'Tipo de resultado de cada campanha (lead | conversa | clique), pelo objetivo e pela otimização dos conjuntos.';

revoke all on public.meta_campanha_resultado from public, anon;
grant select on public.meta_campanha_resultado to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Resumo do período: custos por objetivo e contatos únicos
-- ---------------------------------------------------------------------------
drop function if exists public.marketing_ads_resumo(date, date);
create function public.marketing_ads_resumo(p_inicio date, p_fim date)
returns table (
  periodo            text,      -- 'atual' | 'anterior'
  inicio             date,
  fim                date,
  moeda              text,
  investimento       numeric,
  impressoes         bigint,
  alcance_soma       bigint,
  cliques            bigint,
  cliques_link       bigint,
  leads              bigint,    -- todos os leads (qualquer campanha)
  mensagens          bigint,    -- todas as conversas (qualquer campanha)
  compras            bigint,
  valor_compras      numeric,
  reservas           bigint,
  anuncios_com_gasto integer,
  -- por objetivo
  investimento_leads     numeric,   -- campanhas de lead
  leads_formulario       bigint,    -- leads das campanhas de lead
  leads_que_chamaram     bigint,    -- conversas das campanhas de lead (mesmas pessoas)
  investimento_conversas numeric,   -- campanhas de conversa
  conversas              bigint,    -- conversas das campanhas de conversa
  contatos               bigint     -- leads_formulario + conversas
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
  ),
  i as (
    select d.*, coalesce(r.tipo_resultado, 'clique') as tipo
      from public.meta_insights_diarios d
      left join public.meta_campanha_resultado r on r.campaign_id = d.campaign_id
     where d.data between p_inicio - (p_fim - p_inicio + 1) and p_fim
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
         count(distinct i.ad_id) filter (where i.spend > 0)::integer,
         coalesce(sum(i.spend) filter (where i.tipo = 'lead'), 0),
         coalesce(sum(i.leads) filter (where i.tipo = 'lead'), 0)::bigint,
         coalesce(sum(i.mensagens_iniciadas) filter (where i.tipo = 'lead'), 0)::bigint,
         coalesce(sum(i.spend) filter (where i.tipo = 'conversa'), 0),
         coalesce(sum(i.mensagens_iniciadas) filter (where i.tipo = 'conversa'), 0)::bigint,
         (coalesce(sum(i.leads) filter (where i.tipo = 'lead'), 0)
          + coalesce(sum(i.mensagens_iniciadas) filter (where i.tipo = 'conversa'), 0))::bigint
    from periodos p
    left join i on i.data between p.inicio and p.fim
   where p_fim >= p_inicio
   group by p.periodo, p.inicio, p.fim
   order by p.periodo desc   -- 'atual' primeiro
$$;

-- ---------------------------------------------------------------------------
-- 3. Lista por nível: tipo de resultado de cada linha
-- ---------------------------------------------------------------------------
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
  criado_em         timestamptz,
  tipo_resultado    text        -- 'lead' | 'conversa' | 'clique' (da campanha)
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
         coalesce(sum(m.reservas), 0)::bigint, c.created_time,
         coalesce(r.tipo_resultado, 'clique')
    from public.meta_campanhas c
    left join public.meta_campanha_resultado r on r.campaign_id = c.id
    left join m on m.campaign_id = c.id
   where p_nivel = 'campanha'
   group by c.id, r.tipo_resultado
  union all
  select s.id, s.name, s.status, s.effective_status,
         s.campaign_id, c.name, s.id, s.name,
         c.objective, null, null, null,
         s.daily_budget, s.lifetime_budget,
         coalesce(sum(m.spend), 0), coalesce(sum(m.impressions), 0)::bigint,
         coalesce(sum(m.reach), 0)::bigint, coalesce(sum(m.clicks), 0)::bigint,
         coalesce(sum(m.inline_link_clicks), 0)::bigint, coalesce(sum(m.leads), 0)::bigint,
         coalesce(sum(m.mensagens_iniciadas), 0)::bigint, coalesce(sum(m.compras), 0)::bigint,
         coalesce(sum(m.reservas), 0)::bigint, s.created_time,
         coalesce(r.tipo_resultado, 'clique')
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
         null, null,
         coalesce(sum(m.spend), 0), coalesce(sum(m.impressions), 0)::bigint,
         coalesce(sum(m.reach), 0)::bigint, coalesce(sum(m.clicks), 0)::bigint,
         coalesce(sum(m.inline_link_clicks), 0)::bigint, coalesce(sum(m.leads), 0)::bigint,
         coalesce(sum(m.mensagens_iniciadas), 0)::bigint, coalesce(sum(m.compras), 0)::bigint,
         coalesce(sum(m.reservas), 0)::bigint, a.created_time,
         coalesce(r.tipo_resultado, 'clique')
    from public.meta_anuncios a
    left join public.meta_campanhas c on c.id = a.campaign_id
    left join public.meta_conjuntos s on s.id = a.adset_id
    left join public.meta_campanha_resultado r on r.campaign_id = a.campaign_id
    left join m on m.ad_id = a.id
   where p_nivel = 'anuncio'
   group by a.id, c.id, s.id, r.tipo_resultado
$$;

-- ---------------------------------------------------------------------------
-- 4. Alerta de saldo baixo (sino da gestão), no máximo um a cada 12 h
-- ---------------------------------------------------------------------------
-- Chamado pela função meta-saldo quando o saldo ou o limite cobre menos de
-- 3 dias, ou quando a conta deixa de estar ativa.
create or replace function public.alertar_saldo_meta(p_titulo text, p_detalhe text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.alertas_enviados
              where tipo = 'meta_saldo_baixo' and enviado_em > now() - interval '12 hours') then
    return false;
  end if;

  insert into public.alertas_enviados (tipo, enviado_em, detalhe)
  values ('meta_saldo_baixo', now(), left(p_detalhe, 500))
  on conflict (tipo) do update set enviado_em = excluded.enviado_em, detalhe = excluded.detalhe;

  perform public.notificar_gestao('meta_alerta', left(p_titulo, 120), left(p_detalhe, 500),
                                  '/dashboard/marketing?aba=anuncios');
  return true;
end;
$$;

revoke all on function public.alertar_saldo_meta(text, text) from public, anon, authenticated;
grant execute on function public.alertar_saldo_meta(text, text) to service_role;

-- Confere o saldo de hora em hora mesmo com a tela fechada (o aviso vai para o sino).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'meta-saldo-alerta') then
    perform cron.unschedule('meta-saldo-alerta');
  end if;
  perform cron.schedule(
    'meta-saldo-alerta',
    '35 * * * *',
    $cron$
      select net.http_post(
        url     := 'https://mokgxoygbjvtketoyraf.supabase.co/functions/v1/meta-saldo',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', (
            select decrypted_secret from vault.decrypted_secrets
             where name = 'cron_meta_secret' limit 1
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
    $cron$
  );
end $$;

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'marketing_ads_resumo(date, date)',
    'marketing_anuncios(date, date, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
