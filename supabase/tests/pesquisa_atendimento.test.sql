-- Pesquisa de atendimento: inscrição ao entregar o lead, aprovação manual,
-- leitura da resposta e uma pesquisa por lead a cada 30 dias.
\set ON_ERROR_STOP 1
begin;
do $$
declare
  v_vend uuid;
  v_outro uuid;
  v_cad uuid;
  v_lead uuid;
  v_insc uuid;
  n integer;
  r record;
  j jsonb;
begin
  assert public.ler_nota_pesquisa('nota 4, gostei') = 4, 'número';
  assert public.ler_nota_pesquisa('foi ótimo!') = 5, 'palavra boa';
  assert public.ler_nota_pesquisa('péssimo') = 1, 'palavra ruim';
  assert public.ler_nota_pesquisa('tenho 360m2') is null, 'número fora de 1 a 5 não vale';
  assert public.ler_atendimento_pesquisa('ninguém me chamou ainda') = false, 'não atendido';
  assert public.ler_atendimento_pesquisa('sim, o Renan me ligou') = true, 'atendido';

  update public.vendedores set ativo = false, no_rodizio = false;
  insert into public.vendedores (nome, telefone, ativo, no_rodizio, posicao_round_robin)
  values ('Renan Pesquisa', '5524999994001', true, false, 1) returning id into v_vend;
  insert into public.vendedores (nome, telefone, ativo, no_rodizio, posicao_round_robin)
  values ('Outro Pesquisa', '5524999994002', true, false, 2) returning id into v_outro;

  -- A semente cria as duas pesquisas desligadas e com aprovação.
  select id into v_cad from public.cadencias where gatilho = 'pos_atendimento';
  assert v_cad is not null, 'pesquisa pós-atendimento semeada';
  assert (select not ativa and not envio_automatico from public.cadencias where id = v_cad),
    'semeada desligada e com aprovação';
  assert exists (select 1 from public.cadencias where gatilho = 'pos_visita'), 'pós-visita semeada';
  update public.cadencias set ativa = true where id = v_cad;

  insert into public.leads (nome, telefone, origem, status_crm)
  values ('Carla Souza', '5511955550001', 'whatsapp', 'qualificado') returning id into v_lead;
  update public.leads set vendedor_id = v_vend where id = v_lead;

  select id into v_insc from public.inscricoes where lead_id = v_lead and cadencia_id = v_cad;
  assert v_insc is not null, 'lead entregue entrou na pesquisa';

  -- O texto usa o nome do corretor.
  j := public.renderizar_template('O {{vendedor}} falou com você,{{primeiro_nome}}?', v_lead);
  assert j ->> 0 = 'O Renan falou com você, Carla?', format('template: %s', j ->> 0);

  -- Vence agora: com envio automático desligado vai para aprovação.
  update public.inscricoes set proxima_em = now() - interval '1 minute' where id = v_insc;
  update public.cadencia_etapas set deslocamento = interval '0', hora_fixa = null where cadencia_id = v_cad;
  perform public.agendar_etapas();
  select status into r from public.mensagens_agendadas where inscricao_id = v_insc;
  assert r.status = 'aguardando_aprovacao', format('foi para aprovação, veio %s', r.status);

  -- Automático ligado: sai direto.
  update public.cadencias set envio_automatico = true where id = v_cad;
  delete from public.mensagens_agendadas where inscricao_id = v_insc;
  update public.inscricoes set proxima_em = now() - interval '1 minute' where id = v_insc;
  perform public.agendar_etapas();
  select status into r from public.mensagens_agendadas where inscricao_id = v_insc;
  assert r.status = 'pendente', 'automático vai direto para a fila';

  -- Enviada; o lead responde em duas mensagens.
  update public.inscricoes set ultimo_envio_em = now() - interval '5 minutes', etapa_atual = 1
   where id = v_insc;
  insert into public.whatsapp_messages (lead_id, remote_jid, message_id, from_me, content, message_type, autor)
  values (v_lead, '5511955550001@s.whatsapp.net', 'pesq-1', false, 'Ninguém me chamou ainda. Nota 2', 'text', 'lead');
  select * into r from public.pesquisas_satisfacao where inscricao_id = v_insc;
  assert r.nota = 2, 'nota lida';
  assert r.foi_atendido = false, 'não foi atendido';
  assert r.vendedor_id = v_vend, 'corretor da pesquisa';
  assert (select status from public.inscricoes where id = v_insc) = 'concluida', 'pesquisa concluída';

  insert into public.whatsapp_messages (lead_id, remote_jid, message_id, from_me, content, message_type, autor)
  values (v_lead, '5511955550001@s.whatsapp.net', 'pesq-2', false, 'Qual o tamanho do menor lote?', 'text', 'lead');
  select * into r from public.pesquisas_satisfacao where inscricao_id = v_insc;
  assert r.tem_duvida, 'segunda mensagem soma a dúvida';
  assert r.comentario like '%menor lote%', 'comentário acumulado';
  select count(*) into n from public.pesquisas_satisfacao where lead_id = v_lead;
  assert n = 1, 'uma linha por pesquisa';
  assert exists (select 1 from public.interacoes where lead_id = v_lead and canal = 'pesquisa'), 'histórico';

  -- Trocar de corretor dentro de 30 dias não manda outra pesquisa.
  update public.leads set vendedor_id = v_outro where id = v_lead;
  select count(*) into n from public.inscricoes where lead_id = v_lead and cadencia_id = v_cad;
  assert n = 1, 'uma pesquisa por lead a cada 30 dias';

  -- Takeover não pausa pesquisa; resposta do lead não pausa.
  assert not public.gatilho_de_pesquisa('manual') and public.gatilho_de_pesquisa('pos_visita'), 'gatilhos';

  -- Painel.
  assert has_function_privilege('authenticated', 'public.pesquisas_resumo(integer)', 'execute'), 'resumo exposto';
  assert has_function_privilege('authenticated', 'public.followup_respostas(integer)', 'execute'), 'respostas expostas';
  assert not has_table_privilege('authenticated', 'public.pesquisas_satisfacao', 'insert'), 'só o banco grava';
end $$;
rollback;
