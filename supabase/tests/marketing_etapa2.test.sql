-- Marketing, etapa 2: avisos, destino, orçamento efetivo e série por campanha.
\set ON_ERROR_STOP 1
begin;
do $$
declare
  r record;
  n integer;
  v_gestor uuid := '00000000-0000-0000-0000-00000000e8e1';
  v_vend   uuid := '00000000-0000-0000-0000-00000000e8e2';
begin
  insert into auth.users (id, email) values (v_gestor, 'g@e2.local'), (v_vend, 'v@e2.local');
  insert into public.profiles (id, email, nome, role, ativo) values
    (v_gestor, 'g@e2.local', 'Gestor', 'gestor', true), (v_vend, 'v@e2.local', 'V', 'vendedor', true)
  on conflict (id) do update set role = excluded.role, ativo = true;

  insert into public.meta_conta_anuncios (id, nome, moeda) values ('act_2', 'M', 'BRL');
  insert into public.meta_campanhas (id, conta_id, name, effective_status, objective, daily_budget, recommendations) values
    ('cz', 'act_2', 'WhatsApp CBO', 'ACTIVE', 'OUTCOME_ENGAGEMENT', 4000, '[{"title":"Resultados insatisfatórios"}]'),
    ('ce', 'act_2', 'Engajamento', 'PAUSED', 'OUTCOME_ENGAGEMENT', null, null),
    ('cv', 'act_2', 'Velha', 'PAUSED', 'OUTCOME_TRAFFIC', null, null);
  insert into public.meta_conjuntos (id, campaign_id, conta_id, name, effective_status, destination_type, daily_budget) values
    ('sz', 'cz', 'act_2', 'Z', 'ACTIVE', 'WHATSAPP', null),
    ('se', 'ce', 'act_2', 'E', 'CAMPAIGN_PAUSED', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER', 1000);
  insert into public.meta_anuncios (id, adset_id, campaign_id, conta_id, name, effective_status, issues_info, ad_review_feedback) values
    ('az', 'sz', 'cz', 'act_2', 'Z', 'ACTIVE', null, null),
    ('ae', 'se', 'ce', 'act_2', 'E', 'WITH_ISSUES', '[{"error_summary":"Analise 1 erro","error_type":"HARD_ERROR"}]', '{"global":{"X":"Reprovado"}}');
  insert into public.meta_insights_diarios (ad_id, data, adset_id, campaign_id, conta_id, spend, mensagens_iniciadas) values
    ('az', '2026-10-01', 'sz', 'cz', 'act_2', 40, 10),
    ('az', '2026-10-03', 'sz', 'cz', 'act_2', 20, 4);

  set local role authenticated;
  perform set_config('teste.uid', v_gestor::text, true);

  -- Destino de mensagens conta como conversa, mesmo sem otimização CONVERSATIONS.
  select tipo_resultado into r from public.meta_campanha_resultado where campaign_id = 'ce';
  assert r.tipo_resultado = 'conversa', 'destino MESSAGING_* é conversa';

  -- Orçamento efetivo, destino e avisos.
  select * into r from public.marketing_anuncios('2026-10-01', '2026-10-03', 'anuncio') where id = 'az';
  assert r.orcamento_diario = 4000, 'anúncio herda o orçamento da campanha (CBO): ' || coalesce(r.orcamento_diario::text, 'null');
  assert r.destino = 'WHATSAPP', 'destino do conjunto';
  assert r.avisos = '{}'::jsonb, 'sem avisos';
  select * into r from public.marketing_anuncios('2026-10-01', '2026-10-03', 'anuncio') where id = 'ae';
  assert r.orcamento_diario = 1000, 'orçamento do conjunto';
  assert jsonb_array_length(r.avisos->'erros') = 1 and r.avisos ? 'revisao', 'erro e reprovação do anúncio';
  select * into r from public.marketing_anuncios('2026-10-01', '2026-10-03', 'campanha') where id = 'ce';
  assert jsonb_array_length(r.avisos->'erros') = 1, 'campanha mostra o erro do anúncio dela';
  assert r.destino = 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER', 'destino da campanha';
  select * into r from public.marketing_anuncios('2026-10-01', '2026-10-03', 'campanha') where id = 'cz';
  assert r.avisos->'recomendacoes'->0->>'title' = 'Resultados insatisfatórios', 'recomendação da campanha';
  select * into r from public.marketing_anuncios('2026-10-01', '2026-10-03', 'conjunto') where id = 'se';
  assert jsonb_array_length(r.avisos->'erros') = 1, 'conjunto mostra o erro do anúncio dele';

  -- Série por campanha: ativa ou com gasto; dias vazios com zero.
  select count(*) into n from public.marketing_ads_serie_campanhas('2026-10-01', '2026-10-03');
  assert n = 3, 'só a campanha ativa (3 dias): ' || n;
  select * into r from public.marketing_ads_serie_campanhas('2026-10-01', '2026-10-03') where data = '2026-10-02';
  assert r.investimento = 0 and r.mensagens = 0 and r.tipo_resultado = 'conversa', 'dia sem veiculação';
  select sum(mensagens) into n from public.marketing_ads_serie_campanhas('2026-10-01', '2026-10-03');
  assert n = 14, 'conversas somadas';

  perform set_config('teste.uid', v_vend::text, true);
  select count(*) into n from public.marketing_ads_serie_campanhas('2026-10-01', '2026-10-03');
  assert n = 0, 'vendedor não vê série';
  reset role;
end $$;
rollback;
