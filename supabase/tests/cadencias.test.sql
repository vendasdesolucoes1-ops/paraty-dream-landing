-- Testes da máquina de estados das cadências e das regras de envio
-- (issues #49, #50 e #51). Rodar com scripts/db/testar-migrations.sh.
--
-- Tudo dentro de uma transação desfeita no fim. Cada bloco testa uma
-- transição ou uma regra; ASSERT derruba o arquivo com a mensagem do caso.

\set ON_ERROR_STOP 1
begin;

-- ---------------------------------------------------------------------------
-- Cenário base
-- ---------------------------------------------------------------------------
create temp table ids (nome text primary key, id uuid) on commit drop;

do $$
declare v uuid;
begin
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'admin@teste.local');
  insert into public.profiles (id, email, nome, role, ativo)
  values ('00000000-0000-0000-0000-0000000000a1', 'admin@teste.local', 'Admin', 'admin', true)
  on conflict (id) do update set role = 'admin', ativo = true;

  insert into public.whatsapp_instances (instance_name, api_url, api_key, status, aquecimento_inicio)
  values ('teste', 'https://evolution.teste.local', 'x', 'connected', null) returning id into v;
  insert into ids values ('instancia', v);

  insert into public.cadencias (nome, gatilho, ativa, criado_por)
  values ('Teste manual', 'manual', true, null) returning id into v;
  insert into ids values ('cad', v);
  insert into public.cadencia_etapas (cadencia_id, ordem, referencia, deslocamento, template) values
    (v, 1, 'anterior', interval '0', 'Oi {{primeiro_nome}}!||Tudo bem?'),
    (v, 2, 'anterior', interval '0', 'Segunda tentativa {{primeiro_nome}}.'),
    (v, 3, 'anterior', interval '0', 'Terceira tentativa.');

  update public.regras_envio set max_tentativas_sem_resposta = 2, minimo_envios_para_pausa = 1,
         limite_opt_out_pct = 50, limite_diario = 3, aquecimento_dias = 10, aquecimento_inicial = 1;
end $$;

create or replace function pg_temp.novo_lead(p_nome text, p_tel text) returns uuid language sql as $$
  insert into public.leads (nome, telefone, status_crm) values (p_nome, p_tel, 'novo') returning id
$$;

create or replace function pg_temp.id(p text) returns uuid language sql as $$
  select id from ids where nome = p
$$;

create or replace function pg_temp.inscricao(p_lead uuid) returns public.inscricoes language sql as $$
  select * from public.inscricoes where lead_id = p_lead order by criado_em desc limit 1
$$;

create or replace function pg_temp.envio(p_ins uuid) returns public.mensagens_agendadas language sql as $$
  select * from public.mensagens_agendadas where inscricao_id = p_ins order by criado_em desc, etapa_ordem desc limit 1
$$;

create or replace function pg_temp.eventos(p_ins uuid, p_evento text) returns bigint language sql as $$
  select count(*) from public.envios_eventos where inscricao_id = p_ins and evento = p_evento
$$;

-- Simula o worker concluindo o envio.
create or replace function pg_temp.enviar(p_msg uuid) returns void language sql as $$
  update public.mensagens_agendadas
     set status = 'enviado', enviado_em = now(), instance_id = (select id from ids where nome = 'instancia')
   where id = p_msg
$$;

-- ---------------------------------------------------------------------------
-- 1. Inscrição → ativa com a próxima etapa agendada
-- ---------------------------------------------------------------------------
do $$
declare v_lead uuid := pg_temp.novo_lead('ana souza', '5524999990001'); i public.inscricoes;
begin
  insert into ids values ('lead1', v_lead);
  perform public._inscrever(pg_temp.id('cad'), v_lead);
  i := pg_temp.inscricao(v_lead);
  assert i.status = 'ativa', 'inscrição deveria nascer ativa';
  assert i.proxima_em is not null, 'inscrição deveria ter a etapa 1 agendada';
  assert pg_temp.eventos(i.id, 'inscrito') = 1, 'evento inscrito';
  -- Mesma cadência de novo: não duplica.
  assert public._inscrever(pg_temp.id('cad'), v_lead) is null, 'não pode inscrever duas vezes';
