-- Rodízio automático: nenhum lead qualificado fica sem dono.
--
-- Até aqui a fila só agia quando um lead CHEGAVA. O que ficava sem vendedor
-- (rodízio desligado, fila vazia, lead mudado de etapa no CRM, devolvido por
-- vendedor inativo, anterior ao rodízio) ficava parado: em 14/11/2026 eram 63
-- qualificados sem dono, 34 deles pedindo visita.
--
-- 1. Modo "carga" (padrão): a vez é de quem tem MENOS leads abertos; empate
--    segue a fila. configuracoes.rodizio_modo = 'fila' volta à rotação pura.
-- 2. Lead que chega a Qualificado/Agendado/Visitou/Proposta sem vendedor
--    ganha um na hora (gatilho), venha do CRM, da Sophia ou de onde for.
-- 3. A cada 5 minutos, rodizio_distribuir_automatico entrega os qualificados
--    que sobraram, até configuracoes.rodizio_lote (padrão 3) por corretor por
--    rodada. Cada entrega gera o aviso de sempre ao corretor (avisos_vendedor).
-- 4. "Leads em espera" passa a incluir qualificados de qualquer idade (antes
--    só os dos últimos 30 dias entravam, e o resto nunca era distribuído).

-- ---------------------------------------------------------------------------
-- Configuração

create or replace function public.rodizio_modo()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when lower(coalesce((select valor from public.configuracoes
                                    where chave = 'rodizio_modo' limit 1), 'carga')) = 'fila'
              then 'fila' else 'carga' end
$$;

create or replace function public.rodizio_lote()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(1, least(50, coalesce(
    (select nullif(regexp_replace(valor, '\D', '', 'g'), '')::int
       from public.configuracoes where chave = 'rodizio_lote' limit 1), 3)))
$$;

insert into public.configuracoes (chave, valor) values ('rodizio_modo', 'carga')
on conflict (chave) do nothing;
insert into public.configuracoes (chave, valor) values ('rodizio_lote', '3')
on conflict (chave) do nothing;

revoke all on function public.rodizio_modo() from public, anon, authenticated;
revoke all on function public.rodizio_lote() from public, anon, authenticated;

