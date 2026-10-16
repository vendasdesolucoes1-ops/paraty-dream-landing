-- Busca de leads sem diferença de acento (regressão da paginação do kanban,
-- issue #39): "joao" encontra "João", "sao paulo" encontra "São Paulo".
--
-- unaccent() não é IMMUTABLE (depende do dicionário), então não pode entrar
-- direto numa coluna gerada. O invólucro fixa o dicionário e pode.

create extension if not exists unaccent with schema extensions;

create or replace function public.sem_acento(p text)
returns text
language sql
immutable
parallel safe
strict
set search_path = public, extensions
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, p))
$$;

alter table public.leads
  add column if not exists busca text
  generated always as (
    public.sem_acento(coalesce(nome, '') || ' ' || coalesce(cidade, '') || ' ' || coalesce(email, ''))
  ) stored;

create extension if not exists pg_trgm with schema extensions;
create index if not exists leads_busca_trgm_idx
  on public.leads using gin (busca extensions.gin_trgm_ops);

notify pgrst, 'reload schema';
