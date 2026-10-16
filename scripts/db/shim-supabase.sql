-- Imitação mínima do que o Supabase traz pronto (papéis, auth, storage, vault,
-- pg_cron, pg_net, pgvector), para aplicar as migrations num Postgres comum.
-- Só para teste local/CI: NUNCA rodar num banco Supabase de verdade.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_realtime_admin') then create role supabase_realtime_admin nologin; end if;
end $$;

create extension if not exists pgcrypto;
create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists vault;
create schema if not exists cron;
create schema if not exists net;

grant usage on schema public, extensions to anon, authenticated, service_role;
grant usage on schema auth, storage to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- O "usuário logado" do teste vem de uma variável de sessão.
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as
$$ select coalesce(nullif(current_setting('teste.role', true), ''), 'authenticated') $$;
create or replace function auth.jwt() returns jsonb language sql stable as
$$ select '{}'::jsonb $$;

create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text,
  owner uuid, metadata jsonb, created_at timestamptz default now()
);
create or replace function storage.foldername(name text) returns text[] language sql immutable as
$$ select string_to_array(name, '/') $$;
alter table storage.objects enable row level security;

create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(), name text unique, secret text, description text
);
create or replace view vault.decrypted_secrets as
  select id, name, secret as decrypted_secret, description from vault.secrets;
create or replace function vault.create_secret(p_secret text, p_name text default null, p_description text default null)
returns uuid language sql as
$$ insert into vault.secrets (name, secret, description) values (p_name, p_secret, p_description) returning id $$;
create or replace function vault.update_secret(p_id uuid, p_secret text default null, p_name text default null, p_description text default null)
returns void language sql as
$$ update vault.secrets set secret = coalesce(p_secret, secret) where id = p_id $$;

create table if not exists cron.job (
  jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true
);
create table if not exists cron.job_run_details (
  runid bigserial primary key, jobid bigint, status text, start_time timestamptz, end_time timestamptz, return_message text
);
create or replace function cron.schedule(p_nome text, p_agenda text, p_comando text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (p_nome, p_agenda, p_comando)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid
$$;
create or replace function cron.unschedule(p_nome text) returns boolean language sql as $$
  with d as (delete from cron.job where jobname = p_nome returning 1) select exists (select 1 from d)
$$;

create table if not exists net.pedidos (
  id bigserial primary key, url text, headers jsonb, body jsonb, criado_em timestamptz default now()
);
create or replace function net.http_post(
  url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000
) returns bigint language sql as $$
  insert into net.pedidos (url, headers, body) values (url, headers, body) returning id
$$;

-- pgvector: o tipo vira real[] e o operador de distância é calculado à mão.
do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'extensions' and t.typname = 'vector') then
    create domain extensions.vector as real[];
  end if;
end $$;
create or replace function extensions.distancia_cosseno(a extensions.vector, b extensions.vector)
returns double precision language sql immutable as $$ select 0.5::double precision $$;
do $$ begin
  if not exists (select 1 from pg_operator where oprname = '<=>') then
    create operator public.<=> (leftarg = extensions.vector, rightarg = extensions.vector,
                                function = extensions.distancia_cosseno);
  end if;
end $$;

-- Publicação do Realtime.
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
