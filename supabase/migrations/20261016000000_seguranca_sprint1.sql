-- Sprint 1 da auditoria de 15/10/2026: contenção de segurança.
--
-- 1. Segredos de máquina no Vault + `segredo_interno_valido` (padrão do RAG).
-- 2. Cron da fila com segredo próprio (fim do placeholder em service_role_key).
-- 3. `profiles`: usuário logado só altera o próprio nome; papel, vínculo de
--    vendedor, ativo e exclusão só pela service_role (manage-team).
-- 4. Superfície anônima: sem INSERT direto em leads, sem RPC interna aberta.
-- 5. Upsert do formulário não sobrescreve dados de um lead existente.
-- 6. Exclusão definitiva sem desvio por papel NULL.
-- 7. Bucket disparos-midia sem as políticas permissivas antigas.
-- 8. Limite de taxa genérico para funções públicas (enrich-lead).
--
-- Tudo idempotente: pode ser reaplicado sem erro.

-- ---------------------------------------------------------------------------
-- 1. Segredos de máquina
-- ---------------------------------------------------------------------------
do $$
declare
  v_nome text;
begin
  foreach v_nome in array array['cron_fila_secret', 'evolution_webhook_secret', 'ai_agent_chat_secret']
  loop
    if not exists (select 1 from vault.secrets where name = v_nome) then
      perform vault.create_secret(
        replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
        v_nome,
        'Segredo de máquina das Edge Functions (ver _shared/auth.ts).'
      );
    end if;
  end loop;
end $$;

-- A função não devolve o segredo: só responde se o valor confere. A allowlist
-- impede que ela vire um oráculo para outros segredos do Vault.
create or replace function public.segredo_interno_valido(p_nome text, p_segredo text)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
  select p_nome in ('cron_fila_secret', 'evolution_webhook_secret', 'ai_agent_chat_secret')
     and p_segredo is not null
     and length(p_segredo) >= 32
     and exists (
       select 1 from vault.decrypted_secrets
        where name = p_nome and decrypted_secret = p_segredo
     )
$$;

revoke all on function public.segredo_interno_valido(text, text) from public, anon, authenticated;
grant execute on function public.segredo_interno_valido(text, text) to service_role;

-- URL do webhook para colar na Evolution (só admin, pelo SQL Editor):
--   select public.url_webhook_evolution();
create or replace function public.url_webhook_evolution()
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select 'https://mokgxoygbjvtketoyraf.supabase.co/functions/v1/whatsapp-webhook?token='
         || decrypted_secret
    from vault.decrypted_secrets
   where name = 'evolution_webhook_secret'
   limit 1
$$;

revoke all on function public.url_webhook_evolution() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Cron da fila com segredo próprio
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'processar-mensagens-agendadas') then
    perform cron.unschedule('processar-mensagens-agendadas');
  end if;
end $$;

select cron.schedule(
  'processar-mensagens-agendadas',
  '* * * * *',
  $cron$
  select net.http_post(
    url     := 'https://mokgxoygbjvtketoyraf.supabase.co/functions/v1/processar-fila-mensagens',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (
        select decrypted_secret from vault.decrypted_secrets
         where name = 'cron_fila_secret' limit 1
      )
    ),
    body        := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  $cron$
);

-- Histórico do cron: guarda 14 dias (o job acima gera ~1.440 linhas por dia).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'limpar-historico-cron') then
    perform cron.unschedule('limpar-historico-cron');
  end if;
end $$;

select cron.schedule(
  'limpar-historico-cron',
  '17 4 * * *',
  $cron$ delete from cron.job_run_details where end_time < now() - interval '14 days' $cron$
);

-- ---------------------------------------------------------------------------
-- 3. profiles: papel só muda pela service_role
-- ---------------------------------------------------------------------------
revoke update on public.profiles from authenticated;
grant update (nome) on public.profiles to authenticated;

create or replace function public.profiles_proteger_campos()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    if new.role is distinct from old.role
       or new.vendedor_id is distinct from old.vendedor_id
       or new.ativo is distinct from old.ativo
       or new.deletado_em is distinct from old.deletado_em
       or new.id is distinct from old.id
    then
      raise exception 'Campos de acesso do perfil só podem ser alterados pela gestão da equipe.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_proteger_campos on public.profiles;
create trigger profiles_proteger_campos
  before update on public.profiles
  for each row execute function public.profiles_proteger_campos();

-- get_my_role passa a ignorar perfis inativos ou excluídos: um membro banido
-- com sessão aberta deixa de herdar o papel.
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles
   where id = auth.uid() and ativo and deletado_em is null
$$;

