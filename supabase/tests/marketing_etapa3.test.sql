-- Marketing, etapa 3: alcance orgânico, comparação só com base completa e
-- progresso das cargas históricas.
\set ON_ERROR_STOP 1
begin;
do $$
declare
  r record;
  n integer;
  v_gestor uuid := '00000000-0000-0000-0000-00000000e9e1';
begin
  insert into auth.users (id, email) values (v_gestor, 'g@e3.local');
  insert into public.profiles (id, email, nome, role, ativo) values (v_gestor, 'g@e3.local', 'G', 'gestor', true)
  on conflict (id) do update set role = excluded.role, ativo = true;

  -- Conta: 3 dias no período (01–03/11) e só 1 dia no anterior (29–31/10).
  insert into public.ig_insights_conta_diario (ig_user_id, data, metrica, valor) values
    ('IG9', '2026-11-01', 'reach', 30000), ('IG9', '2026-11-02', 'reach', 40000), ('IG9', '2026-11-03', 'reach', 30700),
    ('IG9', '2026-10-31', 'reach', 900);
  -- Mídias: duas orgânicas e uma que virou anúncio.
  insert into public.meta_conta_anuncios (id, nome) values ('act_9', 'M');
  insert into public.meta_campanhas (id, conta_id, name) values ('c', 'act_9', 'C');
  insert into public.meta_conjuntos (id, campaign_id, conta_id, name) values ('s', 'c', 'act_9', 'S');
  insert into public.meta_anuncios (id, adset_id, campaign_id, conta_id, name, creative_ig_media_id)
  values ('a', 's', 'c', 'act_9', 'A', 'PAGO');
  insert into public.ig_midias (id, ig_user_id, media_product_type, "timestamp") values
    ('ORG1', 'IG9', 'FEED',  '2026-11-01 15:00+00'),
    ('ORG2', 'IG9', 'REELS', '2026-11-03 02:00+00'),   -- 02/11 23h em São Paulo
    ('PAGO', 'IG9', 'REELS', '2026-11-02 12:00+00'),
    ('VELHO','IG9', 'FEED',  '2026-10-30 12:00+00');
  insert into public.ig_midia_insights (midia_id, metrica, valor) values
    ('ORG1', 'reach', 25), ('ORG2', 'reach', 60), ('PAGO', 'reach', 9000), ('VELHO', 'reach', 40);

  -- Estados das cargas.
  insert into public.meta_sync_estado (chave, valor) values
    ('ads_historico', '{"limite":"2023-10-04","proximoAte":"2026-06-30","concluido":false,"janelasConcluidas":4}'),
    ('ig_historico',  '{"limite":"2026-08-06","proximoAte":"2026-10-14","concluido":false,"semanasConcluidas":3,"semanasTotal":13}');

  set local role authenticated;
  perform set_config('teste.uid', v_gestor::text, true);

  select * into r from public.marketing_ig_resumo('2026-11-01', '2026-11-03') where metrica = 'reach';
  assert r.valor = 100700, 'alcance da conta (inclui anúncios)';
  assert r.valor_anterior is null, 'período anterior incompleto não compara';
  select * into r from public.marketing_ig_resumo('2026-11-01', '2026-11-03') where metrica = 'alcance_organico';
  assert r.valor = 85, 'alcance orgânico = posts não impulsionados do período: ' || r.valor;
  assert r.valor_anterior is null, 'sem base completa, sem comparação';

  -- Com o anterior completo, compara.
  reset role;
  insert into public.ig_insights_conta_diario (ig_user_id, data, metrica, valor) values
    ('IG9', '2026-10-29', 'reach', 800), ('IG9', '2026-10-30', 'reach', 700);
  set local role authenticated;
  select * into r from public.marketing_ig_resumo('2026-11-01', '2026-11-03') where metrica = 'reach';
  assert r.valor_anterior = 2400, 'base completa compara';
  select * into r from public.marketing_ig_resumo('2026-11-01', '2026-11-03') where metrica = 'alcance_organico';
  assert r.valor_anterior = 40, 'orgânico do período anterior';

  -- Progresso das cargas.
  select * into r from public.marketing_progresso_carga() where carga = 'ads';
  assert r.feitas = 4 and r.total = 37 and not r.concluido, 'ads: 4 de 37 meses (' || r.total || ')';
  select * into r from public.marketing_progresso_carga() where carga = 'instagram';
  assert r.feitas = 3 and r.total = 13 and r.proximo_ate = '2026-10-14', 'instagram: 3 de 13 semanas';
  reset role;
end $$;
rollback;
