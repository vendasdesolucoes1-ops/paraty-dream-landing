-- Correções da Sophia (raio-X de 03/11). A IA continua desligada: nada aqui
-- liga o agente; a ativação passa a exigir horários e consultor configurados.

-- ---------------------------------------------------------------------------
-- 1. Autor de cada mensagem do WhatsApp
-- ---------------------------------------------------------------------------
-- lead | sophia | equipe_painel (CRM) | equipe_celular (do aparelho) |
-- disparo (fila, cadência, campanha, disparo em massa) | sistema (avisos fixos).
-- Nulo = mensagem antiga de origem desconhecida.
alter table public.whatsapp_messages add column if not exists autor text;
alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_autor_check;
alter table public.whatsapp_messages add constraint whatsapp_messages_autor_check
  check (autor is null or autor in ('lead', 'sophia', 'equipe_painel', 'equipe_celular', 'disparo', 'sistema'));

update public.whatsapp_messages set autor = 'lead' where autor is null and not from_me;
update public.whatsapp_messages set autor = 'disparo'
 where autor is null and from_me and mensagem_agendada_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Pausa por atendimento humano com expiração
-- ---------------------------------------------------------------------------
alter table public.ai_agent_human_takeover
  add column if not exists expira_em timestamptz,
  add column if not exists origem text;

insert into public.configuracoes (chave, valor)
select 'pausa_humana_horas', '24'
 where not exists (select 1 from public.configuracoes where chave = 'pausa_humana_horas');

-- Pausa aberta = não resolvida e não expirada.
create or replace function public.takeovers_abertos()
returns table (session_id text, desde timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.session_id, min(t.human_takeover_at) as desde
    from public.ai_agent_human_takeover t
    join public.ai_agent_conversations c on c.id = t.conversation_id
   where t.resolved_at is null
     and (t.expira_em is null or t.expira_em > now())
     and (
       public.sou_gestao()
       or exists (
         select 1 from public.leads l
          where l.vendedor_id = public.meu_vendedor_id()
            and l.telefone is not null
            and l.telefone_chave = public.telefone_chave(c.session_id)
       )
     )
   group by c.session_id
$$;

-- ---------------------------------------------------------------------------
-- 3. Log completo das chamadas ao modelo
-- ---------------------------------------------------------------------------
alter table public.ai_chamadas
  add column if not exists canal text,
  add column if not exists session_id text,
  add column if not exists prompt text,
  add column if not exists mensagens jsonb,
  add column if not exists resposta text,
  add column if not exists ferramentas jsonb,
  add column if not exists temperatura numeric;

create index if not exists ai_chamadas_funcao_criado_idx on public.ai_chamadas (funcao, criado_em desc);

alter table public.ai_chamadas enable row level security;
drop policy if exists "ai_chamadas_select_gestao" on public.ai_chamadas;
create policy "ai_chamadas_select_gestao" on public.ai_chamadas
  for select to authenticated using (public.sou_gestao());
grant select on public.ai_chamadas to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Materiais que a Sophia pode enviar (localização, fotos, vídeos, PDF)
-- ---------------------------------------------------------------------------
create table if not exists public.materiais_agente (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('localizacao', 'foto', 'video_drone', 'video_lote', 'pdf')),
  titulo      text not null check (length(trim(titulo)) > 0),
  descricao   text,
  url         text,
  mime_type   text,
  latitude    numeric(9,6),
  longitude   numeric(9,6),
  endereco    text,
  ativo       boolean not null default true,
  ordem       integer not null default 0,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (
    (tipo = 'localizacao' and latitude is not null and longitude is not null)
    or (tipo <> 'localizacao' and url is not null)
  )
);

alter table public.materiais_agente enable row level security;
drop policy if exists "materiais_select" on public.materiais_agente;
create policy "materiais_select" on public.materiais_agente
  for select to authenticated using (true);
drop policy if exists "materiais_write_gestao" on public.materiais_agente;
create policy "materiais_write_gestao" on public.materiais_agente
  for all to authenticated using (public.sou_gestao()) with check (public.sou_gestao());
grant select, insert, update, delete on public.materiais_agente to authenticated;

-- Arquivos dos materiais: leitura pública (a Evolution baixa pela URL),
-- escrita só da gestão.
insert into storage.buckets (id, name, public)
values ('materiais-agente', 'materiais-agente', true)
on conflict (id) do update set public = true;

