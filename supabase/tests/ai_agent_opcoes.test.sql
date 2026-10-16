-- Opções do agente: faixas aceitas pelas colunas novas.
\set ON_ERROR_STOP 1
begin;
do $$
declare v uuid;
begin
  insert into public.ai_agents (name) values ('Teste opções') returning id into v;
  update public.ai_agents
     set temperatura = 0.7, instrucoes_extras = 'Fale da praia.', mensagem_transferencia = 'Já chamo!||Um minuto.'
   where id = v;
  assert (select temperatura from public.ai_agents where id = v) = 0.7, 'temperatura gravada';

  begin
    update public.ai_agents set temperatura = 1.5 where id = v;
    assert false, 'temperatura acima de 1';
  exception when check_violation then null;
  end;
  begin
    update public.ai_agents set instrucoes_extras = repeat('x', 2001) where id = v;
    assert false, 'instruções acima do limite';
  exception when check_violation then null;
  end;
  begin
    update public.ai_agents set mensagem_transferencia = repeat('x', 501) where id = v;
    assert false, 'mensagem acima do limite';
  exception when check_violation then null;
  end;
end $$;
rollback;
