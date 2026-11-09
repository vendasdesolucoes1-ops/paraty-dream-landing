-- Aviso por WhatsApp ao vendedor quando um lead é atribuído a ele.
--
-- O problema: a tela do rodízio promete que "o WhatsApp recebe o aviso de
-- cada lead novo", mas a única mensagem que saía do número da empresa para o
-- vendedor era o resumo da qualificação feita pela Sophia. Atribuição pelo
-- rodízio (WhatsApp, anúncio, Formulário Meta, site), pela distribuição da
-- espera ou manual no CRM só gerava a notificação do sino do painel — o
-- vendedor que não estava com o painel aberto não ficava sabendo do lead.
--
-- A correção: toda vez que leads.vendedor_id passa a apontar para alguém,
-- uma linha entra em avisos_vendedor. A Edge Function `avisar-vendedor`,
-- chamada pelo cron a cada minuto, envia o aviso pela instância da empresa e
-- registra no histórico do lead. Um gatilho só, no banco, cobre todos os
-- caminhos de atribuição (webhook, formulário, rodízio, distribuição, CRM).
--
-- Não duplica o resumo da Sophia: quando a própria qualificação atribui o
-- lead, o resumo sai na hora e o aviso, que espera 30 s, é cancelado ao ver
-- a interação 'qualificacao' (ver a função).

-- ---------------------------------------------------------------------------
-- 1. Fila de avisos
-- ---------------------------------------------------------------------------
create table if not exists public.avisos_vendedor (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  vendedor_id uuid not null references public.vendedores(id) on delete cascade,
  -- automatico: rodízio, distribuição ou outra rotina | manual: alguém do painel
  origem text not null default 'automatico' check (origem in ('automatico', 'manual')),
  status text not null default 'pendente'
    check (status in ('pendente', 'enviando', 'enviado', 'cancelado', 'erro')),
  tentativas integer not null default 0,
  erro text,
  -- 30 s de folga: a qualificação da Sophia atribui e manda o resumo logo em
  -- seguida; o aviso só sai se o resumo não tiver saído.
  agendado_para timestamptz not null default now() + interval '30 seconds',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  enviado_em timestamptz
);

comment on table public.avisos_vendedor is
  'Avisos por WhatsApp ao vendedor quando um lead é atribuído a ele. Enviados pela Edge Function avisar-vendedor.';

-- O mesmo lead não avisa o mesmo vendedor duas vezes.
create unique index if not exists avisos_vendedor_lead_vendedor_idx
  on public.avisos_vendedor (lead_id, vendedor_id)
  where status in ('pendente', 'enviando', 'enviado');
create index if not exists avisos_vendedor_fila_idx
  on public.avisos_vendedor (agendado_para) where status = 'pendente';

alter table public.avisos_vendedor enable row level security;
drop policy if exists avisos_vendedor_gestao_le on public.avisos_vendedor;
create policy avisos_vendedor_gestao_le on public.avisos_vendedor
  for select to authenticated using (public.sou_gestao());
revoke all on public.avisos_vendedor from anon;
grant select on public.avisos_vendedor to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Enfileirar
-- ---------------------------------------------------------------------------
create or replace function public.enfileirar_aviso_vendedor(
  p_lead_id uuid,
  p_vendedor_id uuid,
  p_origem text default 'automatico'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_vend record;
begin
  if p_lead_id is null or p_vendedor_id is null then
    return;
  end if;

  select is_teste, interno, deletado_em into v_lead from public.leads where id = p_lead_id;
  -- Lead de teste ou interno não acorda o vendedor de verdade.
  if not found or coalesce(v_lead.is_teste, false) or coalesce(v_lead.interno, false)
     or v_lead.deletado_em is not null then
    return;
  end if;

  select ativo, telefone, profile_id into v_vend from public.vendedores where id = p_vendedor_id;
  if not found or not v_vend.ativo or nullif(btrim(coalesce(v_vend.telefone, '')), '') is null then
    return;
  end if;

  -- Quem pegou o lead para si no painel não precisa ser avisado disso.
  if auth.uid() is not null and auth.uid() = v_vend.profile_id then
    return;
  end if;

  -- O lead mudou de dono antes do aviso sair: o anterior não é mais avisado.
  update public.avisos_vendedor
     set status = 'cancelado', erro = 'lead passou para outro vendedor', atualizado_em = now()
   where lead_id = p_lead_id and vendedor_id <> p_vendedor_id and status = 'pendente';

  insert into public.avisos_vendedor (lead_id, vendedor_id, origem)
  values (p_lead_id, p_vendedor_id,
          case when p_origem = 'manual' then 'manual' else 'automatico' end)
  on conflict (lead_id, vendedor_id) where status in ('pendente', 'enviando', 'enviado')
  do nothing;
end;
$$;

revoke all on function public.enfileirar_aviso_vendedor(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.enfileirar_aviso_vendedor(uuid, uuid, text) to service_role;

create or replace function public.leads_avisar_vendedor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.vendedor_id is null
     or (tg_op = 'UPDATE' and new.vendedor_id is not distinct from old.vendedor_id) then
    return null;
  end if;
  -- Avisar é importante, mas nunca pode impedir a atribuição.
  begin
    perform public.enfileirar_aviso_vendedor(
      new.id, new.vendedor_id,
      case when auth.uid() is not null then 'manual' else 'automatico' end);
  exception when others then
    raise warning 'aviso ao vendedor não enfileirado: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists leads_avisar_vendedor on public.leads;
create trigger leads_avisar_vendedor
  after insert or update of vendedor_id on public.leads
  for each row execute function public.leads_avisar_vendedor();

-- ---------------------------------------------------------------------------
-- 3. Reivindicar (a Edge Function chama a cada execução)
-- ---------------------------------------------------------------------------
create or replace function public.reivindicar_avisos_vendedor(p_limite integer default 20)
returns setof public.avisos_vendedor
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Aviso velho perdeu o sentido: o vendedor já viu o lead no painel.
  update public.avisos_vendedor
     set status = 'cancelado', erro = 'expirou na fila', atualizado_em = now()
   where status = 'pendente' and criado_em < now() - interval '24 hours';

  return query
  with candidatas as (
    select id
      from public.avisos_vendedor
     where (status = 'pendente' and agendado_para <= now())
        or (status = 'enviando' and atualizado_em < now() - interval '5 minutes')
     order by agendado_para
     limit p_limite
       for update skip locked
  )
  update public.avisos_vendedor a
     set status = 'enviando', atualizado_em = now()
    from candidatas c
   where a.id = c.id
  returning a.*;
end;
$$;

revoke all on function public.reivindicar_avisos_vendedor(integer) from public, anon, authenticated;
grant execute on function public.reivindicar_avisos_vendedor(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Cron: a cada minuto, só quando há aviso esperando
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'avisar-vendedores';
    perform cron.schedule(
      'avisar-vendedores',
      '* * * * *',
      $cron$
      select net.http_post(
        url     := 'https://mokgxoygbjvtketoyraf.supabase.co/functions/v1/avisar-vendedor',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', (
            select decrypted_secret from vault.decrypted_secrets
             where name = 'cron_fila_secret' limit 1
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      )
       where exists (select 1 from public.avisos_vendedor
                      where (status = 'pendente' and agendado_para <= now())
                         or (status = 'enviando' and atualizado_em < now() - interval '5 minutes'));
      $cron$
    );
  end if;
end;
$$;

notify pgrst, 'reload schema';
