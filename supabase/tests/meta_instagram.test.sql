-- Integração Meta, etapa 4: tabelas do Instagram.
-- Cobre: chaves únicas (reprocessar atualiza), check da demografia e acesso.
\set ON_ERROR_STOP 1
begin;
do $$
declare n integer;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-00000000e3e1', 'g@ig.local'),
    ('00000000-0000-0000-0000-00000000e3e2', 'v@ig.local');
  insert into public.profiles (id, email, nome, role, ativo) values
    ('00000000-0000-0000-0000-00000000e3e1', 'g@ig.local', 'Gestor', 'gestor', true),
    ('00000000-0000-0000-0000-00000000e3e2', 'v@ig.local', 'Vendedor', 'vendedor', true)
  on conflict (id) do update set role = excluded.role, ativo = true;

  -- Snapshot da conta: um por dia; a captura seguinte do mesmo dia atualiza.
  insert into public.ig_conta_diaria (ig_user_id, data, followers_count) values ('IG1', '2026-10-30', 1200)
  on conflict (ig_user_id, data) do update set followers_count = excluded.followers_count;
  insert into public.ig_conta_diaria (ig_user_id, data, followers_count) values ('IG1', '2026-10-30', 1210)
  on conflict (ig_user_id, data) do update set followers_count = excluded.followers_count;
  assert (select count(*) from public.ig_conta_diaria) = 1, 'um snapshot por dia';
  assert (select followers_count from public.ig_conta_diaria) = 1210, 'snapshot atualizado';

  -- Insights da conta em formato longo: uma linha por (dia, métrica).
  insert into public.ig_insights_conta_diario (ig_user_id, data, metrica, valor)
  values ('IG1', '2026-10-29', 'reach', 290), ('IG1', '2026-10-29', 'views', 400);
  insert into public.ig_insights_conta_diario (ig_user_id, data, metrica, valor)
  values ('IG1', '2026-10-29', 'reach', 295)
  on conflict (ig_user_id, data, metrica) do update set valor = excluded.valor;
  assert (select count(*) from public.ig_insights_conta_diario) = 2, 'upsert não duplica';
  assert (select valor from public.ig_insights_conta_diario where metrica = 'reach') = 295, 'valor atualizado';
  begin
    insert into public.ig_insights_conta_diario (ig_user_id, data, metrica, valor) values ('IG1', '2026-10-28', 'reach', null);
    assert false, 'valor nulo deveria ser recusado (sem dado = sem linha)';
  exception when not_null_violation then null;
  end;

  -- Demografia: tipo restrito aos breakdowns pedidos.
  insert into public.ig_demografia (ig_user_id, data, tipo, chave, valor)
  values ('IG1', '2026-10-30', 'age', '25-34', 100), ('IG1', '2026-10-30', 'country', 'BR', 900);
  begin
    insert into public.ig_demografia (ig_user_id, data, tipo, chave, valor) values ('IG1', '2026-10-30', 'cidade', 'X', 1);
    assert false, 'tipo inválido deveria ser recusado';
  exception when check_violation then null;
  end;

  -- Mídias e a métrica mais recente de cada uma.
  insert into public.ig_midias (id, ig_user_id, media_product_type, "timestamp") values ('M1', 'IG1', 'REELS', now());
  insert into public.ig_midia_insights (midia_id, metrica, valor) values ('M1', 'views', 10);
  insert into public.ig_midia_insights (midia_id, metrica, valor, capturado_em) values ('M1', 'views', 25, now())
  on conflict (midia_id, metrica) do update set valor = excluded.valor, capturado_em = excluded.capturado_em;
  assert (select count(*) from public.ig_midia_insights) = 1, 'uma linha por mídia e métrica';
  assert (select valor from public.ig_midia_insights) = 25, 'fica a captura mais recente';

  -- Gestão lê; não escreve pelo painel.
  set local role authenticated;
  perform set_config('teste.uid', '00000000-0000-0000-0000-00000000e3e1', true);
  select count(*) into n from public.ig_midias;
  assert n = 1, 'gestão deveria ver as mídias';
  select count(*) into n from public.ig_demografia;
  assert n = 2, 'gestão deveria ver a demografia';
  begin
    update public.ig_midias set caption = 'x';
    assert false, 'authenticated não deveria atualizar';
  exception when insufficient_privilege then null;
  end;

  -- Vendedor não vê nada; anon não tem privilégio.
  perform set_config('teste.uid', '00000000-0000-0000-0000-00000000e3e2', true);
  select count(*) into n from public.ig_midias;
  assert n = 0, 'vendedor não deveria ver mídias';
  select count(*) into n from public.ig_conta_diaria;
  assert n = 0, 'vendedor não deveria ver a conta';
  reset role;
  set local role anon;
  begin
    perform count(*) from public.ig_midia_insights;
    assert false, 'anon não deveria ler';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;
rollback;
