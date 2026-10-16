-- PROPOSTAS (issue #58): a proposta deixa de ser só uma etapa do funil e vira
-- entidade, com valor, condições, versão e aceite. É a base do forecast de
-- vendas: valor das propostas em aberto × probabilidade da etapa do lead.
--
-- Versão: cada nova proposta para o mesmo lead + lote ganha versao = última + 1
-- (trigger). As versões anteriores ficam como histórico; o forecast só olha a
-- mais recente de cada lead + lote, para não somar a mesma negociação duas vezes.

-- ---------------------------------------------------------------------------
-- Tabela
-- ---------------------------------------------------------------------------
create table if not exists public.propostas (
  id uuid primary key default gen_random_uuid(),
  -- CASCADE: proposta não existe sem o lead (excluir_lead_definitivo apaga tudo).
  lead_id uuid not null references public.leads(id) on delete cascade,
  -- SET NULL: apagar o lote não pode apagar o histórico da negociação.
  lote_id uuid references public.lotes(id) on delete set null,
  valor_total numeric(14,2) not null check (valor_total >= 0),
  entrada numeric(14,2) check (entrada is null or entrada >= 0),
  parcelas integer check (parcelas is null or parcelas between 0 and 600),
  condicoes text,
  versao integer not null default 1,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'enviada', 'aceita', 'recusada', 'expirada')),
  valida_ate date,
  aceite_em timestamptz,
  criado_por uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_propostas_lead on public.propostas (lead_id, criado_em desc);
create index if not exists idx_propostas_lote on public.propostas (lote_id) where lote_id is not null;
-- Forecast e listas filtram pelas abertas.
create index if not exists idx_propostas_abertas
  on public.propostas (valida_ate)
  where status in ('rascunho', 'enviada');
-- Uma versão por lead + lote. coalesce: proposta sem lote definido também
-- versiona (lote_id nulo não é "distinto" de outro nulo aqui).
create unique index if not exists idx_propostas_versao_unica
  on public.propostas (
    lead_id,
    coalesce(lote_id, '00000000-0000-0000-0000-000000000000'::uuid),
    versao
  );

-- ---------------------------------------------------------------------------
-- Triggers: versão, aceite_em e atualizado_em
-- ---------------------------------------------------------------------------
create or replace function public.propostas_antes_inserir()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trava por lead + lote: dois cliques em "Nova versão" não disputam o mesmo número.
  perform pg_advisory_xact_lock(
    hashtext('propostas:' || new.lead_id::text || ':' || coalesce(new.lote_id::text, '-'))
  );
  -- SECURITY DEFINER: o vendedor só enxerga as próprias propostas, mas a
  -- numeração precisa considerar todas as versões daquele lead + lote.
  select coalesce(max(p.versao), 0) + 1
    into new.versao
    from public.propostas p
   where p.lead_id = new.lead_id
     and p.lote_id is not distinct from new.lote_id;

  if new.criado_por is null then
    new.criado_por := auth.uid();
  end if;
  if new.status = 'aceita' and new.aceite_em is null then
    new.aceite_em := now();
  end if;
  return new;
end;
$$;

create or replace function public.propostas_antes_atualizar()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  -- Versão, lead e autor não mudam depois de criados.
  new.versao := old.versao;
  new.lead_id := old.lead_id;
  new.criado_por := old.criado_por;
  new.criado_em := old.criado_em;
  if new.status = 'aceita' and old.status is distinct from 'aceita' then
    new.aceite_em := coalesce(new.aceite_em, now());
  elsif new.status <> 'aceita' then
    new.aceite_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_propostas_antes_inserir on public.propostas;
create trigger trg_propostas_antes_inserir
  before insert on public.propostas
  for each row execute function public.propostas_antes_inserir();

drop trigger if exists trg_propostas_antes_atualizar on public.propostas;
create trigger trg_propostas_antes_atualizar
  before update on public.propostas
  for each row execute function public.propostas_antes_atualizar();

-- ---------------------------------------------------------------------------
-- RLS: gestão tudo; vendedor só nas propostas de leads da carteira
-- ---------------------------------------------------------------------------
alter table public.propostas enable row level security;

drop policy if exists "propostas_select_por_lead" on public.propostas;
create policy "propostas_select_por_lead" on public.propostas
  for select to authenticated
  using (public.pode_ver_lead(lead_id));

drop policy if exists "propostas_insert_por_lead" on public.propostas;
create policy "propostas_insert_por_lead" on public.propostas
  for insert to authenticated
  with check (public.pode_ver_lead(lead_id));

drop policy if exists "propostas_update_por_lead" on public.propostas;
create policy "propostas_update_por_lead" on public.propostas
  for update to authenticated
  using (public.pode_ver_lead(lead_id))
  with check (public.pode_ver_lead(lead_id));

-- Apagar proposta some com o histórico de negociação: só a gestão.
drop policy if exists "propostas_delete_gestao" on public.propostas;
create policy "propostas_delete_gestao" on public.propostas
  for delete to authenticated
  using (public.sou_gestao());

drop policy if exists "propostas_service_role" on public.propostas;
create policy "propostas_service_role" on public.propostas
  for all to service_role using (true) with check (true);

grant select, insert, update, delete on public.propostas to authenticated;

