-- Integração Meta (Ads + Instagram) — etapa 3: métricas diárias de Ads.
--
-- Mesmas regras da etapa 2: grava a service_role (Edge Functions meta-sync-*),
-- lê só a gestão. Sem FOREIGN KEY: o ID do anúncio vem da Meta e a métrica pode
-- chegar antes do cadastro do anúncio (ou depois que ele foi excluído).
--
-- Valores monetários ficam na moeda da conta (meta_conta_anuncios.moeda), em
-- unidade inteira (R$ 12,34 = 12.34) — como o /insights devolve.

-- ---------------------------------------------------------------------------
-- 1. Insights diários por anúncio (level=ad, time_increment=1)
-- ---------------------------------------------------------------------------
create table if not exists public.meta_insights_diarios (
  ad_id               text not null,
  data                date not null,          -- no fuso da conta de anúncios
  adset_id            text,
  campaign_id         text,
  conta_id            text not null,
  moeda               text,
  spend               numeric,
  impressions         bigint,
  reach               bigint,
  frequency           numeric,
  clicks              bigint,
  unique_clicks       bigint,
  ctr                 numeric,
  cpc                 numeric,
  cpm                 numeric,
  inline_link_clicks  bigint,
  video_p25           bigint,
  video_p50           bigint,
  video_p75           bigint,
  video_p100          bigint,
  -- Principais ações em colunas (o resto fica no JSON abaixo).
  leads               integer,
  mensagens_iniciadas integer,
  cliques_link        integer,
  compras             integer,
  valor_compras       numeric,
  reservas            integer,
  actions             jsonb,
  action_values       jsonb,
  cost_per_action_type jsonb,
  conversions         jsonb,
  sincronizado_em     timestamptz not null default now(),
  primary key (ad_id, data)
);
create index if not exists meta_insights_diarios_data_idx on public.meta_insights_diarios (data);
create index if not exists meta_insights_diarios_campanha_idx
  on public.meta_insights_diarios (campaign_id, data);

-- ---------------------------------------------------------------------------
-- 2. Breakdowns (idade+gênero, plataforma+posição, região)
-- ---------------------------------------------------------------------------
-- dim1/dim2 por tipo:
--   idade_genero       → dim1 = age,                dim2 = gender
--   plataforma_posicao → dim1 = publisher_platform, dim2 = platform_position
--   regiao             → dim1 = region,             dim2 = ''
create table if not exists public.meta_insights_breakdowns (
  ad_id               text not null,
  data                date not null,
  tipo                text not null check (tipo in ('idade_genero', 'plataforma_posicao', 'regiao')),
  dim1                text not null default '',
  dim2                text not null default '',
  adset_id            text,
  campaign_id         text,
  conta_id            text not null,
  spend               numeric,
  impressions         bigint,
  reach               bigint,
  clicks              bigint,
  inline_link_clicks  bigint,
  leads               integer,
  mensagens_iniciadas integer,
  actions             jsonb,
  sincronizado_em     timestamptz not null default now(),
  primary key (ad_id, data, tipo, dim1, dim2)
);
create index if not exists meta_insights_breakdowns_tipo_idx
  on public.meta_insights_breakdowns (tipo, data);

-- ---------------------------------------------------------------------------
-- 3. Estado dos jobs (cursor da carga inicial, relatório assíncrono em andamento)
-- ---------------------------------------------------------------------------
create table if not exists public.meta_sync_estado (
  chave          text primary key,
  valor          jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Acesso: leitura só para a gestão; escrita só pela service_role
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['meta_insights_diarios', 'meta_insights_breakdowns', 'meta_sync_estado'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_gestao', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.sou_gestao())',
      t || '_select_gestao', t
    );
  end loop;
end $$;