drop policy if exists "materiais_agente_upload_gestao" on storage.objects;
create policy "materiais_agente_upload_gestao" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'materiais-agente' and public.sou_gestao());
drop policy if exists "materiais_agente_update_gestao" on storage.objects;
create policy "materiais_agente_update_gestao" on storage.objects
  for update to authenticated
  using (bucket_id = 'materiais-agente' and public.sou_gestao());
drop policy if exists "materiais_agente_delete_gestao" on storage.objects;
create policy "materiais_agente_delete_gestao" on storage.objects
  for delete to authenticated
  using (bucket_id = 'materiais-agente' and public.sou_gestao());

-- ---------------------------------------------------------------------------
-- 5. Modelo e ativação da IA
-- ---------------------------------------------------------------------------
alter table public.ai_agents drop constraint if exists ai_agents_modelo_check;
alter table public.ai_agents add constraint ai_agents_modelo_check
  check (modelo = any (array['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4.1']));

-- Consultor que recebe as visitas e os avisos: {vendedor_id, nome, telefone}.
-- Cadastrado no painel (Configurações → Agente IA).

-- O que falta para ligar a IA, em texto para o painel. Vazio = pode ligar.
create or replace function public.pendencias_ativar_ia()
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_janelas jsonb;
  v_consultor jsonb;
  v_falta text[] := '{}';
begin
  begin
    select valor::jsonb into v_janelas from public.configuracoes where chave = 'janelas_visita';
  exception when others then v_janelas := null;
  end;
  if v_janelas is null or jsonb_array_length(coalesce(v_janelas->'dias', '[]'::jsonb)) = 0 then
    v_falta := array_append(v_falta, 'Cadastre os horários de visita.');
  end if;

  begin
    select valor::jsonb into v_consultor from public.configuracoes where chave = 'consultor_responsavel';
  exception when others then v_consultor := null;
  end;
  if v_consultor is null or coalesce(trim(v_consultor->>'nome'), '') = '' then
    v_falta := array_append(v_falta, 'Escolha o consultor responsável pelas visitas.');
  elsif length(regexp_replace(coalesce(v_consultor->>'telefone', ''), '\D', '', 'g')) < 10 then
    v_falta := array_append(v_falta, 'O consultor responsável precisa de um telefone (WhatsApp) para receber os avisos.');
  end if;
  return v_falta;
end;
$$;
revoke all on function public.pendencias_ativar_ia() from public, anon;
grant execute on function public.pendencias_ativar_ia() to authenticated, service_role;

create or replace function public.ai_agents_proteger_ativacao()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_falta text[];
begin
  if new.is_active and not coalesce(old.is_active, false) then
    v_falta := public.pendencias_ativar_ia();
    if coalesce(array_length(v_falta, 1), 0) > 0 then
      raise exception 'A IA não pode ser ligada ainda: %', array_to_string(v_falta, ' ')
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ai_agents_proteger_ativacao on public.ai_agents;
create trigger ai_agents_proteger_ativacao
  before update of is_active on public.ai_agents
  for each row execute function public.ai_agents_proteger_ativacao();

-- ---------------------------------------------------------------------------
-- 6. Visita sem duplicar (a Sophia pode tentar de novo a mesma ação)
-- ---------------------------------------------------------------------------
create unique index if not exists visitas_lead_horario_unico
  on public.visitas (lead_id, data_hora)
  where status <> 'cancelada';

-- ---------------------------------------------------------------------------
-- 7. Número @lid → telefone real (aprendido dos eventos da Evolution)
-- ---------------------------------------------------------------------------
create table if not exists public.whatsapp_lid_map (
  lid           text primary key,
  telefone      text not null,
  atualizado_em timestamptz not null default now()
);
alter table public.whatsapp_lid_map enable row level security;
-- Só as Edge Functions (service_role) leem e gravam.

-- ---------------------------------------------------------------------------
-- 8. Quem um humano já atendeu não recebe primeiro contato automático
-- ---------------------------------------------------------------------------
create or replace function public.humano_ja_atendeu(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.leads l
      join public.ai_agent_conversations c on public.telefone_chave(c.session_id) = l.telefone_chave
      join public.ai_agent_human_takeover t on t.conversation_id = c.id
     where l.id = p_lead_id
  ) or exists (
    select 1 from public.whatsapp_messages w
     where w.lead_id = p_lead_id and w.autor in ('equipe_painel', 'equipe_celular')
  )
