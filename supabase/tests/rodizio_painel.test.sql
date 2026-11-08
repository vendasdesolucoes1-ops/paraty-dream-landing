-- Tela Rodízio: limite do dia, histórico, ligar sem repartir, mover e
-- distribuição com prévia.
\set ON_ERROR_STOP 1
begin;
do $$
declare
  v_a uuid;
  v_b uuid;
  l1 uuid;
  l2 uuid;
  l3 uuid;
  n integer;
  j jsonb;
  r record;
begin
  update public.vendedores set ativo = false, no_rodizio = false;
  insert into public.vendedores (nome, telefone, ativo, no_rodizio, posicao_round_robin)
  values ('Ana Fila', '5524999991001', true, true, 1) returning id into v_a;
  insert into public.vendedores (nome, telefone, ativo, no_rodizio, posicao_round_robin, limite_diario)
  values ('Beto Fila', '5524999991002', true, true, 2, 1) returning id into v_b;

  -- Leads em espera (sem vendedor).
  delete from public.rodizio_atribuicoes;
  -- Só os leads do teste esperam.
  update public.leads set status_crm = 'perdido' where vendedor_id is null;
  insert into public.leads (nome, telefone, origem, status_crm, created_at) values ('Espera 1', '5511988880001', 'whatsapp', 'novo', now() - interval '3 hours')
  returning id into l1;
  insert into public.leads (nome, telefone, origem, status_crm, created_at) values ('Espera 2', '5511988880002', 'whatsapp', 'novo', now() - interval '2 hours')
  returning id into l2;
  insert into public.leads (nome, telefone, origem, status_crm, created_at) values ('Espera 3', '5511988880003', 'whatsapp', 'novo', now() - interval '1 hours')
  returning id into l3;
  select count(*) into n from public.rodizio_leads_em_espera();

  -- Ligar não reparte.
  perform public.rodizio_ligar(true);
  assert public.rodizio_ativo(), 'ligado';
  select vendedor_id into r from public.leads where id = l1;
  assert r.vendedor_id is null, 'ligar não distribui';

  -- Prévia: simula e desfaz.
  j := public.rodizio_distribuir_espera(false);
  assert (j ->> 'confirmado')::boolean = false, 'prévia';
  assert (j ->> 'distribuidos')::int = n, 'prévia distribui todos (Beto para em 1)';
  select vendedor_id into r from public.leads where id = l1;
  assert r.vendedor_id is null, 'prévia não grava';
  select count(*) into n from public.rodizio_atribuicoes;
  assert n = 0, 'prévia não deixa histórico';
  assert (select posicao_round_robin from public.vendedores where id = v_a) = 1, 'prévia não mexe na fila';

  -- Confirmar: Ana, Beto (limite 1), Ana...
  j := public.rodizio_distribuir_espera(true);
  assert (j ->> 'distribuidos')::int >= 3, 'distribuiu';
  select vendedor_id into r from public.leads where id = l1;
  assert r.vendedor_id = v_a, 'primeiro para a Ana';
  select vendedor_id into r from public.leads where id = l2;
  assert r.vendedor_id = v_b, 'segundo para o Beto';
  select vendedor_id into r from public.leads where id = l3;
  assert r.vendedor_id = v_a, 'Beto bateu o limite: terceiro para a Ana';
  assert public.rodizio_recebidos_hoje(v_b) = 1, 'contador do dia';
  select count(*) into n from public.rodizio_atribuicoes where origem = 'distribuicao' and lead_id is not null;
  assert n >= 3, 'histórico da distribuição ligado aos leads';

  -- Fila normal: escolha e depois o lead (outra chamada) se casam.
  assert public.get_next_round_robin_salesperson() = v_a, 'só a Ana tem vaga hoje';
  insert into public.leads (nome, telefone, origem, status_crm, vendedor_id)
  values ('Novo', '5511988880004', 'whatsapp', 'novo', v_a) returning id into l1;
  select origem into r from public.rodizio_atribuicoes where lead_id = l1;
  assert r.origem = 'rodizio', 'escolha da fila virou atribuição do lead';

  -- Entrega manual e remoção entram no histórico.
  update public.leads set vendedor_id = v_b where id = l1;
  select count(*) into n from public.rodizio_atribuicoes where lead_id = l1 and origem = 'sistema';
  assert n = 1, 'troca fora da fila registrada (sem usuário = sistema)';
  update public.leads set vendedor_id = null where id = l1;
  select count(*) into n from public.rodizio_atribuicoes where lead_id = l1 and origem = 'remocao';
  assert n = 1, 'remoção registrada';
  assert public.rodizio_recebidos_hoje(v_b) = 1, 'troca manual não conta no limite';

  -- Mover: Beto sobe para a primeira vez.
  perform public.rodizio_mover(v_b, -1);
  j := public.rodizio_painel();
  select x into r from jsonb_array_elements(j -> 'vendedores') x where x ->> 'id' = v_b::text;
  assert (r.x ->> 'situacao') = 'limite', 'Beto aparece no limite';
  select x into r from jsonb_array_elements(j -> 'vendedores') x where x ->> 'id' = v_a::text;
  assert (r.x ->> 'vez')::int = 1, 'Ana é a próxima (Beto no limite)';
  assert (j ->> 'ativo')::boolean, 'painel mostra a chave';

  select count(*) into n from public.rodizio_historico(10);
  assert n >= 1, 'histórico legível';

  -- Permissões: a tela chama as RPCs; o histórico só pela gestão.
  assert has_function_privilege('authenticated', 'public.rodizio_painel()', 'execute'), 'painel exposto';
  assert has_function_privilege('authenticated', 'public.rodizio_distribuir_espera(boolean)', 'execute'), 'distribuir exposto';
  assert not has_function_privilege('authenticated', 'public.rodizio_recebidos_hoje(uuid)', 'execute'), 'contador interno';
  assert not has_table_privilege('authenticated', 'public.rodizio_atribuicoes', 'insert'), 'histórico só pelo banco';
end $$;
rollback;
