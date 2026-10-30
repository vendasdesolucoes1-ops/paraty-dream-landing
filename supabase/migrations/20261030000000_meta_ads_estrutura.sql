-- Integração Meta (Ads + Instagram) — etapa 2: estrutura de Ads e controle de execuções.
--
-- Quem grava: as Edge Functions meta-sync-* com a service_role (ignora RLS).
-- Quem lê: só a gestão, pelo painel (policies abaixo). Nada de anon.
--
-- Sem FOREIGN KEY entre campanha → conjunto → anúncio de propósito: o sync grava
-- por nível e por página, e uma execução interrompida (rate limit, token) não
-- pode ser barrada por um pai que ainda não chegou. Os IDs vêm da Meta e são a
-- chave natural; o upsert por ID torna qualquer reexecução idempotente.
--
-- Orçamentos (daily_budget, lifetime_budget, ...) ficam na menor unidade da
-- moeda da conta (centavos), exatamente como a Meta devolve.

-- ---------------------------------------------------------------------------
-- 1. Controle de execuções (todas as etapas da integração usam)
-- ---------------------------------------------------------------------------
create table if not exists public.meta_sync_execucoes (
  id             uuid primary key default gen_random_uuid(),
  job            text not null,
  iniciado_em    timestamptz not null default now(),
  finalizado_em  timestamptz,
  status         text not null default 'executando'
                   check (status in ('executando', 'sucesso', 'parcial', 'erro')),
  registros      integer not null default 0 check (registros >= 0),
  erro           text,
  -- Código de erro da Graph API (190 = token expirado/revogado).
  codigo_erro    integer,
  detalhes       jsonb not null default '{}'::jsonb
);

create index if not exists meta_sync_execucoes_job_idx
  on public.meta_sync_execucoes (job, iniciado_em desc);

-- ---------------------------------------------------------------------------
-- 2. Conta de anúncios (moeda e fuso: necessários para ler gasto e datas)
-- ---------------------------------------------------------------------------
create table if not exists public.meta_conta_anuncios (
  id              text primary key,                -- act_XXXX
  nome            text,
  moeda           text,
  fuso            text,                            -- timezone_name, ex.: America/Sao_Paulo
  account_status  integer,
  sincronizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Campanhas, conjuntos e anúncios
-- ---------------------------------------------------------------------------
create table if not exists public.meta_campanhas (
  id               text primary key,
  conta_id         text not null,
  name             text,
  status           text,
  effective_status text,
  objective        text,
  buying_type      text,
  daily_budget     bigint,
  lifetime_budget  bigint,
  start_time       timestamptz,
  stop_time        timestamptz,
  created_time     timestamptz,
  updated_time     timestamptz,
  sincronizado_em  timestamptz not null default now()
);
create index if not exists meta_campanhas_conta_idx on public.meta_campanhas (conta_id);
create index if not exists meta_campanhas_status_idx on public.meta_campanhas (effective_status);

create table if not exists public.meta_conjuntos (
  id                 text primary key,
  campaign_id        text not null,
  conta_id           text not null,
  name               text,
  status             text,
  effective_status   text,
  optimization_goal  text,
  billing_event      text,
  bid_strategy       text,
  daily_budget       bigint,
  lifetime_budget    bigint,
  budget_remaining   bigint,
  targeting          jsonb,
  start_time         timestamptz,
  end_time           timestamptz,
  created_time       timestamptz,
  updated_time       timestamptz,
  sincronizado_em    timestamptz not null default now()
);
create index if not exists meta_conjuntos_campanha_idx on public.meta_conjuntos (campaign_id);

create table if not exists public.meta_anuncios (
  id                          text primary key,
  adset_id                    text not null,
  campaign_id                 text not null,
  conta_id                    text not null,
  name                        text,
  status                      text,
  effective_status            text,
  creative_id                 text,
  creative_title              text,
  creative_body               text,
  creative_thumbnail_url      text,
  creative_object_story_spec  jsonb,
  created_time                timestamptz,
  updated_time                timestamptz,
  sincronizado_em             timestamptz not null default now()
);
create index if not exists meta_anuncios_conjunto_idx on public.meta_anuncios (adset_id);
create index if not exists meta_anuncios_campanha_idx on public.meta_anuncios (campaign_id);

-- ---------------------------------------------------------------------------
-- 4. Acesso: leitura só para a gestão; escrita só pela service_role
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'meta_sync_execucoes', 'meta_conta_anuncios', 'meta_campanhas',
    'meta_conjuntos', 'meta_anuncios'
  ] loop
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
