-- Gravação atômica de cadência e contagem por status.
\set ON_ERROR_STOP 1
begin;
do $$
declare v_id uuid; v_e1 uuid; v_e2 uuid; r record;
begin
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'g2@teste.local');
  insert into public.profiles (id, email, nome, role, ativo)
  values ('00000000-0000-0000-0000-0000000000d1', 'g2@teste.local', 'G', 'gestor', true)
  on conflict (id) do update set role = 'gestor', ativo = true;
  perform set_config('teste.uid', '00000000-0000-0000-0000-0000000000d1', true);

  v_id := public.salvar_cadencia(
    '{"nome": "Nova", "gatilho": "manual", "ativa": true, "status_crm_validos": ["novo"]}',
    '[{"deslocamento": "1 day", "template": "A"}, {"deslocamento": "2 days", "template": "B"}]');
  select id into v_e1 from public.cadencia_etapas where cadencia_id = v_id and ordem = 1;
  select id into v_e2 from public.cadencia_etapas where cadencia_id = v_id and ordem = 2;
  assert v_e1 is not null and v_e2 is not null, 'duas etapas criadas';
  assert (select status_crm_validos from public.cadencias where id = v_id) = array['novo'], 'etapas do funil';

  -- Inverte a ordem, mantém os ids e remove nada; depois remove uma.
  perform public.salvar_cadencia(
    jsonb_build_object('id', v_id, 'nome', 'Nova', 'gatilho', 'manual'),
    jsonb_build_array(jsonb_build_object('id', v_e2, 'template', 'B2', 'deslocamento', '3 days'),
                      jsonb_build_object('id', v_e1, 'template', 'A')));
  assert (select ordem from public.cadencia_etapas where id = v_e2) = 1, 'reordenou';
  assert (select template from public.cadencia_etapas where id = v_e2) = 'B2', 'atualizou';
  perform public.salvar_cadencia(jsonb_build_object('id', v_id, 'nome', 'Nova', 'gatilho', 'manual'),
                                 jsonb_build_array(jsonb_build_object('id', v_e1, 'template', 'A')));
  assert (select count(*) from public.cadencia_etapas where cadencia_id = v_id) = 1, 'removeu';

  -- Erro no meio não deixa nada pela metade.
  begin
    perform public.salvar_cadencia(jsonb_build_object('id', v_id, 'nome', 'Nova', 'gatilho', 'manual'),
      jsonb_build_array(jsonb_build_object('template', 'X'), jsonb_build_object('template', 'Y', 'deslocamento', 'xx')));
    assert false, 'deslocamento inválido deveria falhar';
  exception when others then null;
  end;
  assert (select count(*) from public.cadencia_etapas where cadencia_id = v_id) = 1
     and (select ordem from public.cadencia_etapas where id = v_e1) = 1, 'transação desfeita';

  insert into public.leads (nome, telefone) values ('Ugo', '5524999994001');
  perform public._inscrever(v_id, (select id from public.leads where telefone = '5524999994001'));
  select * into r from public.contagem_inscricoes(v_id);
  assert r.status = 'ativa' and r.total = 1, 'contagem';
end $$;
rollback;
