-- Marketing: funções de leitura dos dados da integração Meta.
-- Cobre: somas do período e do anterior, dias sem veiculação com zero, listas por
-- nível (com itens sem gasto), breakdowns, Instagram, status dos jobs e acesso
-- (gestão vê; vendedor recebe vazio/zero; anon não executa).
\set ON_ERROR_STOP 1
begin;
do $$
declare
  r record;
  n integer;
  v numeric;
  v_gestor   uuid := '00000000-0000-0000-0000-00000000e5e1';
  v_vendedor uuid := '00000000-0000-0000-0000-00000000e5e2';
begin
  insert into auth.users (id, email) values (v_gestor, 'g@mkt.local'), (v_vendedor, 'v@mkt.local');
  insert into public.profiles (id, email, nome, role, ativo) values
    (v_gestor, 'g@mkt.local', 'Gestor', 'gestor', true),
    (v_vendedor, 'v@mkt.local', 'Vendedor', 'vendedor', true)
  on conflict (id) do update set role = excluded.role, ativo = true;

  -- Dados de Ads ---------------------------------------------------------------
  insert into public.meta_conta_anuncios (id, nome, moeda, fuso) values ('act_1', 'VS - Moradas', 'BRL', 'America/Sao_Paulo');
  insert into public.meta_campanhas (id, conta_id, name, effective_status, objective, daily_budget) values
    ('c1', 'act_1', 'Lotes', 'ACTIVE', 'OUTCOME_LEADS', 5000),
    ('c2', 'act_1', 'Antiga', 'ARCHIVED', 'OUTCOME_TRAFFIC', null);
  insert into public.meta_conjuntos (id, campaign_id, conta_id, name, effective_status) values ('s1', 'c1', 'act_1', 'Público A', 'ACTIVE');
  insert into public.meta_anuncios (id, adset_id, campaign_id, conta_id, name, effective_status, creative_title, creative_thumbnail_url) values
    ('a1', 's1', 'c1', 'act_1', 'Vídeo drone', 'ACTIVE', 'Seu lote em Paraty', 'https://t/a1.jpg'),
    ('a2', 's1', 'c1', 'act_1', 'Carrossel', 'PAUSED', null, null);
  insert into public.meta_insights_diarios
    (ad_id, data, adset_id, campaign_id, conta_id, spend, impressions, reach, inline_link_clicks, clicks, leads, mensagens_iniciadas) values
    ('a1', '2026-10-01', 's1', 'c1', 'act_1', 10, 100, 80, 5, 7, 2, 1),
    ('a1', '2026-10-02', 's1', 'c1', 'act_1', 20, 200, 150, 8, 9, 1, 0),
    ('a2', '2026-10-02', 's1', 'c1', 'act_1', 5, 50, 40, 1, 1, 0, 2),
    ('a1', '2026-09-30', 's1', 'c1', 'act_1', 7, 70, 60, 2, 2, 1, 0);   -- período anterior
  insert into public.meta_insights_breakdowns (ad_id, data, tipo, dim1, dim2, adset_id, campaign_id, conta_id, spend, impressions, leads) values
    ('a1', '2026-10-01', 'idade_genero', '25-34', 'female', 's1', 'c1', 'act_1', 6, 60, 1),
    ('a1', '2026-10-01', 'idade_genero', '25-34', 'male',   's1', 'c1', 'act_1', 4, 40, 1),
    ('a1', '2026-10-02', 'idade_genero', '25-34', 'female', 's1', 'c1', 'act_1', 3, 30, 0),
    ('a1', '2026-10-01', 'regiao', 'Rio de Janeiro', '',    's1', 'c1', 'act_1', 10, 100, 2);

  -- Dados de Instagram -----------------------------------------------------------
  insert into public.ig_conta_diaria (ig_user_id, data, followers_count) values
    ('IG1', '2026-09-30', 1200), ('IG1', '2026-10-02', 1210);
  insert into public.ig_insights_conta_diario (ig_user_id, data, metrica, valor) values
    ('IG1', '2026-10-01', 'reach', 100), ('IG1', '2026-10-02', 'reach', 50),
    ('IG1', '2026-09-30', 'reach', 30),  ('IG1', '2026-10-01', 'views', 400);
  insert into public.ig_midias (id, ig_user_id, caption, media_type, media_product_type, "timestamp", thumbnail_url, media_url, like_count) values
    ('M1', 'IG1', 'Reel do drone', 'VIDEO', 'REELS', '2026-10-01 15:00:00+00', 'https://t/m1.jpg', 'https://v/m1.mp4', 30),
    ('M2', 'IG1', 'Foto do stand', 'IMAGE', 'FEED',  '2026-10-02 12:00:00+00', null, 'https://i/m2.jpg', 12),
    ('M3', 'IG1', 'Post antigo',   'IMAGE', 'FEED',  '2026-09-01 12:00:00+00', null, null, 5);
  insert into public.ig_midia_insights (midia_id, metrica, valor) values
    ('M1', 'reach', 100), ('M1', 'views', 300), ('M1', 'ig_reels_avg_watch_time', 4500), ('M2', 'reach', 40);
  insert into public.ig_demografia (ig_user_id, data, tipo, chave, valor) values
    ('IG1', '2026-10-01', 'age', '25-34', 90),
    ('IG1', '2026-10-02', 'age', '25-34', 100), ('IG1', '2026-10-02', 'age', '35-44', 60),
    ('IG1', '2026-10-02', 'country', 'BR', 900);

  -- Execuções -------------------------------------------------------------------
  insert into public.meta_sync_execucoes (job, iniciado_em, finalizado_em, status, registros) values
    ('ads_diario', '2026-10-01 06:10+00', '2026-10-01 06:12+00', 'sucesso', 40);
  insert into public.meta_sync_execucoes (job, iniciado_em, finalizado_em, status, erro, codigo_erro) values
    ('ads_diario', '2026-10-02 06:10+00', '2026-10-02 06:10+00', 'erro', 'token expirado', 190);

  -- ===== Como gestão ==========================================================
  set local role authenticated;
  perform set_config('teste.uid', v_gestor::text, true);

  -- Resumo: atual (01–02/10) e anterior (29–30/09).
  select * into r from public.marketing_ads_resumo('2026-10-01', '2026-10-02') where periodo = 'atual';
  assert r.investimento = 35, 'investimento do período: ' || r.investimento;
  assert r.leads = 3 and r.mensagens = 3 and r.cliques_link = 14 and r.impressoes = 350, 'somas do período';
  assert r.anuncios_com_gasto = 2, 'dois anúncios com gasto';
  assert r.moeda = 'BRL', 'moeda da conta';
  select * into r from public.marketing_ads_resumo('2026-10-01', '2026-10-02') where periodo = 'anterior';
  assert r.inicio = '2026-09-29' and r.fim = '2026-09-30', 'período anterior de mesmo tamanho';
  assert r.investimento = 7 and r.leads = 1, 'somas do período anterior';
  select count(*) into n from public.marketing_ads_resumo('2026-10-05', '2026-10-01');
  assert n = 0, 'período invertido não devolve nada';

  -- Série diária: dia sem veiculação vem com zero; filtro por anúncio.
  select count(*) into n from public.marketing_ads_serie('2026-10-01', '2026-10-03');
  assert n = 3, 'um ponto por dia';
  select investimento into v from public.marketing_ads_serie('2026-10-01', '2026-10-03') where data = '2026-10-03';
  assert v = 0, 'dia sem veiculação com zero';
  select investimento into v from public.marketing_ads_serie('2026-10-01', '2026-10-03', 'anuncio', 'a2') where data = '2026-10-02';
  assert v = 5, 'série filtrada por anúncio';
  select sum(leads) into v from public.marketing_ads_serie('2026-10-01', '2026-10-02', 'campanha', 'c1');
  assert v = 3, 'série filtrada por campanha';

  -- Listas por nível: campanha sem gasto aparece com zero.
  select count(*) into n from public.marketing_anuncios('2026-10-01', '2026-10-02', 'campanha');
  assert n = 2, 'duas campanhas (inclusive a arquivada)';
  select investimento into v from public.marketing_anuncios('2026-10-01', '2026-10-02', 'campanha') where id = 'c2';
  assert v = 0, 'campanha sem gasto com zero';
  select * into r from public.marketing_anuncios('2026-10-01', '2026-10-02', 'conjunto') where id = 's1';
  assert r.campanha_nome = 'Lotes' and r.investimento = 35, 'conjunto com o nome da campanha';
  select * into r from public.marketing_anuncios('2026-10-01', '2026-10-02', 'anuncio') where id = 'a1';
  assert r.investimento = 30 and r.leads = 3 and r.titulo = 'Seu lote em Paraty' and r.conjunto_nome = 'Público A', 'anúncio com criativo e pais';
  assert r.thumbnail_url = 'https://t/a1.jpg', 'miniatura do criativo';
  select count(*) into n from public.marketing_anuncios('2026-10-01', '2026-10-02', 'outro');
  assert n = 0, 'nível desconhecido não devolve nada';

  -- Breakdowns: soma por dimensão, ordenado por investimento; filtro por anúncio.
  select * into r from public.marketing_breakdown('2026-10-01', '2026-10-02', 'idade_genero') limit 1;
  assert r.dim1 = '25-34' and r.dim2 = 'female' and r.investimento = 9, 'maior investimento primeiro';
  select count(*) into n from public.marketing_breakdown('2026-10-01', '2026-10-02', 'idade_genero', 'anuncio', 'a2');
  assert n = 0, 'a2 não tem breakdown';
  select count(*) into n from public.marketing_breakdown('2026-10-01', '2026-10-02', 'regiao');
  assert n = 1, 'região';

  -- Instagram: resumo com período anterior e seguidores.
  select * into r from public.marketing_ig_resumo('2026-10-01', '2026-10-02') where metrica = 'reach';
  -- O anterior (29–30/09) só tem 30/09: base incompleta, sem comparação (etapa 3).
  assert r.valor = 150 and r.valor_anterior is null, 'alcance atual; anterior incompleto não compara';
  select * into r from public.marketing_ig_resumo('2026-10-01', '2026-10-02') where metrica = 'seguidores';
  assert r.valor = 1210 and r.valor_anterior = 1200, 'seguidores no fim de cada período';
  select count(*) into n from public.marketing_ig_serie('2026-10-01', '2026-10-02');
  assert n = 4, 'série: 3 linhas de insights + 1 de seguidores';

  -- Mídias do período com métricas em colunas; tipo filtra; antigo fica de fora.
  select count(*) into n from public.marketing_ig_midias('2026-10-01', '2026-10-02');
  assert n = 2, 'M1 e M2 no período';
  select * into r from public.marketing_ig_midias('2026-10-01', '2026-10-02') where id = 'M1';
  assert r.alcance = 100 and r.views = 300 and r.tempo_medio_ms = 4500, 'métricas do reel';
  assert r.imagem_url = 'https://t/m1.jpg', 'reel usa a miniatura';
  select imagem_url into r from public.marketing_ig_midias('2026-10-01', '2026-10-02') where id = 'M2';
  assert r.imagem_url = 'https://i/m2.jpg', 'foto usa media_url';
  select count(*) into n from public.marketing_ig_midias('2026-10-01', '2026-10-02', 'REELS');
  assert n = 1, 'filtro por tipo';

  -- Demografia: só a foto mais recente de cada tipo.
  select count(*) into n from public.marketing_ig_demografia() where tipo = 'age';
  assert n = 2, 'idade da foto de 02/10';
  select valor into n from public.marketing_ig_demografia() where tipo = 'age' and chave = '25-34';
  assert n = 100, 'valor da foto mais recente';

  -- Status: última execução e último sucesso de cada job.
  select * into r from public.marketing_status_integracao() where job = 'ads_diario';
  assert r.ultimo_status = 'erro' and r.codigo_erro = 190, 'última execução é o erro';
  assert r.ultimo_sucesso_em = '2026-10-01 06:10+00', 'último sucesso anterior';

  -- ===== Como vendedor: nada de dado ==========================================
  perform set_config('teste.uid', v_vendedor::text, true);
  select investimento into v from public.marketing_ads_resumo('2026-10-01', '2026-10-02') where periodo = 'atual';
  assert v = 0, 'vendedor recebe zero';
  select count(*) into n from public.marketing_anuncios('2026-10-01', '2026-10-02', 'anuncio');
  assert n = 0, 'vendedor não vê anúncios';
  select count(*) into n from public.marketing_ig_midias('2026-10-01', '2026-10-02');
  assert n = 0, 'vendedor não vê mídias';
  select count(*) into n from public.marketing_status_integracao();
  assert n = 0, 'vendedor não vê execuções';
  select count(*) into n from public.marketing_ig_resumo('2026-10-01', '2026-10-02');
  assert n = 0, 'vendedor não vê o resumo do Instagram';
  reset role;

  -- ===== anon não executa =====================================================
  set local role anon;
  begin
    perform public.marketing_ads_resumo('2026-10-01', '2026-10-02');
    assert false, 'anon não deveria executar';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;
rollback;
