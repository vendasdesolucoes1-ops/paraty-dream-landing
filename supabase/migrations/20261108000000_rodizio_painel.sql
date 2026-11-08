-- Tela Rodízio (Vendas → Rodízio): fila, limite por dia, histórico e
-- distribuição dos leads em espera com prévia.
--
-- 1. Limite de leads por dia por vendedor (nulo = sem limite).
-- 2. Histórico de atribuições (rodizio_atribuicoes): cada vez que a fila
--    escolhe alguém fica uma linha; quando o lead recebe o vendedor, a linha
--    ganha o lead. Entregas manuais e remoções também entram, pelo gatilho em
--    leads. Os contadores da tela (hoje, total, última) saem daqui.
-- 3. A fila respeita o limite do dia (fuso de São Paulo).
-- 4. Ligar o rodízio não reparte mais os leads em espera sozinho: isso virou a
--    ação "Distribuir leads em espera", com prévia antes de confirmar.
--    definir_rodizio() continua igual para o painel antigo até a publicação.
-- 5. RPCs da tela, só para a gestão: rodizio_painel, rodizio_historico,
--    rodizio_ligar, rodizio_mover, rodizio_distribuir_espera.

-- ---------------------------------------------------------------------------
-- 1. Limite diário
-- ---------------------------------------------------------------------------
alter table public.vendedores add column if not exists limite_diario integer;
alter table public.vendedores drop constraint if exists vendedores_limite_diario_check;
alter table public.vendedores add constraint vendedores_limite_diario_check
  check (limite_diario is null or limite_diario between 1 and 500);

comment on column public.vendedores.limite_diario is
  'Máximo de leads por dia vindos do rodízio (nulo = sem limite). Entrega manual não conta.';

-- ---------------------------------------------------------------------------
-- 2. Histórico de atribuições
-- ---------------------------------------------------------------------------
create table if not exists public.rodizio_atribuicoes (
  id          bigint generated always as identity primary key,
  vendedor_id uuid not null references public.vendedores(id) on delete cascade,
  lead_id     uuid references public.leads(id) on delete set null,
  -- rodizio: lead novo pela fila | distribuicao: leads em espera repartidos
  -- manual: entregue pela gestão | remocao: lead tirado do vendedor
  -- sistema: vendedor gravado por outra rotina (ex.: importação)
  origem      text not null check (origem in ('rodizio', 'distribuicao', 'manual', 'remocao', 'sistema')),
  autor_id    uuid default auth.uid(),
  criado_em   timestamptz not null default now()
);

create index if not exists rodizio_atribuicoes_vendedor_idx
  on public.rodizio_atribuicoes (vendedor_id, criado_em desc);
create index if not exists rodizio_atribuicoes_criado_idx
  on public.rodizio_atribuicoes (criado_em desc);
create index if not exists rodizio_atribuicoes_pendente_idx
  on public.rodizio_atribuicoes (vendedor_id, criado_em) where lead_id is null;

alter table public.rodizio_atribuicoes enable row level security;
revoke all on public.rodizio_atribuicoes from anon, authenticated;
grant select on public.rodizio_atribuicoes to authenticated;
drop policy if exists "rodizio_atribuicoes_select_gestao" on public.rodizio_atribuicoes;
create policy "rodizio_atribuicoes_select_gestao" on public.rodizio_atribuicoes
  for select to authenticated using (public.sou_gestao());

-- Início do dia de hoje em São Paulo (os limites zeram à meia-noite local).
create or replace function public.rodizio_inicio_do_dia()
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo'
$$;

