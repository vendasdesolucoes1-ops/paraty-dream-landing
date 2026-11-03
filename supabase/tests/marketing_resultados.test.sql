-- Marketing: resultado por objetivo da campanha e contatos sem duplicar.
-- Dados no formato dos valores de referência (05/10 a 03/11/2026, Meta):
-- formulário R$ 267,80 / 52 leads / 39 conversas (mesmas pessoas) e três
-- campanhas de WhatsApp com R$ 845,04 / 191 conversas.
\set ON_ERROR_STOP 1
begin;
do $$
declare
  r record;
  n integer;
  v_gestor   uuid := '00000000-0000-0000-0000-00000000e7e1';
  v_vendedor uuid := '00000000-0000-0000-0000-00000000e7e2';
begin
  insert into auth.users (id, email) values (v_gestor, 'g@res.local'), (v_vendedor, 'v@res.local');
  insert into public.profiles (id, email, nome, role, ativo) values
    (v_gestor, 'g@res.local', 'Gestor', 'gestor', true),
    (v_vendedor, 'v@res.local', 'Vendedor', 'vendedor', true)
  on conflict (id) do update set role = excluded.role, ativo = true;

  insert into public.meta_conta_anuncios (id, nome, moeda) values ('act_9', 'Moradas', 'BRL');
  insert into public.meta_campanhas (id, conta_id, name, effective_status, objective) values
    ('form', 'act_9', 'Cadastro Formulário', 'ACTIVE', 'OUTCOME_LEADS'),
    ('zap1', 'act_9', 'WhatsApp - Video Sofia', 'ACTIVE', 'OUTCOME_ENGAGEMENT'),
    ('zap2', 'act_9', 'WhatsApp', 'PAUSED', 'OUTCOME_ENGAGEMENT'),
    ('zap3', 'act_9', 'Teste WhatsApp', 'PAUSED', 'OUTCOME_ENGAGEMENT'),
    ('eng',  'act_9', 'Engajamento sem conjunto', 'ARCHIVED', 'OUTCOME_ENGAGEMENT'),
    ('traf', 'act_9', 'Tráfego', 'PAUSED', 'OUTCOME_TRAFFIC');
  insert into public.meta_conjuntos (id, campaign_id, conta_id, name, optimization_goal) values
    ('s_form', 'form', 'act_9', 'Form', 'LEAD_GENERATION'),
    ('s_z1', 'zap1', 'act_9', 'Z1', 'CONVERSATIONS'),
    ('s_z2', 'zap2', 'act_9', 'Z2', 'CONVERSATIONS'),
    ('s_z3', 'zap3', 'act_9', 'Z3', 'CONVERSATIONS'),
    ('s_tr', 'traf', 'act_9', 'T', 'LINK_CLICKS');
  insert into public.meta_anuncios (id, adset_id, campaign_id, conta_id, name) values
    ('a_form', 's_form', 'form', 'act_9', 'Form'),
    ('a_z1', 's_z1', 'zap1', 'act_9', 'Z1'),
    ('a_z2', 's_z2', 'zap2', 'act_9', 'Z2'),
    ('a_z3', 's_z3', 'zap3', 'act_9', 'Z3'),
    ('a_tr', 's_tr', 'traf', 'act_9', 'T');
  insert into public.meta_insights_diarios
    (ad_id, data, adset_id, campaign_id, conta_id, spend, impressions, inline_link_clicks, leads, mensagens_iniciadas) values
    ('a_form', '2026-10-28', 's_form', 'form', 'act_9', 267.80, 13434, 300, 52, 39),
    ('a_z1',   '2026-10-20', 's_z1',   'zap1', 'act_9', 515.29, 18690, 200, null, 121),
    ('a_z2',   '2026-10-16', 's_z2',   'zap2', 'act_9', 272.90, 10912, 150, null, 52),
    ('a_z3',   '2026-10-18', 's_z3',   'zap3', 'act_9', 56.85, 678, 10, null, 18),
    ('a_tr',   '2026-10-10', 's_tr',   'traf', 'act_9', 10, 500, 40, null, null);

  set local role authenticated;
  perform set_config('teste.uid', v_gestor::text, true);

  -- Tipo de cada campanha.
  select count(*) into n from public.meta_campanha_resultado
   where (campaign_id, tipo_resultado) in (('form','lead'), ('zap1','conversa'), ('zap2','conversa'),
                                           ('zap3','conversa'), ('eng','clique'), ('traf','clique'));
  assert n = 6, 'tipo de resultado por campanha: ' || n;

  -- Resumo do período.
  select * into r from public.marketing_ads_resumo('2026-10-05', '2026-11-03') where periodo = 'atual';
  assert r.investimento = 1122.84, 'investimento total: ' || r.investimento;
  assert r.investimento_leads = 267.80 and r.leads_formulario = 52, 'campanhas de lead';
  assert r.leads_que_chamaram = 39, 'conversas do formulário ficam à parte';
  assert r.investimento_conversas = 845.04 and r.conversas = 191, 'campanhas de conversa: ' || r.conversas;
  assert r.contatos = 243, 'contatos únicos = 52 + 191: ' || r.contatos;
  assert r.mensagens = 230, 'mensagens brutas continuam disponíveis';
  assert round(r.investimento_leads / r.leads_formulario, 2) = 5.15, 'custo por lead';
  assert round(r.investimento_conversas / r.conversas, 2) = 4.42, 'custo por conversa';

  -- Lista por nível traz o tipo.
  select tipo_resultado into r from public.marketing_anuncios('2026-10-05', '2026-11-03', 'anuncio') where id = 'a_z1';
  assert r.tipo_resultado = 'conversa', 'anúncio herda o tipo da campanha';
  select tipo_resultado into r from public.marketing_anuncios('2026-10-05', '2026-11-03', 'conjunto') where id = 's_form';
  assert r.tipo_resultado = 'lead', 'conjunto herda o tipo da campanha';

  -- Vendedor: nada.
  perform set_config('teste.uid', v_vendedor::text, true);
  select contatos into r from public.marketing_ads_resumo('2026-10-05', '2026-11-03') where periodo = 'atual';
  assert r.contatos = 0, 'vendedor recebe zero';
  select count(*) into n from public.meta_campanha_resultado;
  assert n = 0, 'vendedor não vê campanhas';
  reset role;

  -- Alerta de saldo: um a cada 12 h, só service_role.
  assert public.alertar_saldo_meta('Saldo acabando', 'dura 2 dias') = true, 'primeiro alerta sai';
  assert public.alertar_saldo_meta('Saldo acabando', 'dura 1 dia') = false, 'segundo alerta é segurado';
  select count(*) into n from public.notifications where type = 'meta_alerta' and user_id = v_gestor;
  assert n = 1, 'gestão recebe um aviso no sino';
  set local role authenticated;
  begin
    perform public.alertar_saldo_meta('x', 'y');
    assert false, 'authenticated não deveria executar';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;
rollback;
