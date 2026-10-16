-- Condições comerciais editáveis no painel (decisão de 18/10/2026).
--
-- A gestão cria, edita e escolhe a condição vigente (entrada e prazo) em
-- Configurações → Condições comerciais. Só uma é vigente por vez. A vigente
-- alimenta, num lugar só:
--   - a landing (RPC pública condicao_vigente_publica);
--   - o Imagery, via fatos_comerciais (entrada_percentual e parcelas_max ficam
--     'aprovado' com os valores da vigente; sem vigente, 'revogado' e as peças
--     não citam condição).
-- A Sophia continua sem citar números (regra do prompt).

create table if not exists public.condicoes_comerciais (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null check (length(trim(nome)) > 0),
  entrada_percentual  numeric(5,2) not null check (entrada_percentual >= 0 and entrada_percentual <= 100),
  parcelas_max        int not null check (parcelas_max between 1 and 480),
  observacao          text,
  vigente             boolean not null default false,
  arquivada           boolean not null default false,
  vigente_desde       timestamptz,
  aprovado_por        uuid,
  criado_por          uuid default auth.uid(),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  check (not (vigente and arquivada))
);

create unique index if not exists condicoes_comerciais_uma_vigente
  on public.condicoes_comerciais ((true)) where vigente;

alter table public.condicoes_comerciais enable row level security;
drop policy if exists "condicoes_select" on public.condicoes_comerciais;
create policy "condicoes_select" on public.condicoes_comerciais
  for select to authenticated using (true);
drop policy if exists "condicoes_write_gestao" on public.condicoes_comerciais;
create policy "condicoes_write_gestao" on public.condicoes_comerciais
  for all to authenticated using (public.sou_gestao()) with check (public.sou_gestao());
grant select, insert, update on public.condicoes_comerciais to authenticated;

drop trigger if exists auditoria on public.condicoes_comerciais;
create trigger auditoria after insert or update or delete on public.condicoes_comerciais
  for each row execute function public.registrar_auditoria();

-- Mantém fatos_comerciais em sincronia com a condição vigente.
create or replace function public.sincronizar_fatos_condicao()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v public.condicoes_comerciais;
begin
  select * into v from public.condicoes_comerciais where vigente;
  if found then
    insert into public.fatos_comerciais (chave, valor, descricao, status, responsavel_id, aprovado_em, atualizado_em)
    values
      ('entrada_percentual', rtrim(rtrim(v.entrada_percentual::text, '0'), '.'),
       'Entrada mínima, em % (condição vigente: ' || v.nome || ')', 'aprovado', v.aprovado_por, now(), now()),
      ('parcelas_max', v.parcelas_max::text,
       'Prazo máximo do saldo, em parcelas (condição vigente: ' || v.nome || ')', 'aprovado', v.aprovado_por, now(), now())
    on conflict (chave) do update set
      valor = excluded.valor, descricao = excluded.descricao, status = 'aprovado',
      responsavel_id = excluded.responsavel_id, aprovado_em = now(), atualizado_em = now();
  else
    update public.fatos_comerciais set status = 'revogado', atualizado_em = now()
     where chave in ('entrada_percentual', 'parcelas_max') and status <> 'revogado';
  end if;
end;
$$;

create or replace function public.condicoes_comerciais_mudou()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists condicoes_comerciais_atualizado on public.condicoes_comerciais;
create trigger condicoes_comerciais_atualizado
  before update on public.condicoes_comerciais
  for each row execute function public.condicoes_comerciais_mudou();

-- Editar os números da vigente atualiza tudo na hora.
create or replace function public.condicoes_comerciais_sincronizar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sincronizar_fatos_condicao();
  return null;
end;
$$;

drop trigger if exists condicoes_comerciais_sincronizar on public.condicoes_comerciais;
create trigger condicoes_comerciais_sincronizar
  after insert or update or delete on public.condicoes_comerciais
  for each statement execute function public.condicoes_comerciais_sincronizar();

-- Escolhe a vigente (troca atômica) ou encerra (p_id null = nenhuma vigente).
create or replace function public.definir_condicao_vigente(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sou_gestao() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  update public.condicoes_comerciais set vigente = false where vigente and id is distinct from p_id;
  if p_id is not null then
    update public.condicoes_comerciais
       set vigente = true, arquivada = false, vigente_desde = now(), aprovado_por = auth.uid()
     where id = p_id;
    if not found then
      raise exception 'Condição não encontrada.' using errcode = '22023';
    end if;
  end if;
end;
$$;

-- O que a landing mostra (sem login). Sem vigente, nada: a landing não cita números.
create or replace function public.condicao_vigente_publica()
returns table (entrada_percentual numeric, parcelas_max int)
language sql
stable
security definer
set search_path = public
as $$
  select c.entrada_percentual, c.parcelas_max
    from public.condicoes_comerciais c
   where c.vigente
   limit 1
$$;

revoke all on function public.sincronizar_fatos_condicao() from public, anon, authenticated;
revoke all on function public.definir_condicao_vigente(uuid) from public, anon;
grant execute on function public.definir_condicao_vigente(uuid) to authenticated;
revoke all on function public.condicao_vigente_publica() from public;
grant execute on function public.condicao_vigente_publica() to anon, authenticated;

-- Ponto de partida: a condição que a landing já mostra hoje (10% + 240x),
-- vigente para nada mudar no ar. A gestão troca ou edita no painel.
insert into public.condicoes_comerciais (nome, entrada_percentual, parcelas_max, observacao, vigente, vigente_desde, criado_por)
select 'Condição de lançamento', 10, 240, 'Direto com a loteadora, sem banco.', true, now(), null
 where not exists (select 1 from public.condicoes_comerciais);

notify pgrst, 'reload schema';
