-- Integração Meta, etapa 2: tabelas de estrutura de Ads e controle de execuções.
-- Cobre: upsert idempotente, check de status e acesso (gestão lê; vendedor e anon não).
\set ON_ERROR_STOP 1
begin;
do $$
declare v_exec uuid; n integer;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-00000000e1e1', 'g@meta.local'),
    ('00000000-0000-0000-0000-00000000e1e2', 'v@meta.local');
  insert into public.profiles (id, email, nome, role, ativo) values
    ('00000000-0000-0000-0000-00000000e1e1', 'g@meta.local', 'Gestor', 'gestor', true),
    ('00000000-0000-0000-0000-00000000e1e2', 'v@meta.local', 'Vendedor', 'vendedor', true)
  on conflict (id) do update set role = excluded.role, ativo = true;

  -- Upsert por ID: rodar duas vezes não duplica e atualiza o conteúdo.
  insert into public.meta_campanhas (id, conta_id, name, effective_status, daily_budget)
  values ('c1', 'act_1', 'Lotes', 'ACTIVE', 5000)
  on conflict (id) do update set name = excluded.name, effective_status = excluded.effective_status,
                                 daily_budget = excluded.daily_budget;
  insert into public.meta_campanhas (id, conta_id, name, effective_status, daily_budget)
  values ('c1', 'act_1', 'Lotes v2', 'ARCHIVED', 7000)
  on conflict (id) do update set name = excluded.name, effective_status = excluded.effective_status,
                                 daily_budget = excluded.daily_budget;
  assert (select count(*) from public.meta_campanhas) = 1, 'upsert não pode duplicar';
  assert (select name from public.meta_campanhas where id = 'c1') = 'Lotes v2', 'upsert atualiza';
  assert (select effective_status from public.meta_campanhas where id = 'c1') = 'ARCHIVED', 'arquivadas entram';

  insert into public.meta_conjuntos (id, campaign_id, conta_id, targeting)
  values ('s1', 'c1', 'act_1', '{"geo_locations": {"cities": [{"key": "1"}]}}');
  insert into public.meta_anuncios (id, adset_id, campaign_id, conta_id, creative_object_story_spec)
  values ('a1', 's1', 'c1', 'act_1', '{"page_id": "P"}');
  insert into public.meta_conta_anuncios (id, nome, moeda, fuso)
  values ('act_1', 'VS - Moradas', 'BRL', 'America/Sao_Paulo');

  -- Controle de execuções: status fora da lista é recusado.
  insert into public.meta_sync_execucoes (job) values ('ads_estrutura') returning id into v_exec;
  assert (select status from public.meta_sync_execucoes where id = v_exec) = 'executando', 'começa executando';
  update public.meta_sync_execucoes
     set status = 'erro', finalizado_em = now(), codigo_erro = 190, erro = 'token expirado'
   where id = v_exec;
  begin
    update public.meta_sync_execucoes set status = 'quebrado' where id = v_exec;
    assert false, 'status inválido deveria ser recusado';
  exception when check_violation then null;
  end;
  begin
    update public.meta_sync_execucoes set registros = -1 where id = v_exec;
    assert false, 'registros negativos deveriam ser recusados';
  exception when check_violation then null;
  end;

  -- Gestão lê tudo.
  set local role authenticated;
  perform set_config('teste.uid', '00000000-0000-0000-0000-00000000e1e1', true);
  select count(*) into n from public.meta_campanhas;
  assert n = 1, 'gestão deveria ver a campanha';
  select count(*) into n from public.meta_sync_execucoes;
  assert n = 1, 'gestão deveria ver as execuções';

  -- A gestão também não escreve pelo painel: só a service_role.
  begin
    insert into public.meta_campanhas (id, conta_id) values ('c9', 'act_1');
    assert false, 'authenticated não deveria inserir';
  exception when insufficient_privilege then null;
  end;

  -- Vendedor não enxerga nada (RLS filtra, sem erro).
  perform set_config('teste.uid', '00000000-0000-0000-0000-00000000e1e2', true);
  select count(*) into n from public.meta_campanhas;
  assert n = 0, 'vendedor não deveria ver campanhas';
  select count(*) into n from public.meta_anuncios;
  assert n = 0, 'vendedor não deveria ver anúncios';
  reset role;

  -- anon não tem nem o privilégio.
  set local role anon;
  begin
    perform count(*) from public.meta_campanhas;
    assert false, 'anon não deveria ler';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;
rollback;