-- Leads que a fila entregou hoje ao vendedor (o que conta para o limite).
create or replace function public.rodizio_recebidos_hoje(p_vendedor_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.rodizio_atribuicoes
   where vendedor_id = p_vendedor_id
     and origem in ('rodizio', 'distribuicao')
     and criado_em >= public.rodizio_inicio_do_dia()
$$;
revoke all on function public.rodizio_recebidos_hoje(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Fila com limite do dia
-- ---------------------------------------------------------------------------
-- Quem chama (webhook, formulário, qualificação, cadastro manual) segue
-- usando get_next_round_robin_salesperson(); a escolha vira uma linha do
-- histórico, ainda sem lead.
create or replace function public.proximo_vendedor_da_fila()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_origem text := coalesce(nullif(current_setting('rodizio.origem', true), ''), 'rodizio');
begin
  -- Sem telefone o vendedor não recebe o aviso do lead: fica fora da fila.
  select v.id into v_id
    from public.vendedores v
   where v.ativo = true and v.no_rodizio = true
     and length(regexp_replace(coalesce(v.telefone, ''), '\D', '', 'g')) >= 10
     and (v.limite_diario is null or public.rodizio_recebidos_hoje(v.id) < v.limite_diario)
   order by v.posicao_round_robin asc, v.created_at asc
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

revoke all on function public.proximo_vendedor_da_fila() from public, anon, authenticated;
grant execute on function public.proximo_vendedor_da_fila() to service_role;

-- Gatilho em leads: liga a escolha da fila ao lead, ou registra a entrega
-- manual / a remoção quando o vendedor muda por outro caminho.
create or replace function public.rodizio_registrar_atribuicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno bigint;
  v_antigo uuid := case when tg_op = 'UPDATE' then old.vendedor_id end;
begin
  if new.vendedor_id is not distinct from v_antigo then
    return new;
  end if;

  if new.vendedor_id is null then
    insert into public.rodizio_atribuicoes (vendedor_id, lead_id, origem)
    values (v_antigo, new.id, 'remocao');
    return new;
  end if;

  -- A escolha da fila acontece segundos antes de o lead ser gravado (às vezes
  -- em outra chamada): casa com a escolha mais antiga ainda sem lead.
  select id into v_turno
    from public.rodizio_atribuicoes
   where vendedor_id = new.vendedor_id
     and lead_id is null
     and origem in ('rodizio', 'distribuicao')
     and criado_em > now() - interval '10 minutes'
   order by criado_em
   limit 1
   for update skip locked;

  if v_turno is not null then
    update public.rodizio_atribuicoes set lead_id = new.id where id = v_turno;
  else
    insert into public.rodizio_atribuicoes (vendedor_id, lead_id, origem)
    values (new.vendedor_id, new.id,
            case when auth.uid() is not null then 'manual' else 'sistema' end);
  end if;
  return new;
end;
$$;

drop trigger if exists rodizio_registrar_atribuicao on public.leads;
create trigger rodizio_registrar_atribuicao
  after insert or update of vendedor_id on public.leads
  for each row execute function public.rodizio_registrar_atribuicao();

-- ---------------------------------------------------------------------------
-- 4. RPCs da tela (só gestão)
-- ---------------------------------------------------------------------------
create or replace function public.rodizio_exigir_gestao()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.sou_gestao() and coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Apenas a gestão opera o rodízio.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.rodizio_exigir_gestao() from public, anon, authenticated;

-- Leads que esperam vendedor: o mesmo critério da distribuição.
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
     and created_at > now() - interval '30 days'
   order by created_at
$$;
revoke all on function public.rodizio_leads_em_espera() from public, anon, authenticated;

-- Tudo o que a tela mostra, numa chamada.
create or replace function public.rodizio_painel()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_inicio timestamptz := public.rodizio_inicio_do_dia();
  v_vendedores jsonb;
begin
  perform public.rodizio_exigir_gestao();

  with base as (
    select v.id, v.nome, v.email, v.telefone, v.ativo, v.no_rodizio, v.limite_diario,
           v.posicao_round_robin, v.created_at, v.profile_id,
           p.ativo as login_ativo, p.deletado_em as login_excluido, p.role as papel,
           length(regexp_replace(coalesce(v.telefone, ''), '\D', '', 'g')) >= 10 as tem_telefone,
           (select count(*) from public.rodizio_atribuicoes a
             where a.vendedor_id = v.id and a.origem in ('rodizio', 'distribuicao')
               and a.criado_em >= v_inicio)::int as hoje,
           (select count(*) from public.rodizio_atribuicoes a
             where a.vendedor_id = v.id and a.origem in ('rodizio', 'distribuicao', 'manual'))::int as total,
           (select max(a.criado_em) from public.rodizio_atribuicoes a
             where a.vendedor_id = v.id and a.origem <> 'remocao') as ultima,
           (select count(*) from public.leads l
             where l.vendedor_id = v.id and l.deletado_em is null
               and l.status_crm not in ('fechado', 'perdido'))::int as carteira_aberta
      from public.vendedores v
      left join public.profiles p on p.id = v.profile_id
  ),
  situacao as (
    select b.*,
           case
             when not b.ativo then 'inativo'
             when not b.no_rodizio then 'pausado'
             when not b.tem_telefone then 'sem_telefone'
             when b.limite_diario is not null and b.hoje >= b.limite_diario then 'limite'
             else 'na_fila'
           end as situacao
      from base b
  ),
  ordenado as (
    select s.*,
           case when s.situacao = 'na_fila'
                then row_number() over (partition by (s.situacao = 'na_fila')
                                        order by s.posicao_round_robin, s.created_at)
           end as vez
      from situacao s
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'nome', o.nome, 'email', o.email, 'telefone', o.telefone,
           'ativo', o.ativo, 'no_rodizio', o.no_rodizio, 'limite_diario', o.limite_diario,
           'tem_telefone', o.tem_telefone, 'situacao', o.situacao, 'vez', o.vez,
           'hoje', o.hoje, 'total', o.total, 'ultima', o.ultima,
           'carteira_aberta', o.carteira_aberta,
           'login', case
                      when o.profile_id is null then 'sem_login'
                      when o.login_excluido is not null then 'excluido'
                      when not coalesce(o.login_ativo, false) then 'desativado'
                      else 'ativo'
                    end,
           'papel', o.papel
         ) order by o.ativo desc, o.no_rodizio desc, o.posicao_round_robin, o.created_at), '[]'::jsonb)
    into v_vendedores
    from ordenado o;

  return jsonb_build_object(
    'ativo', public.rodizio_ativo(),
    'em_espera', (select count(*) from public.rodizio_leads_em_espera()),
    'hoje', (select count(*) from public.rodizio_atribuicoes
              where origem in ('rodizio', 'distribuicao') and criado_em >= v_inicio),
    'total', (select count(*) from public.rodizio_atribuicoes
               where origem in ('rodizio', 'distribuicao', 'manual')),
    'vendedores', v_vendedores
  );
