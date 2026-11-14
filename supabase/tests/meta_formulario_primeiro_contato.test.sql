-- Formulário Meta: a Sophia puxa conversa (fila de primeiro contato).
\set ON_ERROR_STOP 1
begin;
do $$
declare
  r jsonb;
  m record;
  n int;
begin
  -- Lead novo, recente, que quer visitar.
  r := public.registrar_lead_formulario(jsonb_build_object(
    'leadgen_id', 'pc-1', 'telefone', '5511933330001', 'nome', 'gabriela moreira',
    'quer_visitar', 'Sim', 'finalidade', 'Morar', 'qualificado', true,
    'criado_em', now()::text, 'origem_registro', 'importacao'));
  select * into m from public.mensagens_agendadas where lead_id = (r ->> 'lead_id')::uuid;
  assert m.tipo = 'primeiro_contato', 'abordagem na fila';
  assert m.status = 'pendente', 'pendente';
  assert m.partes ->> 0 = 'Oi, Gabriela! Aqui é a Sophia, do Moradas de Paraty.', m.partes ->> 0;
  assert m.partes ->> 2 like 'Você marcou que quer conhecer o loteamento%', 'parte sobre visita';
  assert m.agendado_para > now(), 'com atraso';

  -- Reprocessar o mesmo formulário não abre outra.
  r := public.registrar_lead_formulario(jsonb_build_object(
    'leadgen_id', 'pc-1', 'telefone', '5511933330001', 'nome', 'gabriela moreira'));
  select count(*) into n from public.mensagens_agendadas where lead_id = (r ->> 'lead_id')::uuid;
  assert n = 1, 'uma abordagem só';

  -- Formulário antigo (importação de histórico): nada.
  r := public.registrar_lead_formulario(jsonb_build_object(
    'leadgen_id', 'pc-2', 'telefone', '5511933330002', 'nome', 'Antigo',
    'criado_em', (now() - interval '3 days')::text));
  assert not exists (select 1 from public.mensagens_agendadas where lead_id = (r ->> 'lead_id')::uuid),
    'histórico não recebe';

  -- Teste: nada.
  r := public.registrar_lead_formulario(jsonb_build_object(
    'leadgen_id', 'pc-3', 'telefone', '5511933330003', 'nome', 'Teste', 'is_teste', true,
    'criado_em', now()::text));
  assert not exists (select 1 from public.mensagens_agendadas where lead_id = (r ->> 'lead_id')::uuid),
    'teste não recebe';

  -- Já conversando pelo WhatsApp: a Sophia já respondeu, sem abordagem.
  insert into public.leads (nome, telefone, origem, status_crm)
  values ('Já fala', '5511933330004', 'whatsapp', 'novo');
  insert into public.whatsapp_messages (lead_id, remote_jid, message_id, from_me, content, message_type, autor)
  select id, '5511933330004@s.whatsapp.net', 'pc-msg', false, 'Preenchi seu formulário', 'text', 'lead'
    from public.leads where telefone = '5511933330004';
  r := public.registrar_lead_formulario(jsonb_build_object(
    'leadgen_id', 'pc-4', 'telefone', '5511933330004', 'nome', 'Já fala', 'criado_em', now()::text));
  assert not exists (select 1 from public.mensagens_agendadas
                      where lead_id = (r ->> 'lead_id')::uuid and tipo = 'primeiro_contato'),
    'quem já conversa não recebe';

  -- Sem "quer visitar", com finalidade.
  r := public.registrar_lead_formulario(jsonb_build_object(
    'leadgen_id', 'pc-5', 'telefone', '5511933330005', 'nome', '5511933330005',
    'finalidade', 'Casa de veraneio', 'criado_em', now()::text));
  select * into m from public.mensagens_agendadas where lead_id = (r ->> 'lead_id')::uuid;
  assert m.partes ->> 0 = 'Oi! Aqui é a Sophia, do Moradas de Paraty.', 'sem nome válido';
  assert m.partes ->> 2 = 'Você marcou que o lote seria para casa de veraneio. Já tem um tamanho de terreno em mente?',
    m.partes ->> 2;
end $$;
rollback;
