-- CRM ligado aos anúncios: origem do lead e funil por campanha.
\set ON_ERROR_STOP 1
begin;
do $$
declare
  r record;
  n integer;
  ok boolean;
  v_gestor uuid := '00000000-0000-0000-0000-00000000eae1';
  l_novo uuid; l_antigo uuid; l_form uuid;
begin
  insert into auth.users (id, email) values (v_gestor, 'g@e4.local');
  insert into public.profiles (id, email, nome, role, ativo) values (v_gestor, 'g@e4.local', 'G', 'gestor', true)
  on conflict (id) do update set role = excluded.role, ativo = true;

  insert into public.meta_conta_anuncios (id, nome) values ('act_4', 'M');
  insert into public.meta_campanhas (id, conta_id, name, effective_status, objective) values
    ('cz', 'act_4', 'WhatsApp Sofia', 'ACTIVE', 'OUTCOME_ENGAGEMENT');
  insert into public.meta_conjuntos (id, campaign_id, conta_id, name, destination_type) values ('sz', 'cz', 'act_4', 'S', 'WHATSAPP');
  insert into public.meta_anuncios (id, adset_id, campaign_id, conta_id, name) values ('az', 'sz', 'cz', 'act_4', 'Video Sofia');
  insert into public.meta_insights_diarios (ad_id, data, adset_id, campaign_id, conta_id, spend, mensagens_iniciadas) values
    ('az', '2026-11-01', 'sz', 'cz', 'act_4', 100, 20);

  insert into public.leads (nome, telefone, origem, status_crm) values ('Novo', '5524999990001', 'whatsapp', 'novo') returning id into l_novo;
  insert into public.leads (nome, telefone, origem, status_crm, created_at) values ('Antigo', '5524999990002', 'lp', 'novo', now() - interval '3 days') returning id into l_antigo;

  -- Contato novo vindo de anúncio: vira "Anúncio WhatsApp" com anúncio e campanha.
  ok := public.registrar_origem_anuncio(l_novo, 'az', 'clid-1', 'Lote pronto', 'https://fb.me/x');
  assert ok, 'registra no contato novo';
  select * into r from public.leads where id = l_novo;
  assert r.origem = 'anuncio_whatsapp' and r.anuncio_nome = 'Video Sofia' and r.campanha_nome = 'WhatsApp Sofia'
     and r.campanha_id = 'cz' and r.ctwa_clid = 'clid-1', 'origem e nomes';
  -- Segunda mensagem do mesmo anúncio não muda nada.
  assert not public.registrar_origem_anuncio(l_novo, 'outro', null, null, null), 'não sobrescreve';
  -- Quem já era lead mantém a origem.
  assert not public.registrar_origem_anuncio(l_antigo, 'az', null, null, null), 'lead antigo não vira anúncio';
  select origem into r from public.leads where id = l_antigo;
  assert r.origem = 'lp', 'origem antiga preservada';

  -- Anúncio ainda não sincronizado: nomes chegam depois.
  insert into public.leads (nome, telefone, origem, status_crm) values ('Form', '5524999990003', 'whatsapp', 'agendado') returning id into l_form;
  perform public.registrar_origem_anuncio(l_form, 'a_futuro', null, null, null);
  insert into public.meta_anuncios (id, adset_id, campaign_id, conta_id, name) values ('a_futuro', 'sz', 'cz', 'act_4', 'Carrossel');
  n := public.completar_anuncio_dos_leads();
  assert n = 1, 'completa os nomes depois: ' || n;
  select * into r from public.leads where id = l_form;
  assert r.campanha_nome = 'WhatsApp Sofia' and r.anuncio_nome = 'Carrossel', 'nomes completados';

  -- Funil por campanha.
  update public.leads set status_crm = 'visitou' where id = l_novo;
  set local role authenticated;
  perform set_config('teste.uid', v_gestor::text, true);
  select * into r from public.marketing_funil_campanhas(current_date - 30, current_date) where campanha_id = 'cz';
  assert r.leads_crm = 2 and r.qualificados = 2 and r.agendados = 2 and r.visitas = 1 and r.vendas = 0,
    'funil: ' || r.leads_crm || '/' || r.agendados || '/' || r.visitas;
  reset role;

  -- Origem inválida continua barrada.
  begin
    insert into public.leads (nome, origem) values ('x', 'outdoor');
    assert false, 'origem inválida deveria falhar';
  exception when check_violation then null;
  end;
end $$;
rollback;
