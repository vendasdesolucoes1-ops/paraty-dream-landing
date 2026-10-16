-- Condições comerciais: uma vigente, sincronia com fatos_comerciais e RPC pública.
\set ON_ERROR_STOP 1
begin;
do $$
declare v_nova uuid; r record;
begin
  -- Semente: a condição de lançamento vigente e os fatos aprovados.
  assert (select count(*) from public.condicoes_comerciais where vigente) = 1, 'uma vigente na semente';
  assert (select valor from public.fatos_comerciais where chave = 'parcelas_max' and status = 'aprovado') = '240',
         'fatos sincronizados com a semente';

  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'g3@teste.local');
  insert into public.profiles (id, email, nome, role, ativo)
  values ('00000000-0000-0000-0000-0000000000e1', 'g3@teste.local', 'G', 'gestor', true)
  on conflict (id) do update set role = 'gestor', ativo = true;

  insert into public.condicoes_comerciais (nome, entrada_percentual, parcelas_max)
  values ('Feirão', 5, 180) returning id into v_nova;

  -- Sem gestão: não troca.
  begin
    perform public.definir_condicao_vigente(v_nova);
    assert false, 'sem gestão deveria recusar';
  exception when insufficient_privilege then null;
  end;

  perform set_config('teste.uid', '00000000-0000-0000-0000-0000000000e1', true);
  perform public.definir_condicao_vigente(v_nova);
  assert (select count(*) from public.condicoes_comerciais where vigente) = 1, 'continua uma vigente';
  assert (select vigente from public.condicoes_comerciais where id = v_nova), 'nova vigente';
  assert (select valor from public.fatos_comerciais where chave = 'entrada_percentual') = '5', 'entrada sincronizada';
  assert (select valor from public.fatos_comerciais where chave = 'parcelas_max') = '180', 'prazo sincronizado';

  -- Editar a vigente atualiza os fatos.
  update public.condicoes_comerciais set entrada_percentual = 7.5 where id = v_nova;
  assert (select valor from public.fatos_comerciais where chave = 'entrada_percentual') = '7.5', 'edição sincronizada';

  select * into r from public.condicao_vigente_publica();
  assert r.parcelas_max = 180, 'RPC pública';

  -- Encerrar: nenhuma vigente, fatos revogados, landing sem números.
  perform public.definir_condicao_vigente(null);
  assert not exists (select 1 from public.condicoes_comerciais where vigente), 'nenhuma vigente';
  assert (select status from public.fatos_comerciais where chave = 'parcelas_max') = 'revogado', 'fatos revogados';
  assert not exists (select 1 from public.condicao_vigente_publica()), 'landing sem números';

  -- Duas vigentes ao mesmo tempo são impossíveis.
  begin
    update public.condicoes_comerciais set vigente = true;
    assert false, 'duas vigentes';
  exception when unique_violation then null;
  end;
end $$;
rollback;