end $$;

-- ---------------------------------------------------------------------------
-- 2. ativa → etapa na outbox (agendar_etapas), com o texto renderizado
-- ---------------------------------------------------------------------------
do $$
declare i public.inscricoes; m public.mensagens_agendadas;
begin
  perform public.agendar_etapas();
  i := pg_temp.inscricao(pg_temp.id('lead1'));
  m := pg_temp.envio(i.id);
  assert m.status = 'pendente' and m.tipo = 'cadencia' and m.etapa_ordem = 1, 'etapa 1 deveria estar na fila';
  assert m.partes = '["Oi Ana!", "Tudo bem?"]'::jsonb, 'texto renderizado errado: ' || m.partes::text;
  assert i.proxima_em is null, 'inscrição espera o envio';
  assert pg_temp.eventos(i.id, 'enfileirado') = 1, 'evento enfileirado';
  -- Rodar de novo não duplica a etapa.
  perform public.agendar_etapas();
  assert (select count(*) from public.mensagens_agendadas where inscricao_id = i.id) = 1, 'etapa duplicada na fila';
end $$;

-- ---------------------------------------------------------------------------
-- 3. enviada → próxima etapa; uso da instância contado
-- ---------------------------------------------------------------------------
do $$
declare i public.inscricoes; m public.mensagens_agendadas;
begin
  i := pg_temp.inscricao(pg_temp.id('lead1'));
  m := pg_temp.envio(i.id);
  perform pg_temp.enviar(m.id);
  i := pg_temp.inscricao(pg_temp.id('lead1'));
  assert i.etapa_atual = 1 and i.tentativas_sem_resposta = 1, 'etapa 1 deveria constar como enviada';
  assert i.proxima_em is not null, 'etapa 2 deveria estar agendada';
  assert pg_temp.eventos(i.id, 'enviado') = 1, 'evento enviado';
  assert (select enviados from public.uso_instancia where instance_id = pg_temp.id('instancia')) = 1,
         'uso da instância deveria contar 1';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Limite de tentativas sem resposta → sem_resposta (regra #50)
-- ---------------------------------------------------------------------------
do $$
declare i public.inscricoes;
begin
  perform public.agendar_etapas();
  i := pg_temp.inscricao(pg_temp.id('lead1'));
  perform pg_temp.enviar((pg_temp.envio(i.id)).id);           -- etapa 2: 2 tentativas
  perform public.agendar_etapas();                             -- etapa 3 barrada
  i := pg_temp.inscricao(pg_temp.id('lead1'));
  assert i.status = 'sem_resposta', 'deveria encerrar por limite de tentativas, está ' || i.status;
  assert exists (select 1 from public.envios_eventos where inscricao_id = i.id and evento = 'bloqueado'
                    and motivo = 'limite_tentativas_sem_resposta'), 'bloqueio sem motivo registrado';
  assert (select count(*) from public.mensagens_agendadas where inscricao_id = i.id) = 2, 'etapa 3 não podia sair';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Lead respondeu → pausada e a fila da inscrição cancelada
-- 6. Retomar → ativa de novo
-- ---------------------------------------------------------------------------
do $$
declare v_lead uuid := pg_temp.novo_lead('Bruno', '5524999990002'); i public.inscricoes;
begin
  perform public._inscrever(pg_temp.id('cad'), v_lead);
  perform public.agendar_etapas();
  i := pg_temp.inscricao(v_lead);
  insert into public.whatsapp_messages (instance_id, lead_id, remote_jid, message_id, from_me, content, message_type)
  values (pg_temp.id('instancia'), v_lead, '5524999990002@s.whatsapp.net', 'msg-teste-1', false, 'oi', 'text');
  i := pg_temp.inscricao(v_lead);
  assert i.status = 'pausada' and i.motivo_saida = 'lead respondeu', 'resposta deveria pausar';
  assert (pg_temp.envio(i.id)).status = 'cancelado', 'etapa pendente deveria ser cancelada';
  assert pg_temp.eventos(i.id, 'respondeu') = 1, 'evento respondeu';

  perform set_config('teste.uid', '00000000-0000-0000-0000-0000000000a1', true);
  perform public.retomar_inscricao(i.id);
  perform set_config('teste.uid', '', true);
  i := pg_temp.inscricao(v_lead);
  assert i.status = 'ativa' and i.tentativas_sem_resposta = 0, 'retomar deveria reativar';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Takeover humano → pausada
-- ---------------------------------------------------------------------------
do $$
declare v_lead uuid := pg_temp.novo_lead('Carla', '5524999990003'); v_conv uuid; i public.inscricoes;
begin
  perform public._inscrever(pg_temp.id('cad'), v_lead);
  insert into public.ai_agent_conversations (session_id) values ('5524999990003') returning id into v_conv;
  insert into public.ai_agent_human_takeover (conversation_id) values (v_conv);
  i := pg_temp.inscricao(v_lead);
  assert i.status = 'pausada' and i.motivo_saida = 'takeover humano', 'takeover deveria pausar, está ' || i.status;
  -- pode_enviar também barra.
  assert (select motivo from public.pode_enviar(v_lead, 'cadencia', '2026-10-20 15:00Z')) = 'takeover', 'pode_enviar takeover';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Opt-out → cancelada, e a cadência pausa quando a taxa passa do limite
-- ---------------------------------------------------------------------------
do $$
declare v_lead uuid := pg_temp.novo_lead('Davi', '5524999990004'); i public.inscricoes; c public.cadencias;
begin
  perform public._inscrever(pg_temp.id('cad'), v_lead);
  perform public.agendar_etapas();
  i := pg_temp.inscricao(v_lead);
  perform pg_temp.enviar((pg_temp.envio(i.id)).id);
  update public.leads set contato_bloqueado = true where id = v_lead;
  i := pg_temp.inscricao(v_lead);
  assert i.status = 'cancelada', 'opt-out deveria cancelar';
  assert pg_temp.eventos(i.id, 'opt_out') = 1, 'evento opt_out';
  select * into c from public.cadencias where id = pg_temp.id('cad');
  -- Etapa 1: 3 envios (Ana, Davi e... ) e 1 opt-out; limite de teste 50%.
  -- Com o mínimo de 1 envio e 1 opt-out em N envios, só pausa se passar de 50%.
  assert (select motivo from public.pode_enviar(v_lead, 'cadencia', '2026-10-20 15:00Z')) = 'opt_out', 'pode_enviar opt_out';
end $$;

do $$
declare v_cad uuid; v_lead uuid := pg_temp.novo_lead('Eva', '5524999990005'); i public.inscricoes;
begin
  insert into public.cadencias (nome, gatilho, ativa, criado_por) values ('Pausa por opt-out', 'manual', true, null)
  returning id into v_cad;
  insert into public.cadencia_etapas (cadencia_id, ordem, deslocamento, template) values (v_cad, 1, interval '0', 'Olá');
  perform public._inscrever(v_cad, v_lead);
  perform public.agendar_etapas();
  i := pg_temp.inscricao(v_lead);
  perform pg_temp.enviar((pg_temp.envio(i.id)).id);
  update public.leads set contato_bloqueado = true where id = v_lead;   -- 1 de 1 = 100% > 50%
  assert (select pausada_em is not null from public.cadencias where id = v_cad), 'cadência deveria pausar por opt-out';
  assert exists (select 1 from public.notifications where type = 'cadencia_pausada'), 'gestão deveria ser avisada';
  -- Pausada: agendar_etapas não materializa nada dela.
  perform public._inscrever(v_cad, pg_temp.novo_lead('Fabio', '5524999990006'));
  perform public.agendar_etapas();
  assert not exists (select 1 from public.mensagens_agendadas m join public.inscricoes x on x.id = m.inscricao_id
                      where x.cadencia_id = v_cad and m.status = 'pendente'), 'cadência pausada não envia';
end $$;

-- ---------------------------------------------------------------------------
-- 9. Visita marcada → convertida; lembretes nos horários; cancelada encerra
-- ---------------------------------------------------------------------------
do $$
declare v_lead uuid := pg_temp.novo_lead('Gabi', '5524999990007'); v_vis uuid; i public.inscricoes;
        v_cad_vis uuid; v_quando timestamptz;
begin
  perform public._inscrever(pg_temp.id('cad'), v_lead);
  update public.cadencias set ativa = true where gatilho = 'visita_agendada' returning id into v_cad_vis;

  -- Visita daqui a 3 dias às 15h (Brasília).
  v_quando := ((((now() at time zone 'America/Sao_Paulo')::date + 3) + time '15:00') at time zone 'America/Sao_Paulo');
  insert into public.visitas (lead_id, data_hora, status) values (v_lead, v_quando, 'agendada') returning id into v_vis;

  assert (select status from public.inscricoes where lead_id = v_lead and cadencia_id = pg_temp.id('cad')) = 'convertida',
         'visita marcada deveria converter a cadência comercial';
  select * into i from public.inscricoes where lead_id = v_lead and cadencia_id = v_cad_vis;
  assert i.status = 'ativa' and i.visita_id = v_vis, 'visita deveria iniciar os lembretes';
  assert i.proxima_em = (((v_quando at time zone 'America/Sao_Paulo')::date - 1 + time '10:00') at time zone 'America/Sao_Paulo'),
         'lembrete da véspera deveria ser às 10h do dia anterior, está ' || i.proxima_em;

  -- Texto com data e hora da visita.
  assert (public.renderizar_template('{{data_visita}} às {{hora_visita}}', v_lead, v_vis))->>0
         = to_char(v_quando at time zone 'America/Sao_Paulo', 'DD/MM') || ' às 15h', 'data/hora da visita no texto';

  update public.visitas set status = 'cancelada' where id = v_vis;
  select * into i from public.inscricoes where id = i.id;
  assert i.status = 'cancelada' and i.motivo_saida = 'visita cancelada', 'visita cancelada deveria encerrar os lembretes';
end $$;

-- Visita "a confirmar" só ganha lembretes quando confirmada; realizada conclui.
do $$
declare v_lead uuid := pg_temp.novo_lead('Hugo', '5524999990008'); v_vis uuid; i public.inscricoes;
begin
  insert into public.visitas (lead_id, data_hora, status)
  values (v_lead, now() + interval '5 days', 'a_confirmar') returning id into v_vis;
  assert not exists (select 1 from public.inscricoes where visita_id = v_vis), 'a confirmar não gera lembrete';
  update public.visitas set status = 'agendada' where id = v_vis;
  select * into i from public.inscricoes where visita_id = v_vis;
  assert i.status = 'ativa', 'confirmada deveria gerar lembretes';
  update public.visitas set status = 'realizada' where id = v_vis;
  select * into i from public.inscricoes where id = i.id;
  assert i.status = 'concluida', 'visita realizada conclui os lembretes';
end $$;

-- ---------------------------------------------------------------------------
-- 10. Funil avançou → convertida; lead perdido → cancelada
-- ---------------------------------------------------------------------------
do $$
declare v1 uuid := pg_temp.novo_lead('Iara', '5524999990009'); v2 uuid := pg_temp.novo_lead('Joao', '5524999990010');
begin
  perform public._inscrever(pg_temp.id('cad'), v1);
  perform public._inscrever(pg_temp.id('cad'), v2);
  update public.leads set status_crm = 'fechado' where id = v1;
  update public.leads set status_crm = 'perdido' where id = v2;
  assert (pg_temp.inscricao(v1)).status = 'convertida', 'fechado converte';
  assert (pg_temp.inscricao(v2)).status = 'cancelada', 'perdido cancela';
end $$;

-- ---------------------------------------------------------------------------
-- 11. Erro definitivo de envio → falhou; bloqueio do pode_enviar → motivo
-- ---------------------------------------------------------------------------
do $$
declare v_lead uuid := pg_temp.novo_lead('Kiko', '5524999990011'); i public.inscricoes; m public.mensagens_agendadas;
begin
  perform public._inscrever(pg_temp.id('cad'), v_lead);
  perform public.agendar_etapas();
  i := pg_temp.inscricao(v_lead);
  m := pg_temp.envio(i.id);
  update public.mensagens_agendadas set status = 'pendente', erro = 'fora da janela de envio' where id = m.id;
  assert pg_temp.eventos(i.id, 'adiado') = 1, 'adiamento deveria ficar registrado';
  update public.mensagens_agendadas set status = 'erro', erro = '[permanente] 400' where id = m.id;
  i := pg_temp.inscricao(v_lead);
  assert i.status = 'falhou', 'dead-letter deveria marcar falhou';
  assert pg_temp.eventos(i.id, 'bloqueado') = 1, 'falha com motivo registrado';
end $$;

-- ---------------------------------------------------------------------------
-- 12. Regras do pode_enviar: janela, base legal, limite diário e aquecimento
-- ---------------------------------------------------------------------------
do $$
declare v_lead uuid := pg_temp.novo_lead('Lia', '5524999990012'); v_inst uuid := pg_temp.id('instancia');
begin
  -- Domingo: fora da janela.
  assert (select motivo from public.pode_enviar(v_lead, 'primeiro_contato', '2026-10-18 15:00Z')) = 'fora_da_janela', 'domingo';
  -- Terça 12h em Brasília: dentro.
  assert (select ok from public.pode_enviar(v_lead, 'primeiro_contato', '2026-10-20 15:00Z')), 'terça 12h deveria liberar';
  -- Cadência sem consentimento nem conversa: sem base legal.
  assert (select motivo from public.pode_enviar(v_lead, 'cadencia', '2026-10-20 15:00Z')) = 'sem_base_legal', 'base legal';
  -- Campanha: segue a regra configurável.
  update public.regras_envio set campanha_exige_base_legal = false;
  assert (select ok from public.pode_enviar(v_lead, 'campanha', '2026-10-20 15:00Z')), 'campanha sem exigência';
  update public.regras_envio set campanha_exige_base_legal = true;

  -- Limite diário 3: com 3 envios hoje, o quarto é barrado.
  insert into public.uso_instancia (instance_id, dia, enviados)
  values (v_inst, ('2026-10-20 15:00Z'::timestamptz at time zone 'America/Sao_Paulo')::date, 3)
  on conflict (instance_id, dia) do update set enviados = 3;
  assert (select motivo from public.pode_enviar(v_lead, 'primeiro_contato', '2026-10-20 15:00Z', v_inst)) = 'limite_diario',
         'limite diário';
  -- Sem instância informada (resposta), não conta.
  assert (select ok from public.pode_enviar(v_lead, 'primeiro_contato', '2026-10-20 15:00Z')), 'sem instância não limita';

  -- Aquecimento: número novo começa em 1/dia e sobe até 3 em 10 dias.
  update public.whatsapp_instances set aquecimento_inicio = '2026-10-20' where id = v_inst;
  assert public.limite_diario_instancia(v_inst, '2026-10-20 15:00Z') = 1, 'dia 0 do aquecimento';
  assert public.limite_diario_instancia(v_inst, '2026-10-25 15:00Z') = 2, 'meio do aquecimento';
  assert public.limite_diario_instancia(v_inst, '2026-11-05 15:00Z') = 3, 'fim do aquecimento';
  -- Limite próprio da instância vence o global.
  update public.whatsapp_instances set limite_diario = 2, aquecimento_inicio = null where id = v_inst;
  assert public.limite_diario_instancia(v_inst, '2026-10-20 15:00Z') = 2, 'limite da instância';
end $$;

-- ---------------------------------------------------------------------------
-- 13. Etapa com aprovação humana: aguarda, aprova (com edição) e sai
-- ---------------------------------------------------------------------------
do $$
declare v_cad uuid; v_lead uuid := pg_temp.novo_lead('Mara', '5524999990013'); i public.inscricoes; m public.mensagens_agendadas;
begin
  insert into public.cadencias (nome, gatilho, ativa, criado_por) values ('Piloto IA', 'manual', true, null)
  returning id into v_cad;
  insert into public.cadencia_etapas (cadencia_id, ordem, deslocamento, modo, template)
  values (v_cad, 1, interval '0', 'ia_aprovacao', 'Oi {{primeiro_nome}}'),
         (v_cad, 2, interval '0', 'ia_aprovacao', 'Segunda');
  perform public._inscrever(v_cad, v_lead);
  perform public.agendar_etapas();
  i := pg_temp.inscricao(v_lead);
  m := pg_temp.envio(i.id);
  assert m.status = 'aguardando_aprovacao', 'etapa de piloto deveria aguardar aprovação';

  perform set_config('teste.uid', '00000000-0000-0000-0000-0000000000a1', true);
  assert (select count(*) from public.envios_para_aprovar() where id = m.id) = 1, 'lista de aprovação';
  perform public.aprovar_envio(m.id, '["Oi Mara, revisado"]'::jsonb);
  m := pg_temp.envio(i.id);
  assert m.status = 'pendente' and m.partes = '["Oi Mara, revisado"]'::jsonb and m.aprovado_por is not null, 'aprovação';
  assert pg_temp.eventos(i.id, 'aprovado') = 1, 'evento aprovado';

  -- Rejeitar a etapa 2 pula para a seguinte (que não existe: fim).
  perform pg_temp.enviar(m.id);
  perform public.agendar_etapas();
  m := pg_temp.envio(i.id);
  assert m.etapa_ordem = 2, 'etapa 2 deveria aguardar aprovação';
  perform public.rejeitar_envio(m.id);
  perform set_config('teste.uid', '', true);
  i := pg_temp.inscricao(v_lead);
  assert i.etapa_atual = 2 and i.status = 'ativa', 'rejeição avança a etapa';
end $$;

-- Sem papel de gestão, as RPCs de aprovação recusam.
do $$
begin
  begin
    perform public.envios_para_aprovar();
    assert false, 'sem gestão deveria recusar';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 14. Primeiro contato enviado inscreve na cadência de "sem resposta"
-- ---------------------------------------------------------------------------
do $$
declare v_lead uuid := pg_temp.novo_lead('Nina', '5524999990014'); v_msg uuid; v_cad uuid;
begin
  update public.cadencias set ativa = true where gatilho = 'primeiro_contato' returning id into v_cad;
  insert into public.mensagens_agendadas (lead_id, tipo, telefone, partes)
  values (v_lead, 'primeiro_contato', '5524999990014', '["oi"]') returning id into v_msg;
  update public.mensagens_agendadas set status = 'enviado' where id = v_msg;
  assert exists (select 1 from public.inscricoes where lead_id = v_lead and cadencia_id = v_cad and status = 'ativa'),
         'primeiro contato deveria inscrever no follow-up';
  assert (pg_temp.inscricao(v_lead)).proxima_em > now() + interval '23 hours', 'follow-up só no dia seguinte';
end $$;

rollback;
\echo 'cadencias: todos os casos passaram'
