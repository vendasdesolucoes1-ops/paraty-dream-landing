-- Formulário Meta → CRM: gravação, deduplicação, etapa e rodízio.
\set ON_ERROR_STOP 1
begin;
do $$
declare
  r jsonb;
  l record;
  n integer;
  v_user uuid := '00000000-0000-0000-0000-00000000f0a1';
  v_vend uuid;
  l_antigo uuid;
begin
  assert public.chave_telefone_br('5512991234567') = '1291234567', 'chave 13 dígitos';
  assert public.chave_telefone_br('551291234567') = '1291234567', 'chave sem o 9';
  assert public.chave_telefone_br('+55 (12) 99123-4567') = '1291234567', 'chave formatada';
  assert public.chave_telefone_br('123') is null, 'chave inválida';

  insert into auth.users (id, email) values (v_user, 'v@form.local');
  insert into public.profiles (id, email, nome, role, ativo) values (v_user, 'v@form.local', 'V', 'vendedor', true)
  on conflict (id) do update set ativo = true;
  update public.vendedores set ativo = false;
  insert into public.vendedores (nome, ativo, posicao_round_robin, profile_id)
  values ('Vendedora Form', true, 0, v_user) returning id into v_vend;

  -- Lead novo e qualificado (compra em 3 meses).
  r := public.registrar_lead_formulario(jsonb_build_object(
    'leadgen_id', 'lg1', 'form_id', 'f1', 'form_nome', 'Form Visita', 'criado_em', '2026-10-28T13:00:00Z',
    'nome', 'Maria', 'telefone', '5512991230001', 'email', 'm@x.com', 'cidade', 'Paraty',
    'finalidade', 'Construir para morar', 'prazo_compra', 'Nos próximos 3 meses',
    'forma_pagamento', 'Parcelado', 'quer_visitar', 'Ainda não', 'objetivo', 'moradia',
    'qualificado', true, 'ad_id', 'a1', 'ad_nome', 'Video', 'conjunto_nome', 'Conj',
    'campanha_id', 'c1', 'campanha_nome', 'Camp Form', 'bruto', '{"id":"lg1"}'::jsonb));
  assert (r->>'novo')::boolean and (r->>'status_crm') = 'qualificado', 'novo qualificado';
  select * into l from public.leads where id = (r->>'lead_id')::uuid;
  assert l.origem = 'formulario_meta' and l.vendedor_id = v_vend and l.campanha_id = 'c1'
     and l.conjunto_nome = 'Conj' and l.formulario_nome = 'Form Visita' and l.prazo_compra = 'Nos próximos 3 meses'
     and l.created_at = '2026-10-28T13:00:00Z', 'campos gravados';
  select count(*) into n from public.notifications where user_id = v_user and type = 'lead_atribuido';
  assert n = 1, 'vendedor avisado';
  select count(*) into n from public.interacoes where lead_id = l.id and canal = 'formulario_meta';
  assert n = 1, 'histórico';
  select count(*) into n from public.meta_leads_formulario where leadgen_id = 'lg1' and status = 'gravado' and bruto is not null;
  assert n = 1, 'evento gravado com o bruto';

  -- Mesmo leadgen de novo: não duplica nada.
  r := public.registrar_lead_formulario(jsonb_build_object('leadgen_id', 'lg1', 'telefone', '5512991230001', 'nome', 'Maria'));
  assert (r->>'repetido')::boolean, 'repetido';
  select count(*) into n from public.interacoes where lead_id = l.id;
  assert n = 1, 'sem interação nova no repetido';

  -- Lead do WhatsApp que já existia (sem o 9): atualiza, não cria outro.
  insert into public.leads (nome, telefone, origem, status_crm) values ('João', '551291230002', 'whatsapp', 'perdido')
  returning id into l_antigo;
  r := public.registrar_lead_formulario(jsonb_build_object(
    'leadgen_id', 'lg2', 'nome', 'João Silva', 'telefone', '5512991230002', 'quer_visitar', 'Sim, quero visitar',
    'qualificado', true, 'campanha_id', 'c1', 'campanha_nome', 'Camp Form', 'notificar', false));
  assert not (r->>'novo')::boolean and (r->>'duplicado')::boolean and (r->>'lead_id')::uuid = l_antigo, 'deduplicou';
  select * into l from public.leads where id = l_antigo;
  assert l.origem = 'whatsapp' and l.nome = 'João' and l.status_crm = 'qualificado'
     and l.quer_visitar = 'Sim, quero visitar' and l.campanha_id = 'c1' and l.vendedor_id = v_vend, 'atualizado';
  select count(*) into n from public.interacoes where lead_id = l_antigo and conteudo like 'Novo contato pelo formulário%';
  assert n = 1, 'novo contato no histórico';
  select count(*) into n from public.notifications where user_id = v_user;
  assert n = 1, 'sem aviso quando notificar = false';

  -- Não qualificado entra como novo; lead em etapa avançada não volta.
  r := public.registrar_lead_formulario(jsonb_build_object('leadgen_id', 'lg3', 'nome', 'Ana', 'telefone', '5521988880003'));
  assert r->>'status_crm' = 'novo', 'novo';
  update public.leads set status_crm = 'agendado' where id = (r->>'lead_id')::uuid;
  r := public.registrar_lead_formulario(jsonb_build_object('leadgen_id', 'lg4', 'nome', 'Ana', 'telefone', '21988880003', 'qualificado', true));
  assert r->>'status_crm' = 'agendado', 'não rebaixa etapa';

  -- Funil por campanha conta os leads do formulário.
  select count(*) into n from public.leads where campanha_id = 'c1';
  assert n = 2, 'dois leads na campanha';

  -- Só a service_role grava.
  assert not has_function_privilege('authenticated', 'public.registrar_lead_formulario(jsonb)', 'execute'), 'restrito';
end $$;
rollback;
