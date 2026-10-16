-- Testes de campanhas pelo worker (#54), métricas e vigia da fila (#53).

\set ON_ERROR_STOP 1
begin;

do $$
declare v_inst uuid; v_cad uuid; v_l1 uuid; v_l2 uuid; v_l3 uuid; m record; p record;
begin
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b1', 'gestor@teste.local');
  insert into public.profiles (id, email, nome, role, ativo)
  values ('00000000-0000-0000-0000-0000000000b1', 'gestor@teste.local', 'Gestor', 'gestor', true)
  on conflict (id) do update set role = 'gestor', ativo = true;
  insert into public.whatsapp_instances (instance_name, api_url, api_key, status, aquecimento_inicio)
  values ('camp', 'https://evolution.teste.local', 'x', 'connected', null) returning id into v_inst;

  insert into public.leads (nome, telefone) values ('Olga', '5524999991001') returning id into v_l1;
  insert into public.leads (nome, telefone) values ('Paulo', '5524999991002') returning id into v_l2;
  insert into public.leads (nome, telefone, contato_bloqueado) values ('Quel', '5524999991003', true) returning id into v_l3;

  -- Sem gestão: recusa.
  begin
    perform public.criar_campanha('x', 'oi', array[v_l1]);
    assert false, 'criar_campanha sem gestão deveria recusar';
  exception when insufficient_privilege then null;
  end;

  perform set_config('teste.uid', '00000000-0000-0000-0000-0000000000b1', true);
  v_cad := public.criar_campanha('Black Friday', 'Oi {{primeiro_nome}}!',
             array[v_l1, v_l2, v_l3], v_inst,
             '{"url": "https://cdn.teste.local/a.jpg", "tipo": "image"}'::jsonb);
  assert (select gatilho from public.cadencias where id = v_cad) = 'campanha', 'campanha é cadência de uma etapa';
  assert (select count(*) from public.inscricoes where cadencia_id = v_cad) = 3, 'três inscritos';

  -- Mídia inválida é recusada.
  begin
    perform public.criar_campanha('x', 'oi', array[v_l1], null, '{"tipo": "exe"}'::jsonb);
    assert false, 'mídia inválida';
  exception when invalid_parameter_value then null;
  end;

  perform public.agendar_etapas();
  select * into m from public.mensagens_agendadas where lead_id = v_l1 and tipo = 'campanha';
  assert m.status = 'pendente' and m.midia->>'tipo' = 'image' and m.instance_id = v_inst,
         'item da campanha com mídia e instância';

  -- Envio concluído encerra a inscrição como concluída.
  update public.mensagens_agendadas set status = 'enviado', enviado_em = now() where id = m.id;
  assert (select status from public.inscricoes where id = m.inscricao_id) = 'concluida', 'campanha conclui após envio';

  -- Lead bloqueado: o worker recebe opt_out do pode_enviar e cancela com motivo.
  update public.mensagens_agendadas set status = 'cancelado', erro = 'pode_enviar: opt_out'
   where lead_id = v_l3 and tipo = 'campanha';
  select * into p from public.progresso_cadencia(v_cad);
  assert p.total = 3 and p.enviados = 1 and p.concluidos = 1 and p.pulados = 1 and p.na_fila = 1,
         format('progresso errado: %s', row_to_json(p));
  assert exists (select 1 from public.motivos_cadencia(v_cad) where motivo like '%opt_out%'), 'motivo do pulado';

  -- Ack de leitura e resposta do lead entram nas métricas.
  insert into public.whatsapp_messages (instance_id, lead_id, remote_jid, message_id, from_me, content, status, mensagem_agendada_id)
  values (v_inst, v_l1, '5524999991001@s.whatsapp.net', 'camp-1', true, 'Oi Olga!', 'read', m.id);
  insert into public.whatsapp_messages (instance_id, lead_id, remote_jid, message_id, from_me, content)
  values (v_inst, v_l1, '5524999991001@s.whatsapp.net', 'camp-2', false, 'quero saber mais');
  select * into p from public.followup_metricas() where cadencia_id = v_cad;
  assert p.enviados = 1 and p.entregues = 1 and p.lidos = 1 and p.respondidos_72h = 1,
         format('métricas erradas: %s', row_to_json(p));

  -- Cancelar a campanha encerra o que falta.
  perform public.cancelar_campanha(v_cad);
  assert (select status from public.inscricoes where cadencia_id = v_cad and lead_id = v_l2) = 'cancelada',
         'cancelar campanha';
  perform set_config('teste.uid', '', true);
end $$;

-- Vigia: fila parada gera alerta no painel e no webhook externo, uma vez só.
do $$
declare v_lead uuid; v_r text[];
begin
  insert into public.leads (nome, telefone) values ('Rui', '5524999991004') returning id into v_lead;
  insert into public.mensagens_agendadas (lead_id, tipo, telefone, partes, agendado_para)
  values (v_lead, 'primeiro_contato', '5524999991004', '["oi"]', now() - interval '30 minutes');
  insert into vault.secrets (name, secret) values ('alerta_webhook_url', 'https://hooks.teste.local/x');
  insert into vault.secrets (name, secret) values ('heartbeat_url', 'https://ping.teste.local/y');

  v_r := public.vigiar_fila();
  assert 'fila_parada' = any (v_r), 'fila parada deveria alertar: ' || v_r::text;
  assert exists (select 1 from net.pedidos where url = 'https://hooks.teste.local/x'
                   and body->>'text' like '%Fila parada%'), 'alerta externo';
  assert exists (select 1 from public.notifications where type = 'fila_alerta'), 'alerta no painel';
  assert exists (select 1 from net.pedidos where url = 'https://ping.teste.local/y'), 'heartbeat';

  v_r := public.vigiar_fila();
  assert not ('fila_parada' = any (v_r)), 'não repete o alerta em 30 min';
end $$;

rollback;
\echo 'campanhas e métricas: todos os casos passaram'
