-- Visita para lead sem vendedor ganha um (rodízio ou consultor responsável).
\set ON_ERROR_STOP 1
begin;
do $$
declare
  v_a uuid;
  v_b uuid;
  l1 uuid;
  l2 uuid;
  l3 uuid;
  r record;
begin
  update public.vendedores set ativo = false, no_rodizio = false;
  insert into public.vendedores (nome, telefone, ativo, no_rodizio, posicao_round_robin)
  values ('Fila Ana', '5524999992001', true, true, 1) returning id into v_a;
  insert into public.vendedores (nome, telefone, ativo, no_rodizio, posicao_round_robin)
  values ('Consultor Beto', '5524999992002', true, false, 2) returning id into v_b;

  insert into public.leads (nome, telefone, origem, status_crm) values ('Sem dono 1', '5511977770001', 'whatsapp', 'novo') returning id into l1;
  insert into public.leads (nome, telefone, origem, status_crm) values ('Sem dono 2', '5511977770002', 'whatsapp', 'novo') returning id into l2;
  insert into public.leads (nome, telefone, origem, status_crm, vendedor_id) values ('Com dono', '5511977770003', 'whatsapp', 'novo', v_b) returning id into l3;

  -- Rodízio ligado: a visita vai para o próximo da fila e o lead passa a ser dele.
  perform public.rodizio_ligar(true);
  insert into public.visitas (lead_id, data_hora, status) values (l1, now() + interval '2 days', 'agendada');
  select vendedor_id into r from public.leads where id = l1;
  assert r.vendedor_id = v_a, 'lead entregue ao rodízio';
  select vendedor_id into r from public.visitas where lead_id = l1;
  assert r.vendedor_id = v_a, 'visita com o vendedor do rodízio';
  assert exists (select 1 from public.interacoes where lead_id = l1 and canal = 'atribuicao'), 'histórico';

  -- Rodízio desligado: vale o consultor responsável ligado a um vendedor.
  perform public.rodizio_ligar(false);
  insert into public.configuracoes (chave, valor)
  values ('consultor_responsavel', jsonb_build_object('vendedor_id', v_b, 'nome', 'Beto', 'telefone', '5524999992002')::text)
  on conflict (chave) do update set valor = excluded.valor;
  insert into public.visitas (lead_id, data_hora, status) values (l2, now() + interval '3 days', 'agendada');
  select vendedor_id into r from public.leads where id = l2;
  assert r.vendedor_id = v_b, 'lead entregue ao consultor';

  -- Lead com dono: a visita herda o dono, nada muda no lead.
  insert into public.visitas (lead_id, data_hora, status) values (l3, now() + interval '4 days', 'agendada');
  select vendedor_id into r from public.visitas where lead_id = l3;
  assert r.vendedor_id = v_b, 'visita herda o vendedor do lead';
end $$;
rollback;
