-- Fonte única de fatos comerciais (auditoria R-20, issue #45).
--
-- A landing dizia "saldo em até 240x", o Imagery "10% + 180x", e a Sophia é
-- proibida de citar números. Agora a condição comercial vive aqui, com
-- status e responsável. O Imagery só usa o que estiver APROVADO e bloqueia a
-- publicação de legenda com condição fora desta tabela.
--
-- Decisão pendente (Linear VHA-51): qual é o prazo oficial. Os valores
-- abaixo entram como 'pendente' até a gestão aprovar no painel/SQL.
create table if not exists public.fatos_comerciais (
  chave           text primary key,
  valor           text not null,
  descricao       text,
  status          text not null default 'pendente' check (status in ('pendente', 'aprovado', 'revogado')),
  responsavel_id  uuid references public.profiles(id),
  aprovado_em     timestamptz,
  atualizado_em   timestamptz not null default now()
);

alter table public.fatos_comerciais enable row level security;
drop policy if exists "fatos_comerciais_select" on public.fatos_comerciais;
create policy "fatos_comerciais_select" on public.fatos_comerciais
  for select to authenticated using (true);
drop policy if exists "fatos_comerciais_write_gestao" on public.fatos_comerciais;
create policy "fatos_comerciais_write_gestao" on public.fatos_comerciais
  for all to authenticated using (public.sou_gestao()) with check (public.sou_gestao());
grant select, insert, update on public.fatos_comerciais to authenticated;

insert into public.fatos_comerciais (chave, valor, descricao) values
  ('entrada_percentual', '10', 'Entrada mínima, em % do valor do lote'),
  ('parcelas_max', '240', 'Prazo máximo do saldo, em parcelas mensais (landing diz 240; Imagery dizia 180 — decidir em VHA-51)'),
  ('metragem_min_m2', '250', 'Menor lote, em m²'),
  ('metragem_max_m2', '450', 'Maior lote, em m²')
on conflict (chave) do nothing;

-- Trilha de auditoria também para os fatos.
drop trigger if exists auditoria on public.fatos_comerciais;
create trigger auditoria after insert or update or delete on public.fatos_comerciais
  for each row execute function public.registrar_auditoria();