-- ---------------------------------------------------------------------------
-- Probabilidade de fechamento por etapa do funil (peso do forecast)
-- ---------------------------------------------------------------------------
-- Tabela e não constante no código: a gestão ajusta o peso conforme o
-- histórico real de conversão sem precisar de deploy.
create table if not exists public.funil_probabilidades (
  etapa text primary key
    check (etapa in ('novo', 'qualificado', 'agendado', 'visitou', 'proposta', 'fechado', 'perdido')),
  probabilidade numeric(4,3) not null check (probabilidade between 0 and 1),
  atualizado_em timestamptz not null default now()
);

-- do nothing: rodar de novo não desfaz um ajuste feito pela gestão.
insert into public.funil_probabilidades (etapa, probabilidade) values
  ('novo', 0.05),
  ('qualificado', 0.10),
  ('agendado', 0.20),
  ('visitou', 0.35),
  ('proposta', 0.50),
  ('fechado', 1.00),
  ('perdido', 0.00)
on conflict (etapa) do nothing;

alter table public.funil_probabilidades enable row level security;

drop policy if exists "funil_probabilidades_select" on public.funil_probabilidades;
create policy "funil_probabilidades_select" on public.funil_probabilidades
  for select to authenticated using (true);

drop policy if exists "funil_probabilidades_write_gestao" on public.funil_probabilidades;
create policy "funil_probabilidades_write_gestao" on public.funil_probabilidades
  for all to authenticated
  using (public.sou_gestao()) with check (public.sou_gestao());

grant select, insert, update, delete on public.funil_probabilidades to authenticated;

-- ---------------------------------------------------------------------------
-- forecast_mensal: previsto (ponderado) × realizado, mês a mês
-- ---------------------------------------------------------------------------
-- Previsto: a versão mais recente de cada lead + lote, se ainda aberta
-- (rascunho/enviada), entra no mês em que deve fechar — o da validade, ou
-- 30 dias após a criação quando não tem validade. Proposta que já passou dessa
-- data e continua aberta conta no mês corrente (ainda pode fechar, mas não
-- no passado). Peso = probabilidade da etapa atual do lead.
--
-- Realizado: soma de valor_total das compras do mês (data_compra, ou a data de
-- cadastro quando falta), exceto distratadas.
--
-- SECURITY DEFINER para ler compras/clientes (que o vendedor não enxerga),
-- mas o recorte por papel é feito aqui dentro: gestão vê tudo; vendedor só a
-- própria carteira; quem não é nenhum dos dois recebe zeros.
create or replace function public.forecast_mensal(p_inicio date, p_meses int)
returns table (
  mes date,
  ponderado numeric,
  em_aberto numeric,
  realizado numeric,
  propostas_abertas integer,
  compras integer
)
language sql
stable
security definer
set search_path = public
as $$
  with escopo as (
    select public.sou_gestao() as gestao, public.meu_vendedor_id() as vendedor_id
  ),
  meses as (
    select (date_trunc('month', coalesce(p_inicio, current_date))::date
            + make_interval(months => g))::date as mes
      from generate_series(0, greatest(least(coalesce(p_meses, 6), 36), 1) - 1) as g
  ),
  ultimas as (
    select distinct on (p.lead_id, p.lote_id)
           p.*, l.status_crm, l.vendedor_id
      from public.propostas p
      join public.leads l on l.id = p.lead_id
     where l.deletado_em is null
     order by p.lead_id, p.lote_id, p.versao desc
  ),
  abertas as (
    select greatest(
             date_trunc('month', coalesce(u.valida_ate, (u.criado_em + interval '30 days')::date)),
             date_trunc('month', current_date)
           )::date as mes,
           u.valor_total,
           u.valor_total * coalesce(fp.probabilidade, 0) as valor_ponderado
      from ultimas u
      cross join escopo e
      left join public.funil_probabilidades fp on fp.etapa = u.status_crm::text
     where u.status in ('rascunho', 'enviada')
       and (e.gestao or (e.vendedor_id is not null and u.vendedor_id = e.vendedor_id))
  ),
  vendas as (
    select date_trunc('month', coalesce(c.data_compra, c.created_at::date))::date as mes,
           coalesce(c.valor_total, 0) as valor_total
      from public.compras c
      join public.clientes cl on cl.id = c.cliente_id
      left join public.leads l on l.id = cl.lead_id
      cross join escopo e
     where c.status <> 'distratado'
       and (e.gestao or (e.vendedor_id is not null and l.vendedor_id = e.vendedor_id))
  )
  select m.mes,
         coalesce((select sum(a.valor_ponderado) from abertas a where a.mes = m.mes), 0)::numeric(14,2),
         coalesce((select sum(a.valor_total) from abertas a where a.mes = m.mes), 0)::numeric(14,2),
         coalesce((select sum(v.valor_total) from vendas v where v.mes = m.mes), 0)::numeric(14,2),
         (select count(*) from abertas a where a.mes = m.mes)::integer,
         (select count(*) from vendas v where v.mes = m.mes)::integer
    from meses m
   order by m.mes
$$;

revoke all on function public.forecast_mensal(date, int) from public, anon;
grant execute on function public.forecast_mensal(date, int) to authenticated;