$$;
revoke all on function public.humano_ja_atendeu(uuid) from public, anon, authenticated;
grant execute on function public.humano_ja_atendeu(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Vigia da fila: "rodando" não é falha
-- ---------------------------------------------------------------------------
-- Antes lia a ÚLTIMA execução, que no minuto do vigia ainda estava "running".
-- Agora lê a última execução TERMINADA.
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
    where j.jobname = 'processar-mensagens-agendadas' and d.status in ('succeeded', 'failed')
    order by d.start_time desc limit 1) as ultima_execucao_fila_ok,
  (select max(d.start_time) from cron.job_run_details d join cron.job j on j.jobid = d.jobid
    where j.jobname = 'agendar-etapas-cadencias') as ultima_execucao_cadencias,
  (select d.status = 'succeeded' from cron.job_run_details d join cron.job j on j.jobid = d.jobid
    where j.jobname = 'agendar-etapas-cadencias' and d.status in ('succeeded', 'failed')
    order by d.start_time desc limit 1) as ultima_execucao_cadencias_ok;

revoke all on public.vw_saude_fila from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. pode_enviar: pausa expirada não bloqueia; humano atendeu bloqueia o
--     primeiro contato automático
-- ---------------------------------------------------------------------------
create or replace function public.pode_enviar(
  p_lead_id uuid,
  p_tipo text default 'primeiro_contato',
  p_agora timestamptz default now(),
  p_instance_id uuid default null
)
returns table (ok boolean, motivo text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lead   record;
  v_chave  text;
  v_regras public.regras_envio;
  v_usados int;
begin
  select * into v_regras from public.regras_envio where id;
  select id, telefone, status_crm, contato_bloqueado, sem_interesse_em, deletado_em
    into v_lead
    from public.leads
   where id = p_lead_id;

  if not found or v_lead.deletado_em is not null then
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

  if exists (
    select 1
      from public.ai_agent_human_takeover t
      join public.ai_agent_conversations c on c.id = t.conversation_id
     where t.resolved_at is null
       and (t.expira_em is null or t.expira_em > p_agora)
       and public.telefone_chave(c.session_id) = v_chave
  ) then
    return query select false, 'takeover'; return;
  end if;

  -- Conversa que um humano já atendeu: a Sophia nunca puxa assunto sozinha.
  if p_tipo = 'primeiro_contato' and public.humano_ja_atendeu(p_lead_id) then
    return query select false, 'humano_atendeu'; return;
  end if;

  if p_tipo <> 'primeiro_contato'
     and (p_tipo <> 'campanha' or coalesce(v_regras.campanha_exige_base_legal, true))
     and not (
       exists (select 1 from public.consentimentos k where k.lead_id = p_lead_id)
       or exists (select 1 from public.whatsapp_messages w
                   where w.lead_id = p_lead_id and w.from_me = false)
     ) then
    return query select false, 'sem_base_legal'; return;
  end if;

  if not public.dentro_da_janela(p_agora) then
    return query select false, 'fora_da_janela'; return;
  end if;

  -- Limite diário da instância (com aquecimento). Falha fechada: sem regras
  -- legíveis, não envia.
  if p_instance_id is not null and p_tipo <> 'resposta_ia' then
    if v_regras.id is null then
      return query select false, 'regras_indisponiveis'; return;
    end if;
    select coalesce(sum(enviados), 0) into v_usados
      from public.uso_instancia
     where instance_id = p_instance_id
       and dia = (p_agora at time zone 'America/Sao_Paulo')::date;
    if v_usados >= public.limite_diario_instancia(p_instance_id, p_agora) then
      return query select false, 'limite_diario'; return;
    end if;
  end if;

  return query select true, null::text;
end;
$$;

revoke all on function public.pode_enviar(uuid, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.pode_enviar(uuid, text, timestamptz, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 11. Segredo do webhook da Evolution, para a Edge Function configurar a URL
--     sem o valor passar pelo painel
-- ---------------------------------------------------------------------------
create or replace function public.segredo_webhook_evolution()
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'evolution_webhook_secret' limit 1
$$;
revoke all on function public.segredo_webhook_evolution() from public, anon, authenticated;
grant execute on function public.segredo_webhook_evolution() to service_role;

notify pgrst, 'reload schema';
