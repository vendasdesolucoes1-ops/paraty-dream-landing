-- Opt-out só se desfaz pela RPC, com gestão e justificativa.
\set ON_ERROR_STOP 1
begin;
do $$
declare v_lead uuid;
begin
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'g@teste.local');
  insert into public.profiles (id, email, nome, role, ativo)
  values ('00000000-0000-0000-0000-0000000000c1', 'g@teste.local', 'G', 'gestor', true)
  on conflict (id) do update set role = 'gestor', ativo = true;
  insert into public.leads (nome, telefone, contato_bloqueado) values ('Tia', '5524999993001', true)
  returning id into v_lead;

  -- Update comum como usuário do painel: barrado.
  set local role authenticated;
  perform set_config('teste.uid', '00000000-0000-0000-0000-0000000000c1', true);
  begin
    update public.leads set contato_bloqueado = false where id = v_lead;
    assert false, 'update direto deveria ser barrado';
  exception when insufficient_privilege then
    assert sqlerrm like 'Opt-out só pode%', 'barrado pelo motivo errado: ' || sqlerrm;
  end;

  -- Sem justificativa: recusa.
  begin
    perform public.desbloquear_contato(v_lead, 'curto');
    assert false, 'justificativa curta';
  exception when invalid_parameter_value then null;
  end;

  perform public.desbloquear_contato(v_lead, 'Lead pediu por escrito para voltar a receber.');
  reset role;
  assert not (select contato_bloqueado from public.leads where id = v_lead), 'desbloqueado';
  assert exists (select 1 from public.interacoes where lead_id = v_lead and conteudo like 'Opt-out desfeito%'),
         'justificativa no histórico';
end $$;
rollback;
