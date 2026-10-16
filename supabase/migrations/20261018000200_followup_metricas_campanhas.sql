-- Métricas de follow-up, saúde da fila com alerta externo (issue #53) e
-- campanhas executadas pelo worker em vez do navegador (issue #54).

-- ---------------------------------------------------------------------------
-- Mídia nas etapas (campanha com imagem, vídeo, documento ou áudio)
-- ---------------------------------------------------------------------------
-- {"url": "...", "tipo": "image|video|document|audio", "nome": "arquivo.pdf"}
alter table public.cadencia_etapas add column if not exists midia jsonb;
alter table public.mensagens_agendadas add column if not exists midia jsonb;

-- Etapa só com mídia é válida: o template pode ficar vazio.
alter table public.cadencia_etapas drop constraint if exists cadencia_etapas_template_check;
alter table public.cadencia_etapas add constraint cadencia_etapas_conteudo_check
  check (length(trim(template)) > 0 or midia is not null);

-- agendar_etapas passa a copiar a mídia e aceita etapa só com mídia.
create or replace function public.agendar_etapas(p_limite int default 500)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regras public.regras_envio;
  r        record;
  v_etapa  public.cadencia_etapas;
  v_prox   record;
  v_partes jsonb;
  v_msg    uuid;
  v_total  int := 0;
begin
  select * into v_regras from public.regras_envio where id;

  update public.mensagens_agendadas m
     set status = 'cancelado', erro = 'visita já passou', atualizado_em = now()
    from public.inscricoes i join public.visitas v on v.id = i.visita_id
   where m.inscricao_id = i.id
     and m.status in ('pendente', 'aguardando_aprovacao')
     and v.data_hora <= now();

  for r in
    select i.*, c.gatilho, c.instance_id as cadencia_instancia
      from public.inscricoes i
      join public.cadencias c on c.id = i.cadencia_id
     where i.status = 'ativa'
       and i.proxima_em <= now()
       and c.ativa and c.pausada_em is null
     order by i.proxima_em
     limit p_limite
       for update of i skip locked
  loop
    if exists (select 1 from public.mensagens_agendadas
                where inscricao_id = r.id and status in ('pendente', 'enviando', 'aguardando_aprovacao')) then
      update public.inscricoes set proxima_em = null where id = r.id;
      continue;
    end if;

    select * into v_prox from public.proxima_etapa(r.id, r.etapa_atual);
    if v_prox.ordem is null then
      perform public.mudar_inscricao(r.id,
        case when r.gatilho in ('visita_agendada', 'campanha') then 'concluida' else 'sem_resposta' end,
        'fim das etapas');
      continue;
    end if;

    if r.gatilho not in ('visita_agendada', 'campanha')
       and r.tentativas_sem_resposta >= v_regras.max_tentativas_sem_resposta then
      perform public.registrar_evento_envio(r.id, 'bloqueado', 'limite_tentativas_sem_resposta', v_prox.ordem);
      perform public.mudar_inscricao(r.id, 'sem_resposta', 'limite de tentativas sem resposta');
      continue;
    end if;

    if v_prox.vence_em > now() then
      update public.inscricoes set proxima_em = v_prox.vence_em where id = r.id;
      continue;
    end if;

    select * into v_etapa from public.cadencia_etapas
     where cadencia_id = r.cadencia_id and ordem = v_prox.ordem;
    v_partes := public.renderizar_template(v_etapa.template, r.lead_id, r.visita_id);

    if (jsonb_array_length(v_partes) = 0 and v_etapa.midia is null)
       or not exists (select 1 from public.leads where id = r.lead_id and nullif(telefone, '') is not null) then
      perform public.registrar_evento_envio(r.id, 'bloqueado', 'sem_telefone_ou_texto', v_prox.ordem);
      perform public.mudar_inscricao(r.id, 'falhou', 'lead sem telefone ou etapa sem conteúdo');
      continue;
    end if;

    v_msg := null;
    insert into public.mensagens_agendadas (
      lead_id, tipo, telefone, partes, midia, agendado_para, status,
      instance_id, inscricao_id, etapa_ordem, chave_idempotencia
    )
    select r.lead_id,
           case when r.gatilho = 'campanha' then 'campanha' else 'cadencia' end,
           l.telefone, v_partes, v_etapa.midia, now(),
           case when v_etapa.modo = 'ia_aprovacao' then 'aguardando_aprovacao' else 'pendente' end,
           r.cadencia_instancia, r.id, v_prox.ordem,
           'cadencia:' || r.id || ':' || v_prox.ordem
      from public.leads l where l.id = r.lead_id
    on conflict do nothing
    returning id into v_msg;

    if v_msg is null then
      update public.inscricoes set proxima_em = now() + interval '15 minutes' where id = r.id;
      continue;
    end if;

    update public.inscricoes set proxima_em = null, atualizado_em = now() where id = r.id;
    perform public.registrar_evento_envio(r.id,
      case when v_etapa.modo = 'ia_aprovacao' then 'aguardando_aprovacao' else 'enfileirado' end,
      null, v_prox.ordem, v_msg);
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;

revoke all on function public.agendar_etapas(int) from public, anon, authenticated;
grant execute on function public.agendar_etapas(int) to service_role;

-- Campanha termina como "concluída" depois do único envio (não espera 3 dias).
create or replace function public.campanha_concluir_apos_envio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo = 'campanha' and new.status = 'enviado' and old.status is distinct from 'enviado'
     and new.inscricao_id is not null then
    perform public.mudar_inscricao(new.inscricao_id, 'concluida', 'campanha enviada');
  end if;
  return new;
end;
$$;

-- Nome começa com "z" para rodar depois de mensagens_agendadas_desfecho.
drop trigger if exists z_campanha_concluir on public.mensagens_agendadas;
create trigger z_campanha_concluir
  after update of status on public.mensagens_agendadas
  for each row execute function public.campanha_concluir_apos_envio();

-- ---------------------------------------------------------------------------
-- Campanhas (issue #54): uma cadência de uma etapa, executada pelo worker
-- ---------------------------------------------------------------------------
create or replace function public.criar_campanha(
  p_nome text,
  p_template text,
  p_lead_ids uuid[],
  p_instance_id uuid default null,
  p_midia jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cad  uuid;
  v_lead uuid;
begin
  if not public.sou_gestao() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_lead_ids, 1), 0) = 0 then
    raise exception 'Selecione ao menos um lead.' using errcode = '22023';
  end if;
  if array_length(p_lead_ids, 1) > 20000 then
    raise exception 'Campanha limitada a 20.000 leads.' using errcode = '22023';
  end if;
  if coalesce(trim(p_template), '') = '' and p_midia is null then
    raise exception 'Mensagem e mídia vazias.' using errcode = '22023';
  end if;
  if p_midia is not null and (p_midia->>'url' is null
     or coalesce(p_midia->>'tipo', '') not in ('image', 'video', 'document', 'audio')) then
    raise exception 'Mídia inválida.' using errcode = '22023';
  end if;

  insert into public.cadencias (nome, gatilho, ativa, pausa_ao_responder, instance_id)
  values (p_nome, 'campanha', true, false, p_instance_id)
  returning id into v_cad;
  insert into public.cadencia_etapas (cadencia_id, ordem, referencia, deslocamento, template, midia)
  values (v_cad, 1, 'inscricao', interval '0', coalesce(p_template, ''), p_midia);

  foreach v_lead in array p_lead_ids loop
    perform public._inscrever(v_cad, v_lead);
  end loop;
  return v_cad;
end;
$$;

create or replace function public.cancelar_campanha(p_cadencia_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  if not public.sou_gestao() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  update public.cadencias set ativa = false, atualizado_em = now()
   where id = p_cadencia_id and gatilho = 'campanha';
  for r in select id from public.inscricoes
            where cadencia_id = p_cadencia_id and status in ('ativa', 'pausada') loop
    perform public.mudar_inscricao(r.id, 'cancelada', 'campanha cancelada');
  end loop;
end;
$$;

-- Progresso de uma campanha (ou de qualquer cadência).
create or replace function public.progresso_cadencia(p_cadencia_id uuid)
returns table (
  total bigint, aguardando bigint, na_fila bigint, enviados bigint,
  pulados bigint, erros bigint, concluidos bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.sou_gestao() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return query
  select count(*),
         count(*) filter (where i.status = 'ativa' and not exists (
           select 1 from public.mensagens_agendadas m
            where m.inscricao_id = i.id and m.status in ('pendente', 'enviando', 'aguardando_aprovacao'))),
         count(*) filter (where exists (
           select 1 from public.mensagens_agendadas m
            where m.inscricao_id = i.id and m.status in ('pendente', 'enviando', 'aguardando_aprovacao'))),
         count(*) filter (where exists (
           select 1 from public.mensagens_agendadas m where m.inscricao_id = i.id and m.status = 'enviado')),
         count(*) filter (where i.status in ('cancelada', 'convertida', 'sem_resposta')),
         count(*) filter (where i.status = 'falhou'),
         count(*) filter (where i.status = 'concluida')
    from public.inscricoes i
   where i.cadencia_id = p_cadencia_id;
end;
$$;

-- Pulados e erros com o motivo, para a tela de acompanhamento.
create or replace function public.motivos_cadencia(p_cadencia_id uuid)
returns table (motivo text, quantidade bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.sou_gestao() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return query
  select coalesce(i.motivo_saida, 'sem motivo'), count(*)
    from public.inscricoes i
   where i.cadencia_id = p_cadencia_id
     and i.status in ('cancelada', 'convertida', 'sem_resposta', 'falhou')
   group by 1
   order by 2 desc;
end;
$$;

revoke all on function public.criar_campanha(text, text, uuid[], uuid, jsonb) from public, anon;
revoke all on function public.cancelar_campanha(uuid) from public, anon;
revoke all on function public.progresso_cadencia(uuid) from public, anon;
revoke all on function public.motivos_cadencia(uuid) from public, anon;
grant execute on function public.criar_campanha(text, text, uuid[], uuid, jsonb) to authenticated;
grant execute on function public.cancelar_campanha(uuid) to authenticated;
grant execute on function public.progresso_cadencia(uuid) to authenticated;
grant execute on function public.motivos_cadencia(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Métricas de follow-up por cadência e etapa (issue #53)
-- ---------------------------------------------------------------------------
-- entregues/lidos vêm dos acks da Evolution nas mensagens ligadas ao item da
-- fila; respondidos = lead escreveu até 72h depois do envio daquela etapa.
create or replace view public.vw_followup_metricas
with (security_invoker = true) as
with envios as (
  select m.id, i.cadencia_id, m.etapa_ordem, m.lead_id, m.enviado_em
    from public.mensagens_agendadas m
    join public.inscricoes i on i.id = m.inscricao_id
   where m.status = 'enviado'
),
acks as (
  select w.mensagem_agendada_id,
         bool_or(w.status in ('delivered', 'read')) as entregue,
         bool_or(w.status = 'read') as lido
    from public.whatsapp_messages w
   where w.mensagem_agendada_id is not null
   group by 1
)
select c.id as cadencia_id,
       c.nome as cadencia,
       c.gatilho,
       e.etapa_ordem,
       count(*) as enviados,
       count(*) filter (where a.entregue) as entregues,
       count(*) filter (where a.lido) as lidos,
       count(*) filter (where exists (
         select 1 from public.whatsapp_messages r
          where r.lead_id = e.lead_id and not r.from_me
            and r.created_at >= e.enviado_em and r.created_at <= e.enviado_em + interval '72 hours'
       )) as respondidos_72h,
       (select count(*) from public.envios_eventos o
         where o.cadencia_id = c.id and o.etapa_ordem = e.etapa_ordem and o.evento = 'opt_out') as opt_outs
  from envios e
  join public.cadencias c on c.id = e.cadencia_id
  left join acks a on a.mensagem_agendada_id = e.id
 group by c.id, c.nome, c.gatilho, e.etapa_ordem;

-- A visão passa pela RLS de quem consulta (security_invoker); mensagens_agendadas
-- não tem policy, então a leitura é pela função abaixo, só para gestão.
create or replace function public.followup_metricas()
returns setof public.vw_followup_metricas
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.sou_gestao() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return query select * from public.vw_followup_metricas order by cadencia, etapa_ordem;
end;
$$;
revoke all on public.vw_followup_metricas from public, anon, authenticated;
revoke all on function public.followup_metricas() from public, anon;
grant execute on function public.followup_metricas() to authenticated;

-- ---------------------------------------------------------------------------
-- Saúde da fila: inclui as cadências e o cron que as agenda
-- ---------------------------------------------------------------------------
create or replace view public.vw_saude_fila as
select
  (select count(*) from public.mensagens_agendadas
    where status = 'pendente' and agendado_para <= now()) as pendentes_vencidas,
  (select round(extract(epoch from now() - min(agendado_para)) / 60, 1)
     from public.mensagens_agendadas
    where status = 'pendente' and agendado_para <= now()) as mais_antiga_min,
  (select count(*) from public.mensagens_agendadas
    where status = 'erro' and atualizado_em > now() - interval '24 hours') as erros_24h,
  (select count(*) from public.mensagens_agendadas
    where status = 'enviado' and enviado_em > now() - interval '24 hours') as enviadas_24h,
  (select count(*) from public.mensagens_agendadas where status = 'aguardando_aprovacao') as aguardando_aprovacao,
  (select count(*) from public.inscricoes
    where status = 'ativa' and proxima_em < now() - interval '10 minutes') as inscricoes_atrasadas,
  (select max(d.start_time) from cron.job_run_details d join cron.job j on j.jobid = d.jobid
    where j.jobname = 'processar-mensagens-agendadas') as ultima_execucao_fila,
  (select d.status = 'succeeded' from cron.job_run_details d join cron.job j on j.jobid = d.jobid
    where j.jobname = 'processar-mensagens-agendadas' order by d.start_time desc limit 1) as ultima_execucao_fila_ok,
  (select max(d.start_time) from cron.job_run_details d join cron.job j on j.jobid = d.jobid
    where j.jobname = 'agendar-etapas-cadencias') as ultima_execucao_cadencias,
  (select d.status = 'succeeded' from cron.job_run_details d join cron.job j on j.jobid = d.jobid
    where j.jobname = 'agendar-etapas-cadencias' order by d.start_time desc limit 1) as ultima_execucao_cadencias_ok;

revoke all on public.vw_saude_fila from public, anon, authenticated;

create or replace function public.saude_fila_completa()
returns setof public.vw_saude_fila
language plpgsql
stable
security definer
set search_path = public, cron
as $$
begin
  if not public.sou_gestao() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return query select * from public.vw_saude_fila;
end;
$$;
revoke all on function public.saude_fila_completa() from public, anon;
grant execute on function public.saude_fila_completa() to authenticated;

-- ---------------------------------------------------------------------------
-- Vigia: alerta no painel e em canal externo quando a fila para
-- ---------------------------------------------------------------------------
-- Canal externo: URL de webhook compatível com Slack ({"text": ...}) guardada
-- no Vault como 'alerta_webhook_url'. Além disso, a cada execução o vigia
-- "bate o ponto" em 'heartbeat_url' (ex.: healthchecks.io): se o próprio
-- pg_cron parar, o serviço externo deixa de receber o ponto e alerta sozinho.
-- Sem os segredos cadastrados, o alerta fica só no painel.
create table if not exists public.alertas_enviados (
  tipo        text primary key,
  enviado_em  timestamptz not null,
  detalhe     text
);
alter table public.alertas_enviados enable row level security;
drop policy if exists "alertas_select_gestao" on public.alertas_enviados;
create policy "alertas_select_gestao" on public.alertas_enviados
  for select to authenticated using (public.sou_gestao());
grant select on public.alertas_enviados to authenticated;

create or replace function public.vigiar_fila()
returns text[]
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  s        record;
  v_url    text;
  v_ponto  text;
  v_alerta text;
  v_tipo   text;
  v_saida  text[] := '{}';
  v_problemas text[][] := '{}';
  i        int;
begin
  select * into s from public.vw_saude_fila;

  if coalesce(s.mais_antiga_min, 0) > 10 then
    v_problemas := v_problemas || array[array['fila_parada',
      format('Fila parada: %s mensagem(ns) vencida(s), a mais antiga há %s min.', s.pendentes_vencidas, s.mais_antiga_min)]];
  end if;
  if s.ultima_execucao_fila is not null and s.ultima_execucao_fila < now() - interval '5 minutes' then
    v_problemas := v_problemas || array[array['cron_fila_parado',
      format('O cron da fila não roda desde %s.', to_char(s.ultima_execucao_fila at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'))]];
  end if;
  if s.ultima_execucao_fila_ok is false then
    v_problemas := v_problemas || array[array['cron_fila_falhou', 'A última execução do cron da fila falhou.']];
  end if;
  if s.ultima_execucao_cadencias_ok is false then
    v_problemas := v_problemas || array[array['cron_cadencias_falhou', 'A última execução do agendador de cadências falhou.']];
  end if;
  if coalesce(s.inscricoes_atrasadas, 0) > 0 then
    v_problemas := v_problemas || array[array['cadencias_atrasadas',
      format('%s inscrição(ões) de cadência atrasada(s) há mais de 10 min.', s.inscricoes_atrasadas)]];
  end if;
  if coalesce(s.erros_24h, 0) >= 5 then
    v_problemas := v_problemas || array[array['erros_envio',
      format('%s mensagem(ns) desistiram por erro nas últimas 24h.', s.erros_24h)]];
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'alerta_webhook_url';
  select decrypted_secret into v_ponto from vault.decrypted_secrets where name = 'heartbeat_url';

  for i in 1 .. coalesce(array_length(v_problemas, 1), 0) loop
    v_tipo := v_problemas[i][1];
    v_alerta := v_problemas[i][2];
    -- Um alerta por tipo a cada 30 min: avisa sem inundar.
    if exists (select 1 from public.alertas_enviados
                where tipo = v_tipo and enviado_em > now() - interval '30 minutes') then
      continue;
    end if;
    insert into public.alertas_enviados (tipo, enviado_em, detalhe) values (v_tipo, now(), v_alerta)
    on conflict (tipo) do update set enviado_em = excluded.enviado_em, detalhe = excluded.detalhe;
    perform public.notificar_gestao('fila_alerta', 'Alerta da fila de mensagens', v_alerta, '/dashboard/cadencias');
    if v_url is not null then
      perform net.http_post(
        url := v_url,
        body := jsonb_build_object('text', '[Moradas de Paraty] ' || v_alerta),
        headers := jsonb_build_object('Content-Type', 'application/json'));
    end if;
    v_saida := v_saida || v_tipo;
  end loop;

  if v_ponto is not null then
    perform net.http_post(url := v_ponto, body := jsonb_build_object('problemas', v_saida),
                          headers := jsonb_build_object('Content-Type', 'application/json'));
  end if;
  return v_saida;
end;
$$;

revoke all on function public.vigiar_fila() from public, anon, authenticated;
grant execute on function public.vigiar_fila() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'vigiar-fila') then
    perform cron.unschedule('vigiar-fila');
  end if;
  perform cron.schedule('vigiar-fila', '*/5 * * * *', 'select public.vigiar_fila()');
end $$;

notify pgrst, 'reload schema';
