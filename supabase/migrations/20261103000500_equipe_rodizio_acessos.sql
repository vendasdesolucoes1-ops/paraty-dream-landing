-- Equipe, rodízio e acessos.
--
-- 1. Uma chave só para o rodízio (configuracoes.rodizio_ativo), que vale para
--    o WhatsApp, o formulário da Meta e o cadastro manual. Começa desligada:
--    get_next_round_robin_salesperson() passa a devolver null enquanto ela
--    estiver desligada, e o lead entra sem vendedor. Ao ligar, os leads em
--    aberto que ficaram sem vendedor nos últimos 30 dias são repartidos.
-- 2. Membro excluído ou desativado sai do rodízio (vendedores.ativo = false).
-- 3. Acessos por usuário (profiles.acessos): o vendedor vê só o CRM e, se a
--    gestão marcar, Agenda, Lotes e Planta 3D.
-- 4. Campos de acesso do perfil (papel, vínculo, status e acessos) só mudam
--    pela gestão da equipe — nunca pelo próprio usuário.
-- 5. Entrega manual de um lead a um vendedor, com histórico e aviso.

-- ---------------------------------------------------------------------------
-- 1. Chave única do rodízio
-- ---------------------------------------------------------------------------
insert into public.configuracoes (chave, valor)
select 'rodizio_ativo', 'false'
 where not exists (select 1 from public.configuracoes where chave = 'rodizio_ativo');

delete from public.configuracoes where chave = 'rodizio_formulario_ativo';

create or replace function public.rodizio_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select lower(valor) = 'true' from public.configuracoes
                    where chave = 'rodizio_ativo' limit 1), false)
$$;

-- Nome antigo, usado por registrar_lead_formulario: agora lê a chave única.
create or replace function public.rodizio_formulario_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.rodizio_ativo()
$$;

-- A fila em si, sem olhar a chave (usada ao distribuir os leads em espera).
create or replace function public.proximo_vendedor_da_fila()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
    from public.vendedores
   where ativo = true
   order by posicao_round_robin asc, created_at asc
   limit 1
   for update skip locked;
  if v_id is null then
    return null;
  end if;
  update public.vendedores
     set posicao_round_robin = (select coalesce(max(posicao_round_robin), 0) + 1 from public.vendedores)
   where id = v_id;
  return v_id;
end;
$$;

-- Quem chama (webhook do WhatsApp, formulário, cadastro manual) recebe null
-- enquanto o rodízio estiver desligado.
create or replace function public.get_next_round_robin_salesperson()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.rodizio_ativo() then
    return null;
  end if;
  return public.proximo_vendedor_da_fila();
end;
$$;

revoke all on function public.proximo_vendedor_da_fila() from public, anon, authenticated;
grant execute on function public.proximo_vendedor_da_fila() to service_role;
revoke all on function public.rodizio_ativo() from public, anon;
grant execute on function public.rodizio_ativo() to authenticated, service_role;

create or replace function public.definir_rodizio(p_ativo boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  v_vend uuid;
  n integer := 0;
begin
  if not public.sou_gestao() and coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Apenas a gestão pode mudar o rodízio.' using errcode = '42501';
  end if;
  update public.configuracoes set valor = case when p_ativo then 'true' else 'false' end
   where chave = 'rodizio_ativo';
  if not found then
    insert into public.configuracoes (chave, valor)
    values ('rodizio_ativo', case when p_ativo then 'true' else 'false' end);
  end if;
  if not p_ativo then
    return 0;
  end if;

  create temporary table if not exists _distribuidos (vendedor_id uuid) on commit drop;
  truncate _distribuidos;
  for l in
    select id from public.leads
     where vendedor_id is null and deletado_em is null
       and not coalesce(is_teste, false)
       and status_crm not in ('fechado', 'perdido')
       and created_at > now() - interval '30 days'
     order by created_at
     for update
  loop
    v_vend := public.proximo_vendedor_da_fila();
    exit when v_vend is null;
    update public.leads set vendedor_id = v_vend where id = l.id;
    insert into _distribuidos values (v_vend);
    n := n + 1;
  end loop;
  perform public.avisar_vendedor_formulario(vendedor_id, count(*)::int)
     from _distribuidos group by vendedor_id;
  return n;
end;
$$;

-- Nome antigo, mantido para quem ainda chama.
create or replace function public.definir_rodizio_formulario(p_ativo boolean)
returns integer
language sql
security definer
set search_path = public
as $$
  select public.definir_rodizio(p_ativo)
$$;

revoke all on function public.definir_rodizio(boolean) from public, anon;
grant execute on function public.definir_rodizio(boolean) to authenticated, service_role;

-- O aviso da distribuição agora vale para qualquer origem.
create or replace function public.avisar_vendedor_formulario(p_vendedor_id uuid, p_quantidade integer)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, body, link)
  select v.profile_id, 'lead_atribuido', 'Leads atribuídos a você',
         p_quantidade || case when p_quantidade = 1 then ' lead foi atribuído'
                                                  else ' leads foram atribuídos' end
         || ' a você pelo rodízio. Veja no CRM.',
         '/dashboard/crm'
    from public.vendedores v
   where v.id = p_vendedor_id and v.profile_id is not null and p_quantidade > 0
