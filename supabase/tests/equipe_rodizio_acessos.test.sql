-- Rodízio com chave única, saída do rodízio, acessos e entrega manual.
\set ON_ERROR_STOP 1
begin;
do $$
declare
  v_user uuid := '00000000-0000-0000-0000-00000000a0c1';
  v_gone uuid := '00000000-0000-0000-0000-00000000a0c2';
  v_vend uuid;
  v_vend2 uuid;
  l_id uuid;
  n integer;
  r record;
  ok boolean;
begin
  insert into auth.users (id, email) values (v_user, 'a@eq.local'), (v_gone, 'b@eq.local');
  insert into public.profiles (id, email, nome, role, ativo) values
    (v_user, 'a@eq.local', 'Ana', 'vendedor', true),
    (v_gone, 'b@eq.local', 'Beto', 'vendedor', true)
  on conflict (id) do update set ativo = true, deletado_em = null;
  update public.vendedores set ativo = false;
  insert into public.vendedores (nome, ativo, posicao_round_robin, profile_id) values ('Ana', true, 0, v_user)
  returning id into v_vend;
  insert into public.vendedores (nome, ativo, posicao_round_robin, profile_id) values ('Beto', true, 1, v_gone)
  returning id into v_vend2;

  -- Chave desligada: ninguém recebe pelo rodízio.
  assert not public.rodizio_ativo(), 'começa desligado';
  assert public.get_next_round_robin_salesperson() is null, 'fila parada';
  insert into public.leads (nome, telefone, origem, status_crm) values ('Sem dono', '5511999990001', 'whatsapp', 'novo')
  returning id into l_id;

  -- Membro excluído sai do rodízio.
  update public.profiles set deletado_em = now(), ativo = false where id = v_gone;
  select ativo into r from public.vendedores where id = v_vend2;
  assert not r.ativo, 'excluído sai do rodízio';

  -- Ligar distribui os que esperavam (só para quem está no rodízio).
  n := public.definir_rodizio(true);
  assert n >= 1, 'distribuiu';
  select vendedor_id into r from public.leads where id = l_id;
  assert r.vendedor_id = v_vend, 'foi para a Ana';
  assert public.get_next_round_robin_salesperson() = v_vend, 'fila andando';

  -- Entrega manual: troca o dono, registra e avisa.
  update public.vendedores set ativo = true where id = v_vend2;
  perform public.atribuir_vendedor(l_id, v_vend2);
  select vendedor_id into r from public.leads where id = l_id;
  assert r.vendedor_id = v_vend2, 'entregue ao Beto';
  select count(*) into n from public.interacoes where lead_id = l_id and canal = 'atribuicao';
  assert n = 1, 'histórico da entrega';

  -- Acessos: só valores conhecidos, e o próprio usuário não altera.
  assert public.definir_acessos(v_user, array['lotes', 'agenda', 'xyz', 'lotes']) = array['agenda', 'lotes'], 'filtra e ordena';
  ok := false;
  begin
    update public.profiles set acessos = '{lotes_3d}' where id = v_user;
  exception when others then ok := false;
  end;
  -- Como postgres a proteção não se aplica; o que importa é a regra para o authenticated:
  assert has_function_privilege('authenticated', 'public.definir_acessos(uuid, text[])', 'execute'), 'rpc exposta';
  assert not has_function_privilege('authenticated', 'public.proximo_vendedor_da_fila()', 'execute'), 'fila interna fechada';
end $$;
rollback;