-- ---------------------------------------------------------------------------
-- 4. Superfície anônima
-- ---------------------------------------------------------------------------
drop policy if exists "anon_insert_leads" on public.leads;
revoke insert on public.leads from anon;

revoke execute on function public.get_next_round_robin_salesperson() from public, anon;
grant execute on function public.get_next_round_robin_salesperson() to authenticated, service_role;

revoke execute on function public.sync_lote_status(uuid) from public, anon, authenticated;
grant execute on function public.sync_lote_status(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Upsert do formulário: só preenche o que está vazio
-- ---------------------------------------------------------------------------
-- Antes, reenviar o formulário com o telefone de alguém trocava o nome do lead
-- existente. Agora o anônimo só completa campos nulos; quem corrige dados é o
-- painel.
create or replace function public.upsert_lead_from_form(
  p_nome text,
  p_email text,
  p_telefone text,
  p_cidade text,
  p_metragem_interesse numeric,
  p_tipo_lote_interesse text
)
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.leads (
    nome, email, telefone, cidade, metragem_interesse, tipo_lote_interesse,
    origem, status_crm
  )
  values (
    left(p_nome, 120), left(p_email, 200), p_telefone, left(p_cidade, 120),
    p_metragem_interesse, left(p_tipo_lote_interesse, 60),
    'lp', 'novo'
  )
  on conflict (telefone) do update set
    nome = coalesce(nullif(public.leads.nome, ''), excluded.nome),
    email = coalesce(public.leads.email, excluded.email),
    cidade = coalesce(public.leads.cidade, excluded.cidade),
    metragem_interesse = coalesce(public.leads.metragem_interesse, excluded.metragem_interesse),
    tipo_lote_interesse = coalesce(public.leads.tipo_lote_interesse, excluded.tipo_lote_interesse),
    updated_at = now()
  returning id;
$$;

grant execute on function public.upsert_lead_from_form(text, text, text, text, numeric, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Exclusão definitiva: papel NULL não passa
-- ---------------------------------------------------------------------------
-- A checagem `get_my_role() not in (...)` vira NULL para quem não tem perfil e
-- não dispara a exceção. Uma função-guarda explícita fecha o desvio sem
-- reescrever o corpo da exclusão: ela é chamada pelo wrapper abaixo.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'excluir_lead_definitivo'
  ) then
    execute $f$
      alter function public.excluir_lead_definitivo(uuid) rename to excluir_lead_definitivo_impl
    $f$;
  end if;
exception when duplicate_function then
  null;
end $$;

create or replace function public.excluir_lead_definitivo(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.get_my_role(), '') not in ('admin', 'gestor') then
    raise exception 'Sem permissão para excluir leads.' using errcode = '42501';
  end if;
  return public.excluir_lead_definitivo_impl(p_lead_id);
end;
$$;

revoke all on function public.excluir_lead_definitivo_impl(uuid) from public, anon, authenticated;
revoke all on function public.excluir_lead_definitivo(uuid) from public, anon;
grant execute on function public.excluir_lead_definitivo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Bucket disparos-midia: só as políticas de admin/gestor
-- ---------------------------------------------------------------------------
drop policy if exists "Autenticados enviam midia de disparo" on storage.objects;
drop policy if exists "Autenticados leem midia de disparo" on storage.objects;
drop policy if exists "Autenticados removem midia de disparo" on storage.objects;

-- ---------------------------------------------------------------------------
-- 8. Limite de taxa
-- ---------------------------------------------------------------------------
create table if not exists public.limites_taxa (
  chave      text        not null,
  janela     timestamptz not null,
  contagem   int         not null default 0,
  primary key (chave, janela)
);

alter table public.limites_taxa enable row level security;
revoke all on public.limites_taxa from anon, authenticated;

-- Conta uma chamada na janela atual e diz se ainda está dentro do limite.
create or replace function public.consumir_limite(p_chave text, p_maximo int, p_janela_segundos int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_janela timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_janela_segundos) * p_janela_segundos
  );
  v_contagem int;
begin
  insert into public.limites_taxa (chave, janela, contagem)
  values (p_chave, v_janela, 1)
  on conflict (chave, janela) do update set contagem = public.limites_taxa.contagem + 1
  returning contagem into v_contagem;

  -- Faxina oportunista: janelas com mais de 2 dias não servem para nada.
  if random() < 0.01 then
    delete from public.limites_taxa where janela < now() - interval '2 days';
  end if;

  return v_contagem <= p_maximo;
end;
$$;

revoke all on function public.consumir_limite(text, int, int) from public, anon, authenticated;
grant execute on function public.consumir_limite(text, int, int) to service_role;

notify pgrst, 'reload schema';
