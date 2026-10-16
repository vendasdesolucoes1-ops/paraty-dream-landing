-- Fila de mensagens: regras de envio centralizadas e garantias de entrega
-- (auditoria R-14, issue #37).
--
-- 1. `partes_enviadas`: o retry retoma da parte seguinte, nunca do zero.
-- 2. `chave_idempotencia`: o mesmo envio lógico nunca entra duas vezes.
-- 3. `feriados`: calendário mantido pela gestão.
-- 4. `pode_enviar()`: UMA função decide se um envio ativo pode sair agora.
--    Falha fechada. Chamada ao enfileirar e de novo antes de cada parte.
-- 5. `proximo_horario_util()`: para onde reagendar quando está fora da janela.
-- 6. `saude_fila()`: visão de saúde para admin/gestor.

alter table public.mensagens_agendadas
  add column if not exists partes_enviadas int not null default 0,
  add column if not exists chave_idempotencia text,
  add column if not exists instance_id uuid references public.whatsapp_instances(id);

create unique index if not exists mensagens_agendadas_chave_idx
  on public.mensagens_agendadas (chave_idempotencia)
  where chave_idempotencia is not null;

-- ---------------------------------------------------------------------------
-- Feriados
-- ---------------------------------------------------------------------------
create table if not exists public.feriados (
  data       date primary key,
  descricao  text not null
);

alter table public.feriados enable row level security;
drop policy if exists "feriados_select" on public.feriados;
create policy "feriados_select" on public.feriados for select to authenticated using (true);
drop policy if exists "feriados_write_gestao" on public.feriados;
create policy "feriados_write_gestao" on public.feriados
  for all to authenticated using (public.sou_gestao()) with check (public.sou_gestao());
grant select, insert, update, delete on public.feriados to authenticated;

-- Feriados nacionais fixos de 2026 e 2027 (os móveis e municipais a gestão
-- cadastra no painel ou por SQL).
insert into public.feriados (data, descricao) values
  ('2026-11-02', 'Finados'),
  ('2026-11-15', 'Proclamação da República'),
  ('2026-11-20', 'Dia da Consciência Negra'),
  ('2026-12-25', 'Natal'),
  ('2027-01-01', 'Confraternização Universal'),
  ('2027-04-21', 'Tiradentes'),
  ('2027-05-01', 'Dia do Trabalho'),
  ('2027-09-07', 'Independência'),
  ('2027-10-12', 'Nossa Senhora Aparecida'),
  ('2027-11-02', 'Finados'),
  ('2027-11-15', 'Proclamação da República'),
  ('2027-11-20', 'Dia da Consciência Negra'),
  ('2027-12-25', 'Natal')
on conflict (data) do nothing;

-- ---------------------------------------------------------------------------
-- Janela de envio
-- ---------------------------------------------------------------------------
-- 9h às 20h no horário de Brasília, sem domingos nem feriados.
create or replace function public.dentro_da_janela(p_agora timestamptz default now())
returns boolean
language sql
stable
set search_path = public
as $$
  with local as (select p_agora at time zone 'America/Sao_Paulo' as t)
  select extract(isodow from t) <> 7
     and t::time >= time '09:00'
     and t::time <  time '20:00'
     and not exists (select 1 from public.feriados f where f.data = t::date)
    from local
$$;

-- Próximo instante dentro da janela (hoje às 9h, ou o próximo dia útil).
create or replace function public.proximo_horario_util(p_agora timestamptz default now())
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_local timestamp := p_agora at time zone 'America/Sao_Paulo';
  v_dia   date := v_local::date;
  i       int;
begin
  if public.dentro_da_janela(p_agora) then
    return p_agora;
  end if;
  -- Hoje ainda antes das 9h? Senão começa amanhã.
  if v_local::time >= time '09:00' then
    v_dia := v_dia + 1;
  end if;
  for i in 0..14 loop
    if extract(isodow from v_dia) <> 7
       and not exists (select 1 from public.feriados f where f.data = v_dia) then
      -- Minutos aleatórios no começo da janela: não sai tudo às 9h00 em ponto.
      return ((v_dia + time '09:00') + make_interval(mins => floor(random() * 40)::int))
             at time zone 'America/Sao_Paulo';
    end if;
    v_dia := v_dia + 1;
  end loop;
  return p_agora + interval '1 day';
end;
$$;

-- ---------------------------------------------------------------------------
-- pode_enviar
-- ---------------------------------------------------------------------------
-- Devolve (ok, motivo). `motivo` explica a recusa para o log e a tela de saúde:
--   'lead_inexistente' · 'opt_out' · 'sem_interesse' · 'sem_base_legal'
--   'takeover' · 'convertido' · 'lead_escreveu' · 'fora_da_janela'
-- Para 'primeiro_contato' a base legal é o próprio formulário (consentimento
-- gravado no envio) e a regra de "lead escreveu" é a da própria abordagem.
create or replace function public.pode_enviar(
  p_lead_id uuid,
  p_tipo text default 'primeiro_contato',
  p_agora timestamptz default now()
)
returns table (ok boolean, motivo text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_chave text;
begin
  select id, telefone, status_crm, contato_bloqueado, sem_interesse_em
    into v_lead
    from public.leads
   where id = p_lead_id;

  if not found then
    return query select false, 'lead_inexistente'; return;
  end if;
  if coalesce(v_lead.contato_bloqueado, false) then
    return query select false, 'opt_out'; return;
  end if;
  if v_lead.sem_interesse_em is not null then
    return query select false, 'sem_interesse'; return;
  end if;
  if v_lead.status_crm = 'fechado' then
    return query select false, 'convertido'; return;
  end if;

  v_chave := public.telefone_chave(v_lead.telefone);

  -- Atendimento humano em aberto nesta conversa: a máquina não fala por cima.
  if exists (
    select 1
      from public.ai_agent_human_takeover t
      join public.ai_agent_conversations c on c.id = t.conversation_id
     where t.resolved_at is null
       and public.telefone_chave(c.session_id) = v_chave
  ) then
    return query select false, 'takeover'; return;
  end if;

  -- Fora do primeiro contato, só fala com quem deu base para o contato:
  -- consentimento registrado ou conversa iniciada pelo próprio lead.
  if p_tipo <> 'primeiro_contato' and not (
    exists (select 1 from public.consentimentos k where k.lead_id = p_lead_id)
    or exists (
      select 1 from public.whatsapp_messages w
       where w.lead_id = p_lead_id and w.from_me = false
    )
  ) then
    return query select false, 'sem_base_legal'; return;
  end if;

  if not public.dentro_da_janela(p_agora) then
    return query select false, 'fora_da_janela'; return;
  end if;

  return query select true, null::text;
end;
$$;

revoke all on function public.pode_enviar(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.pode_enviar(uuid, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Saúde da fila (admin/gestor)
-- ---------------------------------------------------------------------------
create or replace function public.saude_fila()
returns table (
  pendentes_vencidas  bigint,
  mais_antiga_min     numeric,
  erros_24h           bigint,
  enviadas_24h        bigint,
  ultima_execucao     timestamptz,
  ultima_execucao_ok  boolean
)
language plpgsql
stable
security definer
set search_path = public, cron
as $$
begin
  if not public.sou_gestao() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return query
  select
    (select count(*) from public.mensagens_agendadas
      where status = 'pendente' and agendado_para <= now()),
    (select round(extract(epoch from now() - min(agendado_para)) / 60, 1)
       from public.mensagens_agendadas
      where status = 'pendente' and agendado_para <= now()),
    (select count(*) from public.mensagens_agendadas
      where status = 'erro' and atualizado_em > now() - interval '24 hours'),
    (select count(*) from public.mensagens_agendadas
      where status = 'enviado' and enviado_em > now() - interval '24 hours'),
    (select max(d.start_time) from cron.job_run_details d
       join cron.job j on j.jobid = d.jobid
      where j.jobname = 'processar-mensagens-agendadas'),
    (select d.status = 'succeeded' from cron.job_run_details d
       join cron.job j on j.jobid = d.jobid
      where j.jobname = 'processar-mensagens-agendadas'
      order by d.start_time desc limit 1);
end;
$$;

revoke all on function public.saude_fila() from public, anon;
grant execute on function public.saude_fila() to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Respostas da Sophia pela fila (auditoria R-07, issue #36)
-- ---------------------------------------------------------------------------
-- Cada mensagem recebida (re)agenda UMA linha 'resposta_ia' por lead. O prazo
-- de 3 min é a rede de segurança: o webhook normalmente responde em ~30 s e
-- marca a linha; se o isolate morrer no caminho, o cron responde.
create or replace function public.enfileirar_resposta_ia(
  p_lead_id uuid,
  p_telefone text,
  p_instance_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.mensagens_agendadas (lead_id, tipo, telefone, partes, agendado_para, instance_id)
  values (p_lead_id, 'resposta_ia', p_telefone, '[]'::jsonb, now() + interval '3 minutes', p_instance_id)
  on conflict (lead_id, tipo) where status in ('pendente', 'enviando')
  do update set
    agendado_para = greatest(public.mensagens_agendadas.agendado_para, excluded.agendado_para),
    atualizado_em = now()
$$;

revoke all on function public.enfileirar_resposta_ia(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.enfileirar_resposta_ia(uuid, text, uuid) to service_role;

notify pgrst, 'reload schema';
