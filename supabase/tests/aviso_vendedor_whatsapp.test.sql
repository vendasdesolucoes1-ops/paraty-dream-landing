-- Aviso por WhatsApp ao vendedor na atribuição do lead.
\set ON_ERROR_STOP 1
begin;
do $$
declare
  v_a uuid;
  v_b uuid;
  v_sem uuid;
  l1 uuid;
  l2 uuid;
  l3 uuid;
  n integer;
begin
  insert into public.vendedores (nome, telefone, ativo, posicao_round_robin)
  values ('Aviso A', '5524999992001', true, 9001) returning id into v_a;
  insert into public.vendedores (nome, telefone, ativo, posicao_round_robin)
  values ('Aviso B', '5524999992002', true, 9002) returning id into v_b;
  insert into public.vendedores (nome, telefone, ativo, posicao_round_robin)
  values ('Aviso sem telefone', null, true, 9003) returning id into v_sem;

  -- Lead que nasce com vendedor: entra na fila.
  insert into public.leads (nome, telefone, origem, status_crm, vendedor_id)
  values ('Aviso Lead 1', '5511977770001', 'whatsapp', 'novo', v_a) returning id into l1;
  select count(*) into n from public.avisos_vendedor where lead_id = l1 and vendedor_id = v_a and status = 'pendente';
  assert n = 1, 'lead criado com vendedor enfileira aviso';

  -- Repetir a mesma atribuição não duplica.
  perform public.enfileirar_aviso_vendedor(l1, v_a);
  select count(*) into n from public.avisos_vendedor where lead_id = l1;
  assert n = 1, 'sem aviso repetido';

  -- Troca de dono: o aviso pendente do anterior é cancelado e o novo entra.
  update public.leads set vendedor_id = v_b where id = l1;
  select count(*) into n from public.avisos_vendedor where lead_id = l1 and vendedor_id = v_a and status = 'cancelado';
  assert n = 1, 'aviso do dono anterior cancelado';
  select count(*) into n from public.avisos_vendedor where lead_id = l1 and vendedor_id = v_b and status = 'pendente';
  assert n = 1, 'aviso do novo dono';

  -- Atribuição posterior (lead que nasceu sem dono) também avisa.
  insert into public.leads (nome, telefone, origem, status_crm)
  values ('Aviso Lead 2', '5511977770002', 'formulario_meta', 'novo') returning id into l2;
  select count(*) into n from public.avisos_vendedor where lead_id = l2;
  assert n = 0, 'sem vendedor, sem aviso';
  update public.leads set vendedor_id = v_a where id = l2;
  select count(*) into n from public.avisos_vendedor where lead_id = l2 and vendedor_id = v_a;
  assert n = 1, 'atribuição por update avisa';

  -- Lead de teste e vendedor sem telefone não geram aviso.
  insert into public.leads (nome, telefone, origem, status_crm, vendedor_id, is_teste)
  values ('Aviso Teste', '5511977770003', 'whatsapp', 'novo', v_a, true) returning id into l3;
  select count(*) into n from public.avisos_vendedor where lead_id = l3;
  assert n = 0, 'lead de teste não avisa';
  update public.leads set is_teste = false, vendedor_id = v_sem where id = l3;
  select count(*) into n from public.avisos_vendedor where lead_id = l3;
  assert n = 0, 'vendedor sem telefone não avisa';

  -- Reivindicar respeita a folga de 30 s.
  select count(*) into n from public.reivindicar_avisos_vendedor(50) where lead_id in (l1, l2);
  assert n = 0, 'aviso espera a folga';
  update public.avisos_vendedor set agendado_para = now() - interval '1 second'
   where lead_id in (l1, l2) and status = 'pendente';
  select count(*) into n from public.reivindicar_avisos_vendedor(50) where lead_id in (l1, l2);
  assert n = 2, 'reivindica os vencidos';
  select count(*) into n from public.avisos_vendedor where lead_id in (l1, l2) and status = 'enviando';
  assert n = 2, 'marcados como enviando';
end;
$$;
rollback;
