-- Rodízio automático: carga, gatilho ao qualificar e distribuição em lotes.
\set ON_ERROR_STOP 1
begin;
do $$
declare
  v_a uuid;
  v_b uuid;
  l uuid;
  n integer;
  r record;
begin
  update public.vendedores set ativo = false, no_rodizio = false;
  update public.leads set status_crm = 'perdido' where vendedor_id is null;
  insert into public.vendedores (nome, telefone, ativo, no_rodizio, posicao_round_robin)
  values ('Ana Carga', '5524999993001', true, true, 1) returning id into v_a;
  insert into public.vendedores (nome, telefone, ativo, no_rodizio, posicao_round_robin)
  values ('Beto Carga', '5524999993002', true, true, 2) returning id into v_b;

  -- Ana já tem 2 leads abertos.
  perform public.rodizio_ligar(false);
  insert into public.leads (nome, telefone, origem, status_crm, vendedor_id)
  values ('Da Ana 1', '5511966660001', 'whatsapp', 'novo', v_a),
         ('Da Ana 2', '5511966660002', 'whatsapp', 'novo', v_a);

  -- 1. Por carga: Beto (0 abertos) antes da Ana (2), mesmo sendo o 2º da fila.
  perform public.rodizio_ligar(true);
  assert public.rodizio_modo() = 'carga', 'carga é o padrão';
  assert public.get_next_round_robin_salesperson() = v_b, 'menos carga primeiro';
  delete from public.rodizio_atribuicoes where lead_id is null;

  -- Modo fila: volta a rotação pura.
  update public.configuracoes set valor = 'fila' where chave = 'rodizio_modo';
  update public.vendedores set posicao_round_robin = 1 where id = v_a;
  update public.vendedores set posicao_round_robin = 2 where id = v_b;
  assert public.get_next_round_robin_salesperson() = v_a, 'fila ignora carga';
  delete from public.rodizio_atribuicoes where lead_id is null;
  update public.configuracoes set valor = 'carga' where chave = 'rodizio_modo';

  -- 2. Lead movido para Qualificado sem vendedor ganha um na hora, com aviso.
  insert into public.leads (nome, telefone, origem, status_crm)
  values ('Vai qualificar', '5511966660010', 'whatsapp', 'novo') returning id into l;
  select vendedor_id into r from public.leads where id = l;
  assert r.vendedor_id is null, 'novo continua sem vendedor (não é o gatilho de chegada)';
  update public.leads set status_crm = 'qualificado' where id = l;
  select vendedor_id into r from public.leads where id = l;
  assert r.vendedor_id = v_b, 'qualificado ganhou vendedor por carga';
  assert exists (select 1 from public.avisos_vendedor where lead_id = l and vendedor_id = v_b),
    'corretor avisado';
  assert exists (select 1 from public.rodizio_atribuicoes where lead_id = l and origem = 'rodizio'),
    'histórico do rodízio';
  assert exists (select 1 from public.interacoes where lead_id = l and canal = 'atribuicao'),
    'linha no histórico do lead';

  -- Lead de teste não entra.
  insert into public.leads (nome, telefone, origem, status_crm, is_teste)
  values ('Teste', '5511966660011', 'whatsapp', 'qualificado', true) returning id into l;
  assert (select vendedor_id from public.leads where id = l) is null, 'teste fica de fora';

  -- 3. Backlog: 5 qualificados parados (rodízio desligado quando chegaram).
  perform public.rodizio_ligar(false);
  insert into public.leads (nome, telefone, origem, status_crm, created_at)
  select 'Parado ' || g, '55119666601' || lpad(g::text, 2, '0'), 'formulario_meta', 'qualificado',
         now() - interval '60 days'
    from generate_series(20, 24) g;
  perform public.rodizio_ligar(true);
  select count(*) into n from public.rodizio_leads_em_espera() e
    join public.leads le on le.id = e where le.nome like 'Parado %';
  assert n = 5, 'qualificados antigos contam como em espera';

  update public.configuracoes set valor = '2' where chave = 'rodizio_lote';
  n := public.rodizio_distribuir_automatico();
  assert n = 4, format('lote de 2 por corretor: 4 entregues, veio %s', n);
  select count(*) into n from public.leads where nome like 'Parado %' and vendedor_id = v_a;
  assert n = 2, 'Ana recebeu 2';
  select count(*) into n from public.leads where nome like 'Parado %' and vendedor_id = v_b;
  assert n = 2, 'Beto recebeu 2';
  n := public.rodizio_distribuir_automatico();
  assert n = 1, 'a rodada seguinte entrega o que sobrou';
  select count(*) into n from public.leads where nome like 'Parado %' and vendedor_id is null;
  assert n = 0, 'nenhum qualificado sem dono';

  -- Rodízio desligado: o job não mexe.
  perform public.rodizio_ligar(false);
  insert into public.leads (nome, telefone, origem, status_crm)
  values ('Fora', '5511966660030', 'whatsapp', 'qualificado') returning id into l;
  assert public.rodizio_distribuir_automatico() = 0, 'desligado não distribui';

  assert not has_function_privilege('authenticated', 'public.rodizio_distribuir_automatico()', 'execute'),
    'job não exposto';
end $$;
rollback;