end;
$$;
revoke all on function public.rodizio_painel() from public, anon;
grant execute on function public.rodizio_painel() to authenticated, service_role;

-- Últimas atribuições, com o nome do lead, do vendedor e de quem fez.
create or replace function public.rodizio_historico(p_limite integer default 50)
returns table (
  id bigint, criado_em timestamptz, origem text,
  lead_id uuid, lead_nome text, vendedor_id uuid, vendedor_nome text, autor_nome text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.rodizio_exigir_gestao();
  return query
    select a.id, a.criado_em, a.origem, a.lead_id, l.nome, a.vendedor_id, v.nome, p.nome
      from public.rodizio_atribuicoes a
      join public.vendedores v on v.id = a.vendedor_id
      left join public.leads l on l.id = a.lead_id
      left join public.profiles p on p.id = a.autor_id
     -- Escolha da fila que ainda não virou lead (ou falhou) não é atribuição.
     where a.lead_id is not null
     order by a.criado_em desc
     limit least(greatest(coalesce(p_limite, 50), 1), 200);
end;
$$;
revoke all on function public.rodizio_historico(integer) from public, anon;
grant execute on function public.rodizio_historico(integer) to authenticated, service_role;

-- Liga ou desliga a chave, sem repartir os leads em espera.
create or replace function public.rodizio_ligar(p_ativo boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rodizio_exigir_gestao();
  update public.configuracoes set valor = case when p_ativo then 'true' else 'false' end
   where chave = 'rodizio_ativo';
  if not found then
    insert into public.configuracoes (chave, valor)
    values ('rodizio_ativo', case when p_ativo then 'true' else 'false' end);
  end if;
  return p_ativo;
end;
$$;
revoke all on function public.rodizio_ligar(boolean) from public, anon;
grant execute on function public.rodizio_ligar(boolean) to authenticated, service_role;

-- Sobe (-1) ou desce (+1) o vendedor uma posição na fila.
create or replace function public.rodizio_mover(p_vendedor_id uuid, p_direcao integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_i integer;
  v_j integer;
begin
  perform public.rodizio_exigir_gestao();
  if p_direcao not in (-1, 1) then
    raise exception 'Direção inválida.' using errcode = '22023';
  end if;

  -- Renumera 1..n na ordem atual (posições repetidas deixavam a ordem ambígua).
  select array_agg(id order by posicao_round_robin, created_at) into v_ids
    from public.vendedores where ativo and no_rodizio;
  v_i := array_position(v_ids, p_vendedor_id);
  if v_i is null then
    raise exception 'Vendedor fora da fila.' using errcode = '22023';
  end if;
  v_j := v_i + p_direcao;
  if v_j < 1 or v_j > array_length(v_ids, 1) then
    return;
  end if;
  v_ids[v_i] := v_ids[v_j];
  v_ids[v_j] := p_vendedor_id;

  update public.vendedores v
     set posicao_round_robin = o.pos
    from unnest(v_ids) with ordinality as o(id, pos)
   where v.id = o.id;
end;
$$;
revoke all on function public.rodizio_mover(uuid, integer) from public, anon;
grant execute on function public.rodizio_mover(uuid, integer) to authenticated, service_role;

-- Reparte os leads em espera pela fila. Com p_confirmar = false só simula:
-- faz a distribuição de verdade e desfaz tudo, devolvendo quantos iriam para
-- cada um. Respeita o limite do dia; quem sobrar continua em espera.
create or replace function public.rodizio_distribuir_espera(p_confirmar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  v_vend uuid;
  v_resultado jsonb;
  v_contagem jsonb := '{}'::jsonb;
  v_total integer := 0;
  v_espera integer;
begin
  perform public.rodizio_exigir_gestao();
  select count(*) into v_espera from public.rodizio_leads_em_espera();

  begin
    perform set_config('rodizio.origem', 'distribuicao', true);
    for l in
      select le.id from public.leads le
       where le.id in (select public.rodizio_leads_em_espera())
       order by le.created_at
       for update
    loop
      v_vend := public.proximo_vendedor_da_fila();
      exit when v_vend is null;
      update public.leads set vendedor_id = v_vend where id = l.id;
      v_contagem := jsonb_set(v_contagem, array[v_vend::text],
                              to_jsonb(coalesce((v_contagem ->> v_vend::text)::int, 0) + 1));
      v_total := v_total + 1;
    end loop;
    perform set_config('rodizio.origem', '', true);

    select coalesce(jsonb_agg(jsonb_build_object('vendedor_id', v.id, 'nome', v.nome,
                                                 'quantidade', (c.value)::int)
                              order by v.nome), '[]'::jsonb)
      into v_resultado
      from jsonb_each(v_contagem) c
      join public.vendedores v on v.id = c.key::uuid;

    if p_confirmar then
      perform public.avisar_vendedor_formulario(c.key::uuid, (c.value)::int)
         from jsonb_each(v_contagem) c;
    else
      -- Desfaz a simulação (o bloco com exception volta ao savepoint).
      raise exception using errcode = 'P0001', message = 'rodizio_simulacao';
    end if;
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rodizio_simulacao' then
      raise;
    end if;
    perform set_config('rodizio.origem', '', true);
  end;

  return jsonb_build_object(
    'confirmado', p_confirmar,
    'em_espera', v_espera,
    'distribuidos', v_total,
    'continuam_em_espera', v_espera - v_total,
    'por_vendedor', v_resultado
  );
end;
$$;
revoke all on function public.rodizio_distribuir_espera(boolean) from public, anon;
grant execute on function public.rodizio_distribuir_espera(boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
