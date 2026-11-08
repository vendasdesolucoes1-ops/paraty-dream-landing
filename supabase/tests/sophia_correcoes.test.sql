-- Correções da Sophia: ativação exige horários e consultor, pausa expira,
-- quem um humano atendeu não recebe primeiro contato, visita não duplica.
\set ON_ERROR_STOP 1
begin;
do $$
declare
  v_agente uuid;
  v_lead uuid;
  v_conv uuid;
  r record;
  ok boolean;
begin
  insert into public.ai_agents (name, is_active) values ('Sophia teste', false) returning id into v_agente;
  delete from public.configuracoes where chave in ('janelas_visita', 'consultor_responsavel');

  -- Sem horários nem consultor: não liga.
  ok := false;
  begin
    update public.ai_agents set is_active = true where id = v_agente;
  exception when invalid_parameter_value then
    ok := sqlerrm like '%horários de visita%' and sqlerrm like '%consultor%';
  end;
  assert ok, 'ativação barrada com as duas pendências';

  insert into public.configuracoes (chave, valor) values
    ('janelas_visita', '{"dias":[{"dia":6,"inicio":"09:00","fim":"16:00"}],"duracao_min":60,"fuso":"America/Sao_Paulo"}'),
    ('consultor_responsavel', '{"nome":"Fernando","telefone":"(24) 99999-0000"}');
  assert coalesce(array_length(public.pendencias_ativar_ia(), 1), 0) = 0, 'sem pendências';
  update public.ai_agents set is_active = true where id = v_agente;

  -- Pausa expirada não conta como aberta.
  insert into public.leads (nome, telefone) values ('Pausa', '5524999970001') returning id into v_lead;
  insert into public.ai_agent_conversations (agent_id, session_id, status)
  values (v_agente, '5524999970001', 'active') returning id into v_conv;
  insert into public.ai_agent_human_takeover (conversation_id, human_takeover_at, expira_em)
  values (v_conv, now() - interval '2 days', now() - interval '1 day');
  assert not exists (select 1 from public.takeovers_abertos() where session_id = '5524999970001'),
         'pausa vencida não aparece';
  select * into r from public.pode_enviar(v_lead, 'cadencia', now(), null);
  assert r.motivo is distinct from 'takeover', 'pausa vencida não bloqueia envio';

  -- Mas um humano já atendeu: primeiro contato automático não sai.
  select * into r from public.pode_enviar(v_lead, 'primeiro_contato', now(), null);
  assert not r.ok and r.motivo = 'humano_atendeu', 'humano atendeu bloqueia primeiro contato';

  -- Autor da mensagem.
  ok := false;
  begin
    insert into public.whatsapp_messages (lead_id, from_me, autor, content) values (v_lead, true, 'robo', 'x');
  exception when check_violation then ok := true;
  end;
  assert ok, 'autor inválido recusado';

  -- Visita não duplica.
  insert into public.visitas (lead_id, data_hora, status) values (v_lead, '2026-12-05 13:00+00', 'agendada');
  ok := false;
  begin
    insert into public.visitas (lead_id, data_hora, status) values (v_lead, '2026-12-05 13:00+00', 'agendada');
  exception when unique_violation then ok := true;
  end;
  assert ok, 'mesma visita duas vezes é recusada';

  -- Modelo novo aceito.
  update public.ai_agents set modelo = 'gpt-4.1-mini' where id = v_agente;
end $$;
rollback;
