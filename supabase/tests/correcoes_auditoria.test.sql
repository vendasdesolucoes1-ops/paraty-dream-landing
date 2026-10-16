-- Correções da auditoria: aprovação com outra mensagem na fila e um agente por instância.
\set ON_ERROR_STOP 1
begin;
do $$
declare v_lead uuid; v_rascunho uuid; v_inst uuid;
begin
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'g4@teste.local');
  insert into public.profiles (id, email, nome, role, ativo)
  values ('00000000-0000-0000-0000-0000000000f1', 'g4@teste.local', 'G', 'gestor', true)
  on conflict (id) do update set role = 'gestor', ativo = true;
  perform set_config('teste.uid', '00000000-0000-0000-0000-0000000000f1', true);

  insert into public.leads (nome, telefone, status_crm) values ('Aprovação', '5524999993001', 'novo')
  returning id into v_lead;
  insert into public.mensagens_agendadas (lead_id, tipo, telefone, partes)
  values (v_lead, 'cadencia', '5524999993001', '["na fila"]');
  insert into public.mensagens_agendadas (lead_id, tipo, telefone, partes, status)
  values (v_lead, 'cadencia', '5524999993001', '["rascunho"]', 'aguardando_aprovacao')
  returning id into v_rascunho;

  begin
    perform public.aprovar_envio(v_rascunho, null);
    assert false, 'deveria recusar com outra mensagem na fila';
  exception when invalid_parameter_value then
    assert sqlerrm like 'Este lead já tem outra mensagem%', 'mensagem amigável: ' || sqlerrm;
  end;
  assert (select status from public.mensagens_agendadas where id = v_rascunho) = 'aguardando_aprovacao',
         'rascunho continua esperando';

  -- Sem outra na fila, aprova.
  delete from public.mensagens_agendadas where lead_id = v_lead and status = 'pendente';
  perform public.aprovar_envio(v_rascunho, null);
  assert (select status from public.mensagens_agendadas where id = v_rascunho) = 'pendente', 'aprovado';

  -- Um agente por instância.
  insert into public.whatsapp_instances (instance_name, api_url, api_key) values ('teste-unico', 'https://evo.teste.local', 'x') returning id into v_inst;
  insert into public.ai_agents (name, instance_id) values ('A', v_inst);
  begin
    insert into public.ai_agents (name, instance_id) values ('B', v_inst);
    assert false, 'segundo agente na mesma instância';
  exception when unique_violation then null;
  end;
end $$;
rollback;
