-- Integração Meta, etapa 3: insights diários, breakdowns e estado dos jobs.
-- Cobre: chave única (ad_id, data), upsert idempotente, check de tipo e acesso.
\set ON_ERROR_STOP 1
begin;
do $$
declare n integer;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-00000000e2e1', 'g@insights.local'),
    ('00000000-0000-0000-0000-00000000e2e2', 'v@insights.local');
  insert into public.profiles (id, email, nome, role, ativo) values
    ('00000000-0000-0000-0000-00000000e2e1', 'g@insights.local', 'Gestor', 'gestor', true),
    ('00000000-0000-0000-0000-00000000e2e2', 'v@insights.local', 'Vendedor', 'vendedor', true)
  on conflict (id) do update set role = excluded.role, ativo = true;

  -- Chave única (ad_id, data): reprocessar a janela atualiza em vez de duplicar.
  insert into public.meta_insights_diarios (ad_id, data, conta_id, spend, leads, actions)
  values ('a1', '2026-10-01', 'act_1', 10.50, 1, '[{"action_type":"lead","value":"1"}]');
  insert into public.meta_insights_diarios (ad_id, data, conta_id, spend, leads)
  values ('a1', '2026-10-01', 'act_1', 12.00, 2)
  on conflict (ad_id, data) do update set spend = excluded.spend, leads = excluded.leads;
  insert into public.meta_insights_diarios (ad_id, data, conta_id, spend) values ('a1', '2026-10-02', 'act_1', 5);
  assert (select count(*) from public.meta_insights_diarios) = 2, 'um registro por anúncio e dia';
  assert (select spend from public.meta_insights_diarios where ad_id = 'a1' and data = '2026-10-01') = 12.00,
         'reprocessamento atualiza o valor';
  begin
    insert into public.meta_insights_diarios (ad_id, data, conta_id) values ('a1', '2026-10-01', 'act_1');
    assert false, 'duplicata deveria ser recusada';
  exception when unique_violation then null;
  end;

  -- Breakdowns: a chave inclui tipo e as duas dimensões.
  insert into public.meta_insights_breakdowns (ad_id, data, tipo, dim1, dim2, conta_id, spend)
  values ('a1', '2026-10-01', 'idade_genero', '25-34', 'female', 'act_1', 3),
         ('a1', '2026-10-01', 'idade_genero', '25-34', 'male', 'act_1', 4),
         ('a1', '2026-10-01', 'regiao', 'Sao Paulo', '', 'act_1', 7);
  assert (select count(*) from public.meta_insights_breakdowns) = 3, 'dimensões distintas coexistem';
  begin
    insert into public.meta_insights_breakdowns (ad_id, data, tipo, conta_id) values ('a1', '2026-10-01', 'pais', 'act_1');
    assert false, 'tipo inválido deveria ser recusado';
  exception when check_violation then null;
  end;

  -- Estado dos jobs (cursor da carga inicial).
  insert into public.meta_sync_estado (chave, valor) values ('ads_historico', '{"concluido": false}')
  on conflict (chave) do update set valor = excluded.valor;
  insert into public.meta_sync_estado (chave, valor) values ('ads_historico', '{"concluido": true}')
  on conflict (chave) do update set valor = excluded.valor;
  assert (select count(*) from public.meta_sync_estado) = 1, 'uma linha por chave';
  assert (select (valor->>'concluido')::boolean from public.meta_sync_estado where chave = 'ads_historico'),
         'estado atualizado';

  -- Gestão lê; não escreve pelo painel.
  set local role authenticated;
  perform set_config('teste.uid', '00000000-0000-0000-0000-00000000e2e1', true);
  select count(*) into n from public.meta_insights_diarios;
  assert n = 2, 'gestão deveria ver os insights';
  select count(*) into n from public.meta_sync_estado;
  assert n = 1, 'gestão deveria ver o estado';
  begin
    delete from public.meta_insights_diarios;
    assert false, 'authenticated não deveria apagar';
  exception when insufficient_privilege then null;
  end;

  -- Vendedor não enxerga nada; anon nem o privilégio tem.
  perform set_config('teste.uid', '00000000-0000-0000-0000-00000000e2e2', true);
  select count(*) into n from public.meta_insights_diarios;
  assert n = 0, 'vendedor não deveria ver insights';
  select count(*) into n from public.meta_insights_breakdowns;
  assert n = 0, 'vendedor não deveria ver breakdowns';
  reset role;
  set local role anon;
  begin
    perform count(*) from public.meta_insights_breakdowns;
    assert false, 'anon não deveria ler';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;
rollback;
