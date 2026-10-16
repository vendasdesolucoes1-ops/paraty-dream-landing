-- Tarefas com vencimento e SLA de atendimento por lead (issue #57).
--
-- 1. `tarefas`: o que alguém precisa fazer por um lead e até quando ("ligar
--    amanhã às 10h", "mandar a planta do lote 12"). Gestão vê e edita todas;
--    vendedor, as dos leads da própria carteira (pode_ver_lead).
-- 2. Handoff → tarefa: quando a conversa passa para atendimento humano
--    (linha nova em ai_agent_human_takeover), nasce uma tarefa "Retornar ao
--    lead" para o vendedor da carteira, vencendo em 15 min úteis. Assim o
--    lead que pediu um humano não fica esperando sem dono.
-- 3. SLA: quanto o lead esperou pela primeira resposta e há quanto tempo está
--    esperando agora, contado só no horário comercial.
--
-- Idempotente: pode rodar de novo sem erro.

-- ---------------------------------------------------------------------------
-- Tabela
-- ---------------------------------------------------------------------------
create table if not exists public.tarefas (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references public.leads(id) on delete cascade,
  -- Quem vai fazer. Nulo = qualquer um que atenda o lead (cai na lista do
  -- vendedor da carteira).
  responsavel_id uuid references public.profiles(id) on delete set null,
  tipo           text not null default 'retorno'
                 check (tipo in ('retorno', 'ligacao', 'whatsapp', 'visita', 'documento', 'outro')),
  titulo         text not null check (length(btrim(titulo)) between 1 and 200),
  vence_em       timestamptz not null,
  concluida_em   timestamptz,
  -- 'manual' (criada no painel) ou 'handoff' (criada pelo gatilho abaixo).
  origem         text not null default 'manual',
  criado_por     uuid references public.profiles(id) on delete set null default auth.uid(),
  criado_em      timestamptz not null default now()
);

-- Ficha do lead: tarefas do lead em ordem de vencimento.
create index if not exists tarefas_lead_vence_idx on public.tarefas (lead_id, vence_em);
-- "Minhas tarefas de hoje": abertas por responsável.
create index if not exists tarefas_responsavel_abertas_idx
  on public.tarefas (responsavel_id, vence_em) where concluida_em is null;
-- Visão geral de atrasadas (gestão).
create index if not exists tarefas_abertas_vence_idx
  on public.tarefas (vence_em) where concluida_em is null;

alter table public.tarefas enable row level security;

drop policy if exists "tarefas_select_por_lead" on public.tarefas;
create policy "tarefas_select_por_lead" on public.tarefas
  for select to authenticated
  using (public.pode_ver_lead(lead_id));

-- Ninguém cria tarefa em nome de outro autor (criado_por), salvo a gestão.
drop policy if exists "tarefas_insert_por_lead" on public.tarefas;
create policy "tarefas_insert_por_lead" on public.tarefas
  for insert to authenticated
  with check (
    public.pode_ver_lead(lead_id)
    and (public.sou_gestao() or criado_por is null or criado_por = auth.uid())
  );

drop policy if exists "tarefas_update_por_lead" on public.tarefas;
create policy "tarefas_update_por_lead" on public.tarefas
  for update to authenticated
  using (public.pode_ver_lead(lead_id))
  with check (public.pode_ver_lead(lead_id));

-- Apagar: a gestão, ou quem criou a tarefa (corrigir um engano).
drop policy if exists "tarefas_delete" on public.tarefas;
create policy "tarefas_delete" on public.tarefas
  for delete to authenticated
  using (
    public.pode_ver_lead(lead_id)
    and (public.sou_gestao() or criado_por = auth.uid())
  );

drop policy if exists "service_role_all_tarefas" on public.tarefas;
create policy "service_role_all_tarefas" on public.tarefas
  for all to service_role using (true) with check (true);

grant select, insert, update, delete on public.tarefas to authenticated;
grant all on public.tarefas to service_role;

-- ---------------------------------------------------------------------------
-- Metas de SLA (fonte única; o painel espelha em src/lib/tarefas.ts)
-- ---------------------------------------------------------------------------
-- Horário comercial = a mesma janela de envio da fila (dentro_da_janela):
-- 9h às 20h de Brasília, segunda a sábado, sem feriados. Mensagem que chega
-- às 22h começa a contar às 9h do dia útil seguinte.
--   primeira_resposta_min → a primeira mensagem do lead deve ser respondida
--                           (pela Sophia ou por uma pessoa) em até 15 min úteis.
--   sem_resposta_min      → mensagem do lead parada sem resposta por mais de
--                           30 min úteis estoura o SLA.
--   retorno_handoff_min   → prazo da tarefa "Retornar ao lead" aberta no handoff.
create or replace function public.sla_metas()
returns table (primeira_resposta_min int, sem_resposta_min int, retorno_handoff_min int)
language sql
immutable
as $$
  select 15, 30, 15
$$;

grant execute on function public.sla_metas() to authenticated, service_role;

-- Minutos de horário comercial entre dois instantes (mesma janela acima).
create or replace function public.minutos_uteis(p_inicio timestamptz, p_fim timestamptz)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(
           greatest(0, extract(epoch from (
             least(p_fim, (g.dia::date + time '20:00') at time zone 'America/Sao_Paulo')
             - greatest(p_inicio, (g.dia::date + time '09:00') at time zone 'America/Sao_Paulo')
           )) / 60)
         ), 0)::numeric(12, 1)
    from generate_series(
           (p_inicio at time zone 'America/Sao_Paulo')::date,
           (p_fim at time zone 'America/Sao_Paulo')::date,
           interval '1 day'
         ) as g(dia)
   where p_inicio is not null
     and p_fim > p_inicio
     and extract(isodow from g.dia) <> 7
     and not exists (select 1 from public.feriados f where f.data = g.dia::date)
$$;

grant execute on function public.minutos_uteis(timestamptz, timestamptz) to authenticated, service_role;

-- Prazo útil: `p_minutos` de horário comercial a partir de agora (ou do
-- próximo início de expediente, se agora estiver fora dele).
create or replace function public.prazo_util(p_minutos int, p_agora timestamptz default now())
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_inicio timestamptz := p_agora;
  v_local  timestamp;
  v_fim    timestamptz;
begin
  if not public.dentro_da_janela(p_agora) then
    -- proximo_horario_util sorteia uns minutos depois das 9h; aqui o prazo
    -- precisa ser determinístico, então volta para as 9h em ponto.
    v_local := public.proximo_horario_util(p_agora) at time zone 'America/Sao_Paulo';
    v_inicio := (v_local::date + time '09:00') at time zone 'America/Sao_Paulo';
  end if;
  v_local := v_inicio at time zone 'America/Sao_Paulo';
  v_fim := (v_local::date + time '20:00') at time zone 'America/Sao_Paulo';
  -- Cabe no expediente de hoje? Senão, o que sobra passa para o próximo dia útil.
  if v_inicio + make_interval(mins => p_minutos) <= v_fim then
    return v_inicio + make_interval(mins => p_minutos);
  end if;
  return public.prazo_util(
    p_minutos - floor(extract(epoch from (v_fim - v_inicio)) / 60)::int,
    v_fim
  );
end;
$$;

grant execute on function public.prazo_util(int, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Handoff humano → tarefa "Retornar ao lead"
-- ---------------------------------------------------------------------------
-- Disparado a cada takeover aberto. Acha o lead pela chave do telefone da
-- conversa (mesmo critério de takeovers_abertos), dá a tarefa ao usuário do
-- vendedor da carteira e não duplica: se já há uma tarefa de handoff aberta
-- para o lead, não cria outra. Qualquer falha aqui vira só um aviso no log —
-- o takeover (que pausa a IA) nunca pode deixar de ser gravado por causa
-- da tarefa.
create or replace function public.tarefa_ao_abrir_handoff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead        public.leads%rowtype;
  v_responsavel uuid;
begin
  if new.resolved_at is not null then
    return new;
  end if;

  begin
    select l.* into v_lead
      from public.ai_agent_conversations c
      join public.leads l
        on l.telefone is not null
       and l.telefone_chave = public.telefone_chave(c.session_id)
     where c.id = new.conversation_id
       and l.deletado_em is null
     order by l.created_at desc
     limit 1;

    if not found then
      return new;
    end if;

    if exists (
      select 1 from public.tarefas t
       where t.lead_id = v_lead.id and t.origem = 'handoff' and t.concluida_em is null
    ) then
      return new;
    end if;

    select p.id into v_responsavel
      from public.profiles p
     where v_lead.vendedor_id is not null
       and p.vendedor_id = v_lead.vendedor_id
       and p.ativo and p.deletado_em is null
     order by p.created_at nulls last
     limit 1;

    insert into public.tarefas (lead_id, responsavel_id, tipo, titulo, vence_em, origem, criado_por)
    values (
      v_lead.id,
      v_responsavel,
      'retorno',
      'Retornar ao lead',
      public.prazo_util((select retorno_handoff_min from public.sla_metas()), new.human_takeover_at),
      'handoff',
      null
    );
  exception when others then
    raise warning 'tarefa_ao_abrir_handoff: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.tarefa_ao_abrir_handoff() from public, anon, authenticated;

drop trigger if exists tarefa_ao_abrir_handoff on public.ai_agent_human_takeover;
create trigger tarefa_ao_abrir_handoff
  after insert on public.ai_agent_human_takeover
  for each row execute function public.tarefa_ao_abrir_handoff();

-- ---------------------------------------------------------------------------
-- SLA por lead
-- ---------------------------------------------------------------------------
-- Uma linha por lead que escreveu no WhatsApp nos últimos `p_dias` dias (ou
-- está esperando resposta). "Resposta" é qualquer mensagem nossa (from_me),
-- da Sophia ou de uma pessoa: para o lead o que conta é não ficar no vácuo.
-- Mensagens nossas anteriores à primeira do lead (disparo, primeiro contato)
-- não contam como resposta.
--
--   primeira_entrada_em     primeira mensagem do lead
--   primeira_resposta_em    primeira mensagem nossa depois dela (null = nunca)
--   primeira_resposta_min   minutos úteis até ela; se ainda não houve, o tempo
--                           útil decorrido até agora
--   ultima_entrada_em       última mensagem do lead
--   aguardando_desde        mensagem do lead mais antiga ainda sem resposta
--                           (null = nada pendente). Só para leads em aberto:
--                           fechado, perdido, sem interesse e bloqueado não
--                           cobram resposta.
--   aguardando_min          minutos úteis desde aguardando_desde
--
-- Recorte por papel dentro da função (SECURITY DEFINER, como
-- takeovers_abertos): gestão vê todos; vendedor, só a carteira. `p_lead_id`
-- restringe a um lead (ficha).
create or replace function public.sla_leads(p_dias int default 30, p_lead_id uuid default null)
returns table (
  lead_id                     uuid,
  lead_nome                   text,
  vendedor_id                 uuid,
  vendedor_nome               text,
  primeira_entrada_em         timestamptz,
  primeira_resposta_em        timestamptz,
  primeira_resposta_min       numeric,
  primeira_resposta_estourada boolean,
  ultima_entrada_em           timestamptz,
  aguardando_desde            timestamptz,
  aguardando_min              numeric,
  aguardando_estourado        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with metas as (select * from public.sla_metas()),
  base as (
    select l.id, l.nome, l.vendedor_id, l.status_crm, l.sem_interesse_em, l.contato_bloqueado
      from public.leads l
     where l.deletado_em is null
       and not coalesce(l.is_teste, false)
       and (p_lead_id is null or l.id = p_lead_id)
       and (public.sou_gestao() or l.vendedor_id = public.meu_vendedor_id())
  ),
  marcos as (
    select b.*,
           e.primeira_entrada_em,
           e.ultima_entrada_em,
           (select max(m.created_at) from public.whatsapp_messages m
             where m.lead_id = b.id and m.from_me) as ultima_saida_em
      from base b
      cross join lateral (
        select min(m.created_at) as primeira_entrada_em,
               max(m.created_at) as ultima_entrada_em
          from public.whatsapp_messages m
         where m.lead_id = b.id and not m.from_me
      ) e
     where e.primeira_entrada_em is not null
  ),
  medidas as (
    select mc.*,
           (select min(m.created_at) from public.whatsapp_messages m
             where m.lead_id = mc.id and m.from_me
               and m.created_at >= mc.primeira_entrada_em) as primeira_resposta_em,
           case
             when mc.status_crm in ('fechado', 'perdido')
               or mc.sem_interesse_em is not null
               or coalesce(mc.contato_bloqueado, false)
             then null
             else (select min(m.created_at) from public.whatsapp_messages m
                    where m.lead_id = mc.id and not m.from_me
                      and m.created_at > coalesce(mc.ultima_saida_em, '-infinity'::timestamptz))
           end as aguardando_desde
      from marcos mc
  ),
  tempos as (
    select md.*,
           public.minutos_uteis(md.primeira_entrada_em, coalesce(md.primeira_resposta_em, now()))
             as primeira_min,
           public.minutos_uteis(md.aguardando_desde, now()) as aguardando_min_calc
      from medidas md
     where md.ultima_entrada_em >= now() - make_interval(days => greatest(p_dias, 1))
        or md.aguardando_desde is not null
  )
  select t.id,
         t.nome,
         t.vendedor_id,
         v.nome,
         t.primeira_entrada_em,
         t.primeira_resposta_em,
         t.primeira_min,
         t.primeira_min > metas.primeira_resposta_min,
         t.ultima_entrada_em,
         t.aguardando_desde,
         case when t.aguardando_desde is null then null else t.aguardando_min_calc end,
         t.aguardando_desde is not null and t.aguardando_min_calc > metas.sem_resposta_min
    from tempos t
    cross join metas
    left join public.vendedores v on v.id = t.vendedor_id
$$;

revoke all on function public.sla_leads(int, uuid) from public, anon;
grant execute on function public.sla_leads(int, uuid) to authenticated;

-- Consolidado por vendedor para o Início da gestão. Herda o recorte de
-- sla_leads (vendedor só enxerga a própria linha).
create or replace function public.sla_por_vendedor(p_dias int default 30)
returns table (
  vendedor_id                  uuid,
  vendedor_nome                text,
  leads_medidos                int,
  primeira_resposta_estourada  int,
  aguardando                   int,
  aguardando_estourado         int,
  mediana_primeira_resposta_min numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select s.vendedor_id,
         coalesce(max(s.vendedor_nome), 'Sem vendedor'),
         count(*)::int,
         count(*) filter (where s.primeira_resposta_estourada)::int,
         count(*) filter (where s.aguardando_desde is not null)::int,
         count(*) filter (where s.aguardando_estourado)::int,
         (percentile_cont(0.5) within group (order by s.primeira_resposta_min)
            filter (where s.primeira_resposta_em is not null))::numeric(12, 1)
    from public.sla_leads(p_dias) s
   group by s.vendedor_id
   order by count(*) filter (where s.aguardando_estourado) desc,
            count(*) filter (where s.primeira_resposta_estourada) desc,
            2
$$;

revoke all on function public.sla_por_vendedor(int) from public, anon;
grant execute on function public.sla_por_vendedor(int) to authenticated;

notify pgrst, 'reload schema';