create or replace function public.rodizio_carteira_aberta(p_vendedor_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.leads l
   where l.vendedor_id = p_vendedor_id and l.deletado_em is null
     and not coalesce(l.is_teste, false)
     and l.status_crm not in ('fechado', 'perdido')
$$;

revoke all on function public.rodizio_carteira_aberta(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fila: por carga (padrão) ou rotação pura.
--
-- rodizio.excluir (lista de uuids na sessão) tira da vez quem já recebeu o
-- lote desta rodada da distribuição automática.

create or replace function public.proximo_vendedor_da_fila()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_origem text := coalesce(nullif(current_setting('rodizio.origem', true), ''), 'rodizio');
  v_excluir uuid[] := coalesce(nullif(current_setting('rodizio.excluir', true), '')::uuid[], '{}');
  v_carga boolean := public.rodizio_modo() = 'carga';
begin
  select v.id into v_id
    from public.vendedores v
   where v.ativo = true and v.no_rodizio = true
     and length(regexp_replace(coalesce(v.telefone, ''), '\D', '', 'g')) >= 10
     and (v.limite_diario is null or public.rodizio_recebidos_hoje(v.id) < v.limite_diario)
     and not (v.id = any (v_excluir))
   order by case when v_carga then public.rodizio_carteira_aberta(v.id) else 0 end,
            v.posicao_round_robin asc, v.created_at asc
   limit 1
   for update skip locked;
  if v_id is null then
    return null;
  end if;
  update public.vendedores
     set posicao_round_robin = (select coalesce(max(posicao_round_robin), 0) + 1 from public.vendedores)
   where id = v_id;
  insert into public.rodizio_atribuicoes (vendedor_id, origem)
  values (v_id, case when v_origem = 'distribuicao' then 'distribuicao' else 'rodizio' end);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lead qualificado sem vendedor ganha um na hora.
--
-- AFTER + UPDATE separado de propósito: os gatilhos de aviso e de histórico
-- são "UPDATE OF vendedor_id" e não veriam um vendedor posto por um BEFORE
-- dentro de um UPDATE que só mexeu na etapa.

create or replace function public.leads_rodizio_ao_qualificar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vend uuid;
  v_nome text;
begin
  if new.vendedor_id is not null
     or new.status_crm not in ('qualificado', 'agendado', 'visitou', 'proposta')
     or (tg_op = 'UPDATE' and new.status_crm is not distinct from old.status_crm)
     or new.deletado_em is not null
     or coalesce(new.is_teste, false) or coalesce(new.interno, false)
     or coalesce(new.contato_bloqueado, false)
     or not public.rodizio_ativo() then
    return null;
  end if;

  v_vend := public.proximo_vendedor_da_fila();
  if v_vend is null then
    return null;
  end if;

  update public.leads set vendedor_id = v_vend where id = new.id and vendedor_id is null;
  if found then
    select nome into v_nome from public.vendedores where id = v_vend;
    insert into public.interacoes (lead_id, tipo, canal, conteudo)
    values (new.id, 'sistema', 'atribuicao',
            'Lead em ' || new.status_crm || ' sem vendedor: entregue a '
            || coalesce(v_nome, 'um vendedor') || ' pelo rodízio.');
  end if;
  return null;
end;
$$;

revoke all on function public.leads_rodizio_ao_qualificar() from public, anon, authenticated;

drop trigger if exists leads_rodizio_ao_qualificar on public.leads;
create trigger leads_rodizio_ao_qualificar
  after insert or update of status_crm on public.leads
  for each row execute function public.leads_rodizio_ao_qualificar();

-- ---------------------------------------------------------------------------
-- Distribuição contínua dos qualificados que sobraram.

create or replace function public.rodizio_distribuir_automatico()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  v_vend uuid;
  v_nome text;
  v_lote integer := public.rodizio_lote();
  v_por jsonb := '{}'::jsonb;
  v_excluir uuid[] := '{}';
  v_total integer := 0;
  n integer;
begin
  if not public.rodizio_ativo() then
    return 0;
  end if;
  -- Duas rodadas ao mesmo tempo repartiriam os mesmos leads.
  if not pg_try_advisory_xact_lock(hashtext('rodizio_distribuir_automatico')) then
    return 0;
  end if;

  perform set_config('rodizio.origem', 'distribuicao', true);
  for l in
    select le.id, le.status_crm from public.leads le
     where le.vendedor_id is null and le.deletado_em is null
       and not coalesce(le.is_teste, false) and not coalesce(le.interno, false)
       and not coalesce(le.contato_bloqueado, false) and le.sem_interesse_em is null
       and le.status_crm in ('qualificado', 'agendado', 'visitou', 'proposta')
     order by (le.status_crm <> 'qualificado') desc,
              (coalesce(le.quer_visitar, '') ilike 'sim%') desc,
              le.updated_at desc
     for update skip locked
  loop
    perform set_config('rodizio.excluir', v_excluir::text, true);
    v_vend := public.proximo_vendedor_da_fila();
    exit when v_vend is null;
    update public.leads set vendedor_id = v_vend where id = l.id and vendedor_id is null;
    select nome into v_nome from public.vendedores where id = v_vend;
    insert into public.interacoes (lead_id, tipo, canal, conteudo)
    values (l.id, 'sistema', 'atribuicao',
            'Lead em ' || l.status_crm || ' sem vendedor: entregue a '
            || coalesce(v_nome, 'um vendedor') || ' pelo rodízio automático.');
    n := coalesce((v_por ->> v_vend::text)::int, 0) + 1;
    v_por := jsonb_set(v_por, array[v_vend::text], to_jsonb(n));
    if n >= v_lote then
      v_excluir := v_excluir || v_vend;
    end if;
    v_total := v_total + 1;
  end loop;
  perform set_config('rodizio.origem', '', true);
  perform set_config('rodizio.excluir', '', true);
  return v_total;
end;
$$;

revoke all on function public.rodizio_distribuir_automatico() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- "Em espera": novos dos últimos 30 dias + qualificados de qualquer idade.

create or replace function public.rodizio_leads_em_espera()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.leads
   where vendedor_id is null and deletado_em is null
     and not coalesce(is_teste, false)
     and status_crm not in ('fechado', 'perdido')
     and (created_at > now() - interval '30 days'
          or status_crm in ('qualificado', 'agendado', 'visitou', 'proposta'))
   order by created_at
$$;

-- ---------------------------------------------------------------------------
-- Agenda (só onde há pg_cron).

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'rodizio-automatico';
    perform cron.schedule('rodizio-automatico', '*/5 * * * *',
                          'select public.rodizio_distribuir_automatico()');
  end if;
end;
$$;
