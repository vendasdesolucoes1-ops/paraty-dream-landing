-- Trilha de auditoria append-only (auditoria R-26, issue #27).
--
-- Antes: `interacoes` não tinha autor e era editável; preço e status de lote,
-- papel de perfil e prompt da IA mudavam sem deixar rastro. Agora toda
-- alteração nas tabelas sensíveis vira uma linha imutável aqui, com antes,
-- depois, autor e origem (humano no painel, IA/sistema pela service_role).

create table if not exists public.auditoria (
  id          bigint generated always as identity primary key,
  tabela      text        not null,
  registro_id text,
  operacao    text        not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  antes       jsonb,
  depois      jsonb,
  -- Só as colunas que mudaram (UPDATE): é o que se lê na tela.
  mudancas    jsonb,
  autor_id    uuid,
  origem      text        not null,
  quando      timestamptz not null default now()
);

create index if not exists auditoria_registro_idx on public.auditoria (tabela, registro_id, quando desc);
create index if not exists auditoria_quando_idx on public.auditoria (quando desc);

alter table public.auditoria enable row level security;

-- Ninguém do painel escreve, altera ou apaga: só os gatilhos (SECURITY DEFINER).
revoke all on public.auditoria from anon, authenticated;
grant select on public.auditoria to authenticated;

drop policy if exists "auditoria_select" on public.auditoria;
create policy "auditoria_select" on public.auditoria
  for select to authenticated
  using (
    public.sou_gestao()
    or (tabela = 'leads' and public.pode_ver_lead(registro_id::uuid))
  );

-- Bloqueio extra: mesmo a service_role não altera nem apaga linhas antigas.
create or replace function public.auditoria_imutavel()
returns trigger
language plpgsql
as $$
begin
  raise exception 'A trilha de auditoria é somente inclusão.' using errcode = '42501';
end;
$$;

drop trigger if exists auditoria_imutavel on public.auditoria;
create trigger auditoria_imutavel
  before update or delete on public.auditoria
  for each row execute function public.auditoria_imutavel();

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes   jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_depois  jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_mudou   jsonb;
  v_id      text  := coalesce(v_depois ->> 'id', v_antes ->> 'id');
  v_origem  text  := case
                       when auth.uid() is not null then 'painel'
                       when coalesce(auth.role(), '') = 'service_role' then 'sistema'
                       else 'banco'
                     end;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_object('de', v_antes -> k, 'para', v_depois -> k))
      into v_mudou
      from jsonb_object_keys(v_depois) k
     where (v_antes -> k) is distinct from (v_depois -> k)
       and k not in ('updated_at', 'atualizado_em');
    -- Update que só mexeu no carimbo de tempo não é evento.
    if v_mudou is null then
      return new;
    end if;
  end if;

  -- Segredos nunca entram na trilha.
  if tg_table_name = 'whatsapp_instances' then
    v_antes := v_antes - 'api_key';
    v_depois := v_depois - 'api_key';
    v_mudou := v_mudou - 'api_key';
  end if;

  insert into public.auditoria (tabela, registro_id, operacao, antes, depois, mudancas, autor_id, origem)
  values (tg_table_name, v_id, tg_op, v_antes, v_depois, v_mudou, auth.uid(), v_origem);

  return coalesce(new, old);
end;
$$;

revoke all on function public.registrar_auditoria() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'leads', 'lotes', 'compras', 'clientes', 'profiles', 'visitas',
    'ai_agents', 'configuracoes', 'whatsapp_instances', 'vendedores'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists auditoria on public.%I', t);
      execute format(
        'create trigger auditoria after insert or update or delete on public.%I
           for each row execute function public.registrar_auditoria()', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- interacoes: autor e imutabilidade
-- ---------------------------------------------------------------------------
alter table public.interacoes
  add column if not exists autor_id uuid default auth.uid();

-- Histórico do lead não se reescreve: quem errou registra uma nova interação.
-- (A exclusão definitiva de um lead apaga em cascata pela service_role.)
create or replace function public.interacoes_somente_inclusao()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  raise exception 'Interações do histórico não podem ser alteradas nem apagadas.'
    using errcode = '42501';
end;
$$;

drop trigger if exists interacoes_somente_inclusao on public.interacoes;
create trigger interacoes_somente_inclusao
  before update or delete on public.interacoes
  for each row execute function public.interacoes_somente_inclusao();
