-- Integração Meta (Ads + Instagram) — etapa 4: Instagram.
--
-- Mesmas regras das etapas anteriores: grava a service_role (Edge Functions
-- meta-sync-*), lê só a gestão, sem FOREIGN KEY (IDs vêm da Meta).
--
-- Métricas de conta e de mídia ficam em formato LONGO (uma linha por métrica):
-- a Meta descontinua e cria métricas com frequência (impressions saiu, views
-- entrou). Assim uma métrica nova ou removida não exige migration, e uma
-- métrica indisponível para a conta simplesmente não gera linha.

-- ---------------------------------------------------------------------------
-- 1. Snapshot diário da conta
-- ---------------------------------------------------------------------------
create table if not exists public.ig_conta_diaria (
  ig_user_id       text not null,
  data             date not null,           -- dia civil no fuso da conta
  username         text,
  followers_count  integer,
  follows_count    integer,
  media_count      integer,
  capturado_em     timestamptz not null default now(),
  primary key (ig_user_id, data)
);

-- ---------------------------------------------------------------------------
-- 2. Insights da conta por dia (reach, views, accounts_engaged, ...)
-- ---------------------------------------------------------------------------
create table if not exists public.ig_insights_conta_diario (
  ig_user_id     text not null,
  data           date not null,
  metrica        text not null,
  valor          numeric not null,
  atualizado_em  timestamptz not null default now(),
  primary key (ig_user_id, data, metrica)
);
create index if not exists ig_insights_conta_diario_data_idx
  on public.ig_insights_conta_diario (data);

-- ---------------------------------------------------------------------------
-- 3. Demografia dos seguidores (foto do dia; top 45 por breakdown)
-- ---------------------------------------------------------------------------
create table if not exists public.ig_demografia (
  ig_user_id  text not null,
  data        date not null,
  tipo        text not null check (tipo in ('age', 'gender', 'city', 'country')),
  chave       text not null,
  valor       integer not null,
  primary key (ig_user_id, data, tipo, chave)
);

-- ---------------------------------------------------------------------------
-- 4. Mídias (feed, reels e stories) e seus insights
-- ---------------------------------------------------------------------------
create table if not exists public.ig_midias (
  id                  text primary key,
  ig_user_id          text not null,
  caption             text,
  media_type          text,                 -- IMAGE, VIDEO, CAROUSEL_ALBUM
  media_product_type  text,                 -- FEED, REELS, STORY
  permalink           text,
  "timestamp"         timestamptz,
  like_count          integer,
  comments_count      integer,
  thumbnail_url       text,
  sincronizado_em     timestamptz not null default now()
);
create index if not exists ig_midias_timestamp_idx on public.ig_midias ("timestamp" desc);
create index if not exists ig_midias_tipo_idx on public.ig_midias (media_product_type);

-- Valor mais recente de cada métrica (lifetime). Stories: a última captura
-- horária antes de expirar fica como valor final.
create table if not exists public.ig_midia_insights (
  midia_id      text not null,
  metrica       text not null,
  valor         numeric not null,
  capturado_em  timestamptz not null default now(),
  primary key (midia_id, metrica)
);

-- ---------------------------------------------------------------------------
-- 5. Acesso: leitura só para a gestão; escrita só pela service_role
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'ig_conta_diaria', 'ig_insights_conta_diario', 'ig_demografia',
    'ig_midias', 'ig_midia_insights'
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
