-- Busca de leads sem acento (coluna leads.busca).
\set ON_ERROR_STOP 1
begin;
do $$
begin
  insert into public.leads (nome, cidade, telefone) values ('João Conceição', 'São Paulo', '5524999992001');
  assert exists (select 1 from public.leads where busca ilike '%joao conceicao%'), 'nome sem acento';
  assert exists (select 1 from public.leads where busca ilike '%sao paulo%'), 'cidade sem acento';
  assert public.sem_acento('ÁÉÍÓÚ ãõ ç') = 'aeiou ao c', 'sem_acento';
end $$;
rollback;