$$;

-- ---------------------------------------------------------------------------
-- 2. Membro excluído ou desativado sai do rodízio
-- ---------------------------------------------------------------------------
update public.vendedores v
   set ativo = false
  from public.profiles p
 where p.id = v.profile_id
   and v.ativo
   and (p.deletado_em is not null or not p.ativo);

create or replace function public.vendedor_sai_do_rodizio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.deletado_em is not null and old.deletado_em is null)
     or (not new.ativo and old.ativo) then
    update public.vendedores set ativo = false where profile_id = new.id and ativo;
  end if;
  return new;
end;
$$;

drop trigger if exists vendedor_sai_do_rodizio on public.profiles;
create trigger vendedor_sai_do_rodizio
  after update of ativo, deletado_em on public.profiles
  for each row execute function public.vendedor_sai_do_rodizio();

-- ---------------------------------------------------------------------------
-- 3. Acessos por usuário
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists acessos text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_acessos_validos;
alter table public.profiles add constraint profiles_acessos_validos
  check (acessos <@ array['agenda', 'lotes', 'lotes_3d']::text[]);

comment on column public.profiles.acessos is
  'Telas extras do vendedor além do CRM: agenda, lotes, lotes_3d. Admin e gestor veem tudo.';

-- ---------------------------------------------------------------------------
-- 4. Campos de acesso do perfil só mudam pela gestão da equipe
-- ---------------------------------------------------------------------------
create or replace function public.profiles_proteger_acesso()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    if new.role is distinct from old.role
       or new.vendedor_id is distinct from old.vendedor_id
       or new.ativo is distinct from old.ativo
       or new.deletado_em is distinct from old.deletado_em
       or new.acessos is distinct from old.acessos
       or new.id is distinct from old.id
    then
      raise exception 'Papel, vínculo, status e acessos só podem ser alterados pela gestão da equipe.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_proteger_acesso on public.profiles;
create trigger profiles_proteger_acesso
  before update on public.profiles
  for each row execute function public.profiles_proteger_acesso();

-- Só administradores definem os acessos (a função roda como dona da tabela,
-- então passa pela proteção acima).
create or replace function public.definir_acessos(p_profile_id uuid, p_acessos text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acessos text[];
begin
  if coalesce(public.get_my_role()::text, '') <> 'admin'
     and coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Apenas administradores definem os acessos.' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct a order by a), '{}') into v_acessos
    from unnest(coalesce(p_acessos, '{}')) a
   where a in ('agenda', 'lotes', 'lotes_3d');
  update public.profiles set acessos = v_acessos where id = p_profile_id;
  if not found then
    raise exception 'Membro não encontrado.';
  end if;
  return v_acessos;
end;
$$;

revoke all on function public.definir_acessos(uuid, text[]) from public, anon;
grant execute on function public.definir_acessos(uuid, text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Entrega manual de um lead
-- ---------------------------------------------------------------------------
create or replace function public.atribuir_vendedor(p_lead_id uuid, p_vendedor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_vend record;
  v_quem text;
begin
  if not public.sou_gestao() and coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Apenas a gestão entrega leads manualmente.' using errcode = '42501';
  end if;
  select id, nome, vendedor_id into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.id is null then
    raise exception 'Lead não encontrado.';
  end if;
  if v_lead.vendedor_id is not distinct from p_vendedor_id then
    return;
  end if;
  if p_vendedor_id is not null then
    select id, nome, profile_id into v_vend from public.vendedores where id = p_vendedor_id;
    if v_vend.id is null then
      raise exception 'Vendedor não encontrado.';
    end if;
  end if;
  select nome into v_quem from public.profiles where id = auth.uid();

  update public.leads set vendedor_id = p_vendedor_id where id = p_lead_id;

  insert into public.interacoes (lead_id, tipo, canal, conteudo)
  values (p_lead_id, 'sistema', 'atribuicao',
          case when p_vendedor_id is null then 'Lead tirado do vendedor'
               else 'Lead entregue manualmente a ' || v_vend.nome end
          || coalesce(' por ' || v_quem, '') || '.');

  if v_vend.profile_id is not null then
    insert into public.notifications (user_id, type, title, body, link)
    values (v_vend.profile_id, 'lead_atribuido', 'Novo lead atribuído',
            v_lead.nome || ' foi entregue a você' || coalesce(' por ' || v_quem, '') || '.',
            '/dashboard/crm?lead=' || p_lead_id);
  end if;
end;
$$;

revoke all on function public.atribuir_vendedor(uuid, uuid) from public, anon;
grant execute on function public.atribuir_vendedor(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
