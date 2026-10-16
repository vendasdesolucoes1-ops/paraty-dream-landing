-- Telemetria das chamadas de IA (auditoria R-24, issue #42).
--
-- O `usage` da OpenAI era descartado: não havia como saber tokens, custo,
-- latência ou taxa de erro da Sophia. Uma linha por chamada.
create table if not exists public.ai_chamadas (
  id               bigint generated always as identity primary key,
  criado_em        timestamptz not null default now(),
  funcao           text not null,
  modelo           text not null,
  lead_id          uuid references public.leads(id) on delete set null,
  tokens_entrada   int,
  tokens_saida     int,
  custo_usd        numeric(12, 6),
  latencia_ms      int,
  erro             text,
  versao_prompt    text
);

create index if not exists ai_chamadas_criado_em_idx on public.ai_chamadas (criado_em desc);

alter table public.ai_chamadas enable row level security;
drop policy if exists "ai_chamadas_gestao" on public.ai_chamadas;
create policy "ai_chamadas_gestao" on public.ai_chamadas
  for select to authenticated using (public.sou_gestao());
grant select on public.ai_chamadas to authenticated;

-- Resumo diário para o painel e para o alerta de custo.
create or replace function public.ai_custo_diario(p_dias int default 30)
returns table (dia date, funcao text, chamadas bigint, erros bigint, custo_usd numeric, latencia_p50_ms numeric)
language sql
stable
security definer
set search_path = public
as $$
  select (criado_em at time zone 'America/Sao_Paulo')::date,
         funcao,
         count(*),
         count(*) filter (where erro is not null),
         round(coalesce(sum(custo_usd), 0), 4),
         percentile_cont(0.5) within group (order by latencia_ms)::numeric
    from public.ai_chamadas
   where public.sou_gestao() and criado_em > now() - make_interval(days => p_dias)
   group by 1, 2
   order by 1 desc, 2
$$;
revoke all on function public.ai_custo_diario(int) from public, anon;
grant execute on function public.ai_custo_diario(int) to authenticated;

-- Retenção: 1 ano.
create or replace function public.limpar_ai_chamadas()
returns void language sql security definer set search_path = public as $$
  delete from public.ai_chamadas where criado_em < now() - interval '1 year'
$$;
revoke all on function public.limpar_ai_chamadas() from public, anon, authenticated;
