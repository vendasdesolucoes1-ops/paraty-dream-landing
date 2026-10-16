-- Cadências de follow-up na Evolution (auditoria R-27, issues #49, #50 e #51).
--
-- Tudo roda na infra que já existe: Postgres decide, pg_cron agenda, a outbox
-- `mensagens_agendadas` carrega o texto e o worker `processar-fila-mensagens`
-- envia pela Evolution, passando por `pode_enviar()` antes de cada parte.
--
-- Máquina de estados da inscrição (um lead numa cadência):
--
--   ativa ──agendar_etapas()──▶ etapa na outbox ──worker──▶ enviada ──▶ ativa (próxima etapa)
--     │                              └─ pode_enviar() recusou: adia ou encerra, sempre com motivo
--     ├─ lead respondeu / takeover humano ─────────────▶ pausada (retomável)
--     ├─ opt-out, sem interesse, lead perdido/excluído ─▶ cancelada (final)
--     ├─ visita marcada, etapa do funil avançou ────────▶ convertida (final)
--     ├─ acabaram as etapas ou bateu o limite de tentativas ▶ sem_resposta (final)
--     ├─ lembrete de visita: visita realizada ──────────▶ concluida (final)
--     └─ erro definitivo de envio (dead-letter) ────────▶ falhou (final)
--
-- Regras de envio da Evolution (sem API oficial, o risco é banimento do
-- número): limite diário por instância, rampa de aquecimento para número novo,
-- no máximo N tentativas sem resposta por inscrição e pausa automática da
-- cadência quando o opt-out de uma etapa passa do limite. Toda recusa deixa o
-- motivo em `envios_eventos`.

-- ---------------------------------------------------------------------------
-- Regras de envio (uma linha só) e limites por instância
-- ---------------------------------------------------------------------------
create table if not exists public.regras_envio (
  id                           boolean primary key default true check (id),
  limite_diario                int not null default 150 check (limite_diario > 0),
  aquecimento_dias             int not null default 21 check (aquecimento_dias >= 0),
  aquecimento_inicial          int not null default 20 check (aquecimento_inicial > 0),
  max_tentativas_sem_resposta  int not null default 2 check (max_tentativas_sem_resposta between 1 and 10),
  limite_opt_out_pct           numeric(5,2) not null default 5 check (limite_opt_out_pct > 0),
  minimo_envios_para_pausa     int not null default 20 check (minimo_envios_para_pausa > 0),
  -- Campanha só fala com quem deu base para o contato (consentimento ou
  -- conversa iniciada pelo lead). Desligar é decisão jurídica, não técnica.
  campanha_exige_base_legal    boolean not null default true,
  atualizado_em                timestamptz not null default now(),
  atualizado_por               uuid
);
insert into public.regras_envio (id) values (true) on conflict (id) do nothing;

alter table public.regras_envio enable row level security;
drop policy if exists "regras_envio_select_gestao" on public.regras_envio;
create policy "regras_envio_select_gestao" on public.regras_envio
  for select to authenticated using (public.sou_gestao());
drop policy if exists "regras_envio_update_admin" on public.regras_envio;
create policy "regras_envio_update_admin" on public.regras_envio
  for update to authenticated
  using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
grant select, update on public.regras_envio to authenticated;

-- Limite próprio da instância (null = o das regras) e início do aquecimento.
-- Instâncias existentes ficam sem aquecimento (já estão em uso); as criadas
-- daqui em diante começam a rampa no dia da criação.
alter table public.whatsapp_instances
  add column if not exists limite_diario int check (limite_diario > 0),
  add column if not exists aquecimento_inicio date;
alter table public.whatsapp_instances alter column aquecimento_inicio set default current_date;
grant select (limite_diario, aquecimento_inicio) on public.whatsapp_instances to authenticated;
grant update (limite_diario, aquecimento_inicio) on public.whatsapp_instances to authenticated;

create table if not exists public.uso_instancia (
  instance_id  uuid not null references public.whatsapp_instances(id) on delete cascade,
  dia          date not null,
  enviados     int not null default 0,
  primary key (instance_id, dia)
);
alter table public.uso_instancia enable row level security;
drop policy if exists "uso_instancia_select_gestao" on public.uso_instancia;
create policy "uso_instancia_select_gestao" on public.uso_instancia
  for select to authenticated using (public.sou_gestao());
grant select on public.uso_instancia to authenticated;

-- Limite do dia para a instância, já com a rampa de aquecimento aplicada.
create or replace function public.limite_diario_instancia(p_instance_id uuid, p_agora timestamptz default now())
returns int
language sql
stable
security definer
set search_path = public
as $$
  with r as (select * from public.regras_envio where id),
       i as (select * from public.whatsapp_instances where id = p_instance_id),
       base as (
         select coalesce(i.limite_diario, r.limite_diario) as limite,
                (p_agora at time zone 'America/Sao_Paulo')::date - i.aquecimento_inicio as dias,
                r.aquecimento_dias, r.aquecimento_inicial
           from r left join i on true
       )
  select case
           when dias is null or dias >= aquecimento_dias or aquecimento_dias = 0 then limite
           else least(limite, aquecimento_inicial
                + ((limite - aquecimento_inicial) * greatest(dias, 0) / aquecimento_dias))
         end
    from base
$$;

-- ---------------------------------------------------------------------------
-- Cadências, etapas, inscrições e eventos
-- ---------------------------------------------------------------------------
create table if not exists public.cadencias (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null,
  descricao           text,
  -- manual: inscrição pelo painel · primeiro_contato: depois da abordagem do
  -- formulário · visita_agendada: lembretes de visita · campanha: disparo em massa
  gatilho             text not null default 'manual'
                      check (gatilho in ('manual', 'primeiro_contato', 'visita_agendada', 'campanha')),
  ativa               boolean not null default false,
  pausa_ao_responder  boolean not null default true,
  -- Etapas do funil em que a cadência faz sentido; o lead sair delas é
  -- conversão. null = qualquer etapa.
  status_crm_validos  text[],
  pausada_em          timestamptz,
  motivo_pausa        text,
  instance_id         uuid references public.whatsapp_instances(id) on delete set null,
  criado_por          uuid default auth.uid(),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

create table if not exists public.cadencia_etapas (
  id            uuid primary key default gen_random_uuid(),
  cadencia_id   uuid not null references public.cadencias(id) on delete cascade,
  ordem         int not null check (ordem > 0),
  -- A partir de quando conta o deslocamento.
  referencia    text not null default 'anterior'
                check (referencia in ('inscricao', 'anterior', 'visita')),
  deslocamento  interval not null default interval '1 day',
  -- Horário fixo (Brasília) no dia resultante, ex.: véspera às 10h.
  hora_fixa     time,
  -- template: sai o texto do template · ia_aprovacao: a IA pode redigir a
  -- partir do template e um humano aprova antes de sair (piloto, issue #52).
  modo          text not null default 'template' check (modo in ('template', 'ia_aprovacao')),
  -- Partes separadas por ||. Variáveis: {{primeiro_nome}}, {{data_visita}}, {{hora_visita}}.
  template      text not null check (length(trim(template)) > 0),
  ativa         boolean not null default true,
  unique (cadencia_id, ordem)
);

create table if not exists public.inscricoes (
  id                       uuid primary key default gen_random_uuid(),
  cadencia_id              uuid not null references public.cadencias(id) on delete cascade,
  lead_id                  uuid not null references public.leads(id) on delete cascade,
  visita_id                uuid references public.visitas(id) on delete cascade,
  status                   text not null default 'ativa'
                           check (status in ('ativa', 'pausada', 'cancelada', 'convertida',
                                             'sem_resposta', 'concluida', 'falhou')),
  etapa_atual              int not null default 0,
  proxima_em               timestamptz,
  tentativas_sem_resposta  int not null default 0,
  ultimo_envio_em          timestamptz,
  motivo_saida             text,
  criado_por               uuid default auth.uid(),
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now(),
  encerrada_em             timestamptz
);

-- Um lead não entra duas vezes na mesma cadência enquanto ela corre.
create unique index if not exists inscricoes_lead_cadencia_ativa_idx
  on public.inscricoes (lead_id, cadencia_id)
  where status in ('ativa', 'pausada');
create index if not exists inscricoes_vencidas_idx
  on public.inscricoes (proxima_em) where status = 'ativa';
create index if not exists inscricoes_lead_idx on public.inscricoes (lead_id);

create table if not exists public.envios_eventos (
  id            bigserial primary key,
  inscricao_id  uuid references public.inscricoes(id) on delete cascade,
  cadencia_id   uuid references public.cadencias(id) on delete cascade,
  etapa_ordem   int,
  lead_id       uuid references public.leads(id) on delete cascade,
  mensagem_id   uuid,
  evento        text not null check (evento in (
                  'inscrito', 'enfileirado', 'aguardando_aprovacao', 'aprovado', 'rejeitado',
                  'enviado', 'adiado', 'bloqueado', 'respondeu', 'opt_out', 'pausado',
                  'retomado', 'cancelado', 'convertido', 'sem_resposta', 'concluido', 'falhou',
                  'cadencia_pausada')),
  motivo        text,
  criado_em     timestamptz not null default now()
);
create index if not exists envios_eventos_cadencia_idx on public.envios_eventos (cadencia_id, etapa_ordem, evento);
create index if not exists envios_eventos_inscricao_idx on public.envios_eventos (inscricao_id);

-- A outbox passa a saber de qual inscrição e etapa veio cada envio.
alter table public.mensagens_agendadas
  add column if not exists inscricao_id uuid references public.inscricoes(id) on delete cascade,
  add column if not exists etapa_ordem int,
  add column if not exists ia_motivo text,
  add column if not exists ia_prompt_versao text,
  add column if not exists aprovado_por uuid;
create index if not exists mensagens_agendadas_inscricao_idx
  on public.mensagens_agendadas (inscricao_id) where inscricao_id is not null;

alter table public.mensagens_agendadas drop constraint if exists mensagens_agendadas_status_check;
alter table public.mensagens_agendadas add constraint mensagens_agendadas_status_check
  check (status in ('pendente', 'enviando', 'enviado', 'cancelado', 'erro', 'aguardando_aprovacao'));

-- Mensagem do WhatsApp ligada ao item da fila que a gerou (acks por envio).
alter table public.whatsapp_messages
  add column if not exists mensagem_agendada_id uuid;
create index if not exists whatsapp_messages_mensagem_agendada_idx
  on public.whatsapp_messages (mensagem_agendada_id) where mensagem_agendada_id is not null;

-- RLS: gestão administra cadências; vendedor vê as inscrições dos seus leads.
alter table public.cadencias enable row level security;
alter table public.cadencia_etapas enable row level security;
alter table public.inscricoes enable row level security;
alter table public.envios_eventos enable row level security;

drop policy if exists "cadencias_select" on public.cadencias;
create policy "cadencias_select" on public.cadencias for select to authenticated using (true);
drop policy if exists "cadencias_write_gestao" on public.cadencias;
create policy "cadencias_write_gestao" on public.cadencias
  for all to authenticated using (public.sou_gestao()) with check (public.sou_gestao());
grant select, insert, update, delete on public.cadencias to authenticated;

drop policy if exists "cadencia_etapas_select" on public.cadencia_etapas;
create policy "cadencia_etapas_select" on public.cadencia_etapas for select to authenticated using (true);
drop policy if exists "cadencia_etapas_write_gestao" on public.cadencia_etapas;
create policy "cadencia_etapas_write_gestao" on public.cadencia_etapas
  for all to authenticated using (public.sou_gestao()) with check (public.sou_gestao());
grant select, insert, update, delete on public.cadencia_etapas to authenticated;

-- Inscrições e eventos só se leem pelo painel; mudam por RPC (abaixo).
drop policy if exists "inscricoes_select" on public.inscricoes;
create policy "inscricoes_select" on public.inscricoes
  for select to authenticated using (public.pode_ver_lead(lead_id));
grant select on public.inscricoes to authenticated;

drop policy if exists "envios_eventos_select" on public.envios_eventos;
create policy "envios_eventos_select" on public.envios_eventos
  for select to authenticated
  using (public.sou_gestao() or (lead_id is not null and public.pode_ver_lead(lead_id)));
grant select on public.envios_eventos to authenticated;

drop trigger if exists auditoria on public.cadencias;
create trigger auditoria after insert or update or delete on public.cadencias
  for each row execute function public.registrar_auditoria();
drop trigger if exists auditoria on public.cadencia_etapas;
create trigger auditoria after insert or update or delete on public.cadencia_etapas
  for each row execute function public.registrar_auditoria();
drop trigger if exists auditoria on public.regras_envio;
create trigger auditoria after insert or update or delete on public.regras_envio
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------------
create or replace function public.registrar_evento_envio(
  p_inscricao_id uuid, p_evento text, p_motivo text default null,
  p_etapa int default null, p_mensagem_id uuid default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.envios_eventos (inscricao_id, cadencia_id, etapa_ordem, lead_id, mensagem_id, evento, motivo)
  select i.id, i.cadencia_id, coalesce(p_etapa, nullif(i.etapa_atual, 0)), i.lead_id, p_mensagem_id, p_evento, p_motivo
    from public.inscricoes i where i.id = p_inscricao_id
$$;

-- Avisa admin e gestores no sininho do painel.
create or replace function public.notificar_gestao(p_tipo text, p_titulo text, p_corpo text, p_link text default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, body, link)
  select p.id, p_tipo, p_titulo, p_corpo, p_link
    from public.profiles p
   where p.role in ('admin', 'gestor') and p.ativo and p.deletado_em is null
$$;

-- Instante em que uma etapa vence para a inscrição. null = etapa não se aplica
-- (lembrete de visita que cairia depois da visita, por exemplo).
create or replace function public.vencimento_etapa(p_inscricao_id uuid, p_ordem int)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ins   public.inscricoes;
  v_et    public.cadencia_etapas;
  v_visita timestamptz;
  v_base  timestamptz;
  v_t     timestamptz;
begin
  select * into v_ins from public.inscricoes where id = p_inscricao_id;
  select * into v_et from public.cadencia_etapas
   where cadencia_id = v_ins.cadencia_id and ordem = p_ordem;
  if not found then return null; end if;

  if v_ins.visita_id is not null then
    select data_hora into v_visita from public.visitas where id = v_ins.visita_id;
  end if;

  v_base := case v_et.referencia
              when 'inscricao' then v_ins.criado_em
              when 'visita' then v_visita
              else coalesce(v_ins.ultimo_envio_em, v_ins.criado_em)
            end;
  if v_base is null then return null; end if;

  v_t := v_base + v_et.deslocamento;
  if v_et.hora_fixa is not null then
    v_t := (((v_t at time zone 'America/Sao_Paulo')::date + v_et.hora_fixa)) at time zone 'America/Sao_Paulo';
  end if;

  -- Lembrete de visita: nunca depois da visita, nem atrasado demais (marcar
  -- hoje para amanhã não dispara o lembrete "da véspera" de ontem).
  if v_et.referencia = 'visita' and (v_t >= v_visita - interval '1 hour' or v_t < now() - interval '1 hour') then
    return null;
  end if;
  return v_t;
end;
$$;

-- Próxima etapa aplicável depois de `p_depois_de`, com o vencimento.
create or replace function public.proxima_etapa(p_inscricao_id uuid, p_depois_de int)
returns table (ordem int, vence_em timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cadencia uuid;
  r record;
  v_vence timestamptz;
begin
  select cadencia_id into v_cadencia from public.inscricoes where id = p_inscricao_id;
  for r in
    select e.ordem from public.cadencia_etapas e
     where e.cadencia_id = v_cadencia and e.ativa and e.ordem > p_depois_de
     order by e.ordem
  loop
    v_vence := public.vencimento_etapa(p_inscricao_id, r.ordem);
    if v_vence is not null then
      return query select r.ordem, v_vence;
      return;
    end if;
  end loop;
end;
$$;

-- Texto final da etapa, em partes. Nome só entra se for um primeiro nome
-- plausível (mesma regra de _shared/primeiro-contato.ts).
create or replace function public.renderizar_template(p_template text, p_lead_id uuid, p_visita_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nome   text;
  v_visita timestamptz;
  v_texto  text := p_template;
begin
  select split_part(trim(coalesce(nome, '')), ' ', 1) into v_nome from public.leads where id = p_lead_id;
  if v_nome !~ '^[[:alpha:]][[:alpha:]''-]{0,19}$' then
    v_nome := null;
  else
    v_nome := upper(left(v_nome, 1)) || lower(substr(v_nome, 2));
  end if;
  v_texto := regexp_replace(v_texto, '\s*\{\{primeiro_nome\}\}',
                            coalesce(' ' || v_nome, ''), 'g');

  if p_visita_id is not null then
    select data_hora into v_visita from public.visitas where id = p_visita_id;
    v_texto := replace(v_texto, '{{data_visita}}',
                       to_char(v_visita at time zone 'America/Sao_Paulo', 'DD/MM'));
    v_texto := replace(v_texto, '{{hora_visita}}',
                       replace(to_char(v_visita at time zone 'America/Sao_Paulo', 'HH24"h"MI'), 'h00', 'h'));
  end if;

  return coalesce(
    (select jsonb_agg(trim(p) order by n)
       from unnest(string_to_array(v_texto, '||')) with ordinality as t(p, n)
      where trim(p) <> ''),
    '[]'::jsonb);
end;
$$;

-- Encerra (ou pausa) a inscrição, cancela o que estiver na fila e registra.
create or replace function public.mudar_inscricao(p_inscricao_id uuid, p_status text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento text := case p_status
    when 'pausada' then 'pausado' when 'cancelada' then 'cancelado'
    when 'convertida' then 'convertido' when 'sem_resposta' then 'sem_resposta'
    when 'concluida' then 'concluido' when 'falhou' then 'falhou' end;
begin
  update public.inscricoes
     set status = p_status,
         motivo_saida = p_motivo,
         proxima_em = null,
         atualizado_em = now(),
         encerrada_em = case when p_status = 'pausada' then null else now() end
   where id = p_inscricao_id and status in ('ativa', 'pausada') and status <> p_status;
  if not found then return; end if;

  update public.mensagens_agendadas
     set status = 'cancelado', erro = 'inscrição ' || p_status || ': ' || p_motivo, atualizado_em = now()
   where inscricao_id = p_inscricao_id and status in ('pendente', 'aguardando_aprovacao');

  perform public.registrar_evento_envio(p_inscricao_id, v_evento, p_motivo);
end;
$$;

-- Inscreve um lead (gatilhos e painel). Devolve a inscrição, ou null se o
-- lead já está nessa cadência.
create or replace function public._inscrever(p_cadencia_id uuid, p_lead_id uuid, p_visita_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_prox record;
begin
  insert into public.inscricoes (cadencia_id, lead_id, visita_id)
  values (p_cadencia_id, p_lead_id, p_visita_id)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then return null; end if;

  perform public.registrar_evento_envio(v_id, 'inscrito');
  select * into v_prox from public.proxima_etapa(v_id, 0);
  if v_prox.ordem is null then
    perform public.mudar_inscricao(v_id, 'concluida', 'nenhuma etapa aplicável');
  else
    update public.inscricoes set proxima_em = v_prox.vence_em where id = v_id;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Materialização: inscrições vencidas viram itens da outbox
-- ---------------------------------------------------------------------------
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

  -- Lembrete pendente de visita que já passou (ou foi remarcada) não sai.
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
    -- Já existe envio desta inscrição em andamento: espera ele terminar.
    if exists (select 1 from public.mensagens_agendadas
                where inscricao_id = r.id and status in ('pendente', 'enviando', 'aguardando_aprovacao')) then
      update public.inscricoes set proxima_em = null where id = r.id;
      continue;
    end if;

    select * into v_prox from public.proxima_etapa(r.id, r.etapa_atual);
    if v_prox.ordem is null then
      perform public.mudar_inscricao(r.id,
        case when r.gatilho = 'visita_agendada' then 'concluida' else 'sem_resposta' end,
        'fim das etapas');
      continue;
    end if;

    -- Regra da Evolution: no máximo N tentativas sem resposta por inscrição
    -- (lembrete de visita é esperado pelo lead e não conta).
    if r.gatilho <> 'visita_agendada'
       and r.tentativas_sem_resposta >= v_regras.max_tentativas_sem_resposta then
      perform public.registrar_evento_envio(r.id, 'bloqueado', 'limite_tentativas_sem_resposta', v_prox.ordem);
      perform public.mudar_inscricao(r.id, 'sem_resposta', 'limite de tentativas sem resposta');
      continue;
    end if;

    -- Etapa vence mais tarde do que o previsto (ex.: data da visita mudou).
    if v_prox.vence_em > now() then
      update public.inscricoes set proxima_em = v_prox.vence_em where id = r.id;
      continue;
    end if;

    select * into v_etapa from public.cadencia_etapas
     where cadencia_id = r.cadencia_id and ordem = v_prox.ordem;
    v_partes := public.renderizar_template(v_etapa.template, r.lead_id, r.visita_id);

    if jsonb_array_length(v_partes) = 0
       or not exists (select 1 from public.leads where id = r.lead_id and nullif(telefone, '') is not null) then
      perform public.registrar_evento_envio(r.id, 'bloqueado', 'sem_telefone_ou_texto', v_prox.ordem);
      perform public.mudar_inscricao(r.id, 'falhou', 'lead sem telefone ou etapa sem texto');
      continue;
    end if;

    v_msg := null;
    insert into public.mensagens_agendadas (
      lead_id, tipo, telefone, partes, agendado_para, status,
      instance_id, inscricao_id, etapa_ordem, chave_idempotencia
    )
    select r.lead_id,
           case when r.gatilho = 'campanha' then 'campanha' else 'cadencia' end,
           l.telefone, v_partes, now(),
           case when v_etapa.modo = 'ia_aprovacao' then 'aguardando_aprovacao' else 'pendente' end,
           r.cadencia_instancia, r.id, v_prox.ordem,
           'cadencia:' || r.id || ':' || v_prox.ordem
      from public.leads l where l.id = r.lead_id
    on conflict do nothing
    returning id into v_msg;

    if v_msg is null then
      -- Outro envio ativo do mesmo tipo para este lead (outra cadência):
      -- um de cada vez. Tenta de novo daqui a pouco.
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

-- ---------------------------------------------------------------------------
-- Desfecho de cada item da outbox volta para a inscrição
-- ---------------------------------------------------------------------------
create or replace function public.mensagens_agendadas_desfecho()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ins   public.inscricoes;
  v_prox  record;
  v_gat   text;
  v_motivo text;
  v_inst  uuid;
begin
  -- Uso diário da instância: todo envio ativo conta (resposta não).
  if new.status = 'enviado' and old.status is distinct from 'enviado' and new.tipo <> 'resposta_ia' then
    v_inst := new.instance_id;
    if v_inst is not null then
      insert into public.uso_instancia (instance_id, dia, enviados)
      values (v_inst, (now() at time zone 'America/Sao_Paulo')::date, 1)
      on conflict (instance_id, dia) do update set enviados = public.uso_instancia.enviados + 1;
    end if;
  end if;

  -- Abordagem do formulário enviada: entra nas cadências de "sem resposta".
  if new.tipo = 'primeiro_contato' and new.status = 'enviado' and old.status is distinct from 'enviado' then
    perform public._inscrever(c.id, new.lead_id)
       from public.cadencias c
      where c.gatilho = 'primeiro_contato' and c.ativa and c.pausada_em is null;
  end if;

  if new.inscricao_id is null then return new; end if;
  select * into v_ins from public.inscricoes where id = new.inscricao_id;
  if not found then return new; end if;
  select gatilho into v_gat from public.cadencias where id = v_ins.cadencia_id;

  if new.status = 'enviado' and old.status is distinct from 'enviado' then
    update public.inscricoes
       set etapa_atual = new.etapa_ordem,
           ultimo_envio_em = now(),
           tentativas_sem_resposta = tentativas_sem_resposta + 1,
           atualizado_em = now()
     where id = v_ins.id;
    perform public.registrar_evento_envio(v_ins.id, 'enviado', null, new.etapa_ordem, new.id);
    if v_ins.status = 'ativa' then
      select * into v_prox from public.proxima_etapa(v_ins.id, new.etapa_ordem);
      -- Depois da última etapa ainda espera 3 dias pela resposta antes de
      -- fechar como "sem resposta".
      update public.inscricoes
         set proxima_em = coalesce(v_prox.vence_em, now() + interval '3 days')
       where id = v_ins.id;
    end if;

  elsif new.status = 'cancelado' and old.status is distinct from 'cancelado' then
    v_motivo := coalesce(new.erro, 'cancelado');
    perform public.registrar_evento_envio(v_ins.id, 'bloqueado', v_motivo, new.etapa_ordem, new.id);
    if v_ins.status = 'ativa' then
      if v_motivo ~ 'opt_out|sem_interesse|lead_inexistente|sem_base_legal' then
        perform public.mudar_inscricao(v_ins.id, 'cancelada', v_motivo);
      elsif v_motivo ~ 'takeover' then
        perform public.mudar_inscricao(v_ins.id, 'pausada', v_motivo);
      elsif v_motivo ~ 'convertido' then
        perform public.mudar_inscricao(v_ins.id, 'convertida', v_motivo);
      elsif v_motivo ~ 'visita já passou' then
        update public.inscricoes set proxima_em = now() where id = v_ins.id;
      elsif v_motivo ~ 'rejeitad' then
        -- Humano rejeitou o texto: segue para a etapa seguinte.
        update public.inscricoes set etapa_atual = new.etapa_ordem, proxima_em = now() where id = v_ins.id;
      else
        perform public.mudar_inscricao(v_ins.id, 'falhou', v_motivo);
      end if;
    end if;

  elsif new.status = 'erro' and old.status is distinct from 'erro' then
    perform public.registrar_evento_envio(v_ins.id, 'bloqueado', coalesce(new.erro, 'erro'), new.etapa_ordem, new.id);
    perform public.mudar_inscricao(v_ins.id, 'falhou', 'erro de envio esgotou as tentativas');

  elsif new.status = 'pendente' and new.erro is distinct from old.erro and new.erro is not null then
    -- Adiado (fora da janela, limite diário, instância fora do ar...).
    perform public.registrar_evento_envio(v_ins.id, 'adiado', new.erro, new.etapa_ordem, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists mensagens_agendadas_desfecho on public.mensagens_agendadas;
create trigger mensagens_agendadas_desfecho
  after update of status, erro on public.mensagens_agendadas
  for each row execute function public.mensagens_agendadas_desfecho();

-- ---------------------------------------------------------------------------
-- Saídas automáticas
-- ---------------------------------------------------------------------------
-- Lead respondeu: zera as tentativas e pausa as cadências que pausam com
-- resposta (lembrete de visita segue: a resposta é a confirmação).
create or replace function public.cadencias_lead_respondeu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if new.from_me or new.lead_id is null then return new; end if;
  for r in
    select i.id, c.pausa_ao_responder, c.gatilho
      from public.inscricoes i join public.cadencias c on c.id = i.cadencia_id
     where i.lead_id = new.lead_id and i.status = 'ativa'
  loop
    -- Uma vez por inscrição a cada 6h basta para a métrica de resposta.
    if not exists (select 1 from public.envios_eventos e
                    where e.inscricao_id = r.id and e.evento = 'respondeu'
                      and e.criado_em > now() - interval '6 hours') then
      perform public.registrar_evento_envio(r.id, 'respondeu');
    end if;
    update public.inscricoes set tentativas_sem_resposta = 0 where id = r.id;
    if r.pausa_ao_responder and r.gatilho <> 'visita_agendada' then
      perform public.mudar_inscricao(r.id, 'pausada', 'lead respondeu');
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists cadencias_lead_respondeu on public.whatsapp_messages;
create trigger cadencias_lead_respondeu
  after insert on public.whatsapp_messages
  for each row execute function public.cadencias_lead_respondeu();

-- Humano assumiu a conversa: pausa tudo do lead.
create or replace function public.cadencias_takeover()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select i.id
      from public.ai_agent_conversations c
      join public.leads l on l.telefone_chave = public.telefone_chave(c.session_id)
      join public.inscricoes i on i.lead_id = l.id and i.status = 'ativa'
     where c.id = new.conversation_id
  loop
    perform public.mudar_inscricao(r.id, 'pausada', 'takeover humano');
  end loop;
  return new;
end;
$$;

drop trigger if exists cadencias_takeover on public.ai_agent_human_takeover;
create trigger cadencias_takeover
  after insert on public.ai_agent_human_takeover
  for each row execute function public.cadencias_takeover();

-- Pausa a cadência quando o opt-out de uma etapa passa do limite.
create or replace function public.checar_opt_out_cadencia(p_cadencia_id uuid, p_ordem int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regras  public.regras_envio;
  v_envios  int;
  v_saidas  int;
  v_nome    text;
begin
  if p_cadencia_id is null or p_ordem is null then return; end if;
  select * into v_regras from public.regras_envio where id;
  select count(*) filter (where evento = 'enviado'), count(*) filter (where evento = 'opt_out')
    into v_envios, v_saidas
    from public.envios_eventos
   where cadencia_id = p_cadencia_id and etapa_ordem = p_ordem;

  if v_envios >= v_regras.minimo_envios_para_pausa
     and v_saidas * 100.0 / v_envios > v_regras.limite_opt_out_pct then
    update public.cadencias
       set pausada_em = now(),
           motivo_pausa = format('opt-out de %s%% na etapa %s (limite %s%%)',
                                 round(v_saidas * 100.0 / v_envios, 1), p_ordem, v_regras.limite_opt_out_pct),
           atualizado_em = now()
     where id = p_cadencia_id and pausada_em is null
    returning nome into v_nome;
    if v_nome is not null then
      update public.mensagens_agendadas m
         set status = 'cancelado', erro = 'cadência pausada por opt-out', atualizado_em = now()
        from public.inscricoes i
       where m.inscricao_id = i.id and i.cadencia_id = p_cadencia_id
         and m.status in ('pendente', 'aguardando_aprovacao');
      insert into public.envios_eventos (cadencia_id, etapa_ordem, evento, motivo)
      values (p_cadencia_id, p_ordem, 'cadencia_pausada', 'opt-out acima do limite');
      perform public.notificar_gestao('cadencia_pausada', 'Cadência pausada',
        format('A cadência "%s" foi pausada: opt-out acima do limite na etapa %s.', v_nome, p_ordem),
        '/dashboard/cadencias');
    end if;
  end if;
end;
$$;

-- Mudanças no lead: opt-out, sem interesse, exclusão e avanço no funil.
create or replace function public.cadencias_lead_mudou()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select i.id, i.cadencia_id, i.etapa_atual, c.status_crm_validos
      from public.inscricoes i join public.cadencias c on c.id = i.cadencia_id
     where i.lead_id = new.id and i.status in ('ativa', 'pausada')
  loop
    if (new.contato_bloqueado and not coalesce(old.contato_bloqueado, false))
       or (new.sem_interesse_em is not null and old.sem_interesse_em is null) then
      -- O opt-out é atribuído à última etapa enviada (é ela que o provocou).
      perform public.registrar_evento_envio(r.id, 'opt_out',
        case when new.contato_bloqueado then 'opt_out' else 'sem_interesse' end);
      perform public.mudar_inscricao(r.id, 'cancelada',
        case when new.contato_bloqueado then 'opt-out' else 'sem interesse' end);
      perform public.checar_opt_out_cadencia(r.cadencia_id, nullif(r.etapa_atual, 0));
    elsif new.deletado_em is not null and old.deletado_em is null then
      perform public.mudar_inscricao(r.id, 'cancelada', 'lead excluído');
    elsif new.status_crm is distinct from old.status_crm then
      if new.status_crm = 'perdido' then
        perform public.mudar_inscricao(r.id, 'cancelada', 'lead perdido');
      elsif new.status_crm = 'fechado'
         or (r.status_crm_validos is not null and not (new.status_crm = any (r.status_crm_validos))) then
        perform public.mudar_inscricao(r.id, 'convertida', 'etapa do funil avançou para ' || new.status_crm);
      end if;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists cadencias_lead_mudou on public.leads;
create trigger cadencias_lead_mudou
  after update of contato_bloqueado, sem_interesse_em, deletado_em, status_crm on public.leads
  for each row execute function public.cadencias_lead_mudou();

-- Visita marcada converte as cadências comerciais e inicia os lembretes;
-- visita cancelada, realizada ou remarcada mexe nos lembretes.
create or replace function public.cadencias_visita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if tg_op = 'INSERT' then
    for r in
      select i.id from public.inscricoes i join public.cadencias c on c.id = i.cadencia_id
       where i.lead_id = new.lead_id and i.status in ('ativa', 'pausada')
         and c.gatilho <> 'visita_agendada'
    loop
      perform public.mudar_inscricao(r.id, 'convertida', 'visita marcada');
    end loop;
    if new.status in ('agendada', 'confirmada') and new.data_hora > now() then
      perform public._inscrever(c.id, new.lead_id, new.id)
         from public.cadencias c
        where c.gatilho = 'visita_agendada' and c.ativa and c.pausada_em is null;
    end if;
    return new;
  end if;

  -- Visita "a confirmar" (fora da janela) só ganha lembretes quando um humano
  -- a confirma.
  if new.status in ('agendada', 'confirmada') and old.status not in ('agendada', 'confirmada')
     and new.data_hora > now() then
    perform public._inscrever(c.id, new.lead_id, new.id)
       from public.cadencias c
      where c.gatilho = 'visita_agendada' and c.ativa and c.pausada_em is null;
  end if;

  for r in select i.id from public.inscricoes i
            where i.visita_id = new.id and i.status in ('ativa', 'pausada')
  loop
    if new.status = 'cancelada' then
      perform public.mudar_inscricao(r.id, 'cancelada', 'visita cancelada');
    elsif new.status in ('realizada', 'no_show') then
      perform public.mudar_inscricao(r.id, 'concluida', 'visita ' || new.status);
    elsif new.data_hora is distinct from old.data_hora then
      -- Remarcada: o texto pendente tem a data antiga.
      update public.mensagens_agendadas
         set status = 'cancelado', erro = 'visita já passou: remarcada', atualizado_em = now()
       where inscricao_id = r.id and status in ('pendente', 'aguardando_aprovacao');
      update public.inscricoes
         set etapa_atual = 0, proxima_em = now(), atualizado_em = now()
       where id = r.id and status = 'ativa';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists cadencias_visita on public.visitas;
create trigger cadencias_visita
  after insert or update of status, data_hora on public.visitas
  for each row execute function public.cadencias_visita();

-- ---------------------------------------------------------------------------
-- RPCs do painel
-- ---------------------------------------------------------------------------
create or replace function public.inscrever_lead(p_cadencia_id uuid, p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.pode_ver_lead(p_lead_id) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cadencias where id = p_cadencia_id and gatilho in ('manual', 'campanha')) then
    raise exception 'Esta cadência não aceita inscrição manual.' using errcode = '22023';
  end if;
  return public._inscrever(p_cadencia_id, p_lead_id);
end;
$$;

create or replace function public.pausar_inscricao(p_inscricao_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_lead uuid;
begin
  select lead_id into v_lead from public.inscricoes where id = p_inscricao_id;
  if v_lead is null or not public.pode_ver_lead(v_lead) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  perform public.mudar_inscricao(p_inscricao_id, 'pausada', 'pausada pelo painel');
end;
$$;

create or replace function public.cancelar_inscricao(p_inscricao_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_lead uuid;
begin
  select lead_id into v_lead from public.inscricoes where id = p_inscricao_id;
  if v_lead is null or not public.pode_ver_lead(v_lead) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  perform public.mudar_inscricao(p_inscricao_id, 'cancelada', 'cancelada pelo painel');
end;
$$;

-- Retomar respeita opt-out: pode_enviar barra de novo na hora do envio.
create or replace function public.retomar_inscricao(p_inscricao_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_lead uuid;
begin
  select lead_id into v_lead from public.inscricoes where id = p_inscricao_id and status = 'pausada';
  if v_lead is null or not public.pode_ver_lead(v_lead) then
    raise exception 'Inscrição não encontrada ou sem permissão.' using errcode = '42501';
  end if;
  update public.inscricoes
     set status = 'ativa', tentativas_sem_resposta = 0, motivo_saida = null,
         proxima_em = now(), atualizado_em = now()
   where id = p_inscricao_id;
  perform public.registrar_evento_envio(p_inscricao_id, 'retomado', 'retomada pelo painel');
end;
$$;

create or replace function public.retomar_cadencia(p_cadencia_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sou_gestao() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  update public.cadencias set pausada_em = null, motivo_pausa = null, atualizado_em = now()
   where id = p_cadencia_id;
  -- Quem estava esperando a etapa que foi cancelada volta para a fila.
  update public.inscricoes i set proxima_em = now()
   where i.cadencia_id = p_cadencia_id and i.status = 'ativa' and i.proxima_em is null
     and not exists (select 1 from public.mensagens_agendadas m
                      where m.inscricao_id = i.id and m.status in ('pendente', 'enviando', 'aguardando_aprovacao'));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'inscrever_lead(uuid, uuid)', 'pausar_inscricao(uuid)', 'cancelar_inscricao(uuid)',
    'retomar_inscricao(uuid)', 'retomar_cadencia(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array[
    'agendar_etapas(int)', '_inscrever(uuid, uuid, uuid)', 'mudar_inscricao(uuid, text, text)',
    'registrar_evento_envio(uuid, text, text, int, uuid)', 'vencimento_etapa(uuid, int)',
    'proxima_etapa(uuid, int)', 'renderizar_template(text, uuid, uuid)',
    'checar_opt_out_cadencia(uuid, int)', 'notificar_gestao(text, text, text, text)',
    'limite_diario_instancia(uuid, timestamptz)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- pode_enviar: agora com as regras da Evolution
-- ---------------------------------------------------------------------------
-- Novos motivos: 'limite_diario' (adia para o próximo dia útil) e, para
-- campanhas, 'sem_base_legal' conforme regras_envio.campanha_exige_base_legal.
drop function if exists public.pode_enviar(uuid, text, timestamptz);
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
       and public.telefone_chave(c.session_id) = v_chave
  ) then
    return query select false, 'takeover'; return;
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
-- Reivindicação: o teto de 24h vale para abordagem e resposta; follow-up
-- adiado pelo fim de semana ou pelo limite diário não pode expirar.
-- ---------------------------------------------------------------------------
create or replace function public.reivindicar_mensagens_agendadas(p_limite int default 20)
returns setof public.mensagens_agendadas
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mensagens_agendadas
     set status = 'cancelado',
         erro = 'expirou na fila',
         atualizado_em = now()
   where status = 'pendente'
     and (
       (tipo in ('primeiro_contato', 'resposta_ia') and criado_em < now() - interval '24 hours')
       or criado_em < now() - interval '7 days'
     );

  -- Rascunho de IA esquecido sem aprovação não sai dias depois.
  update public.mensagens_agendadas
     set status = 'cancelado', erro = 'aprovação expirou', atualizado_em = now()
   where status = 'aguardando_aprovacao' and criado_em < now() - interval '3 days';

  return query
  with candidatas as (
    select id
      from public.mensagens_agendadas
     where (status = 'pendente' and agendado_para <= now())
        or (status = 'enviando' and atualizado_em < now() - interval '5 minutes')
     order by agendado_para
     limit p_limite
       for update skip locked
  )
  update public.mensagens_agendadas m
     set status = 'enviando',
         atualizado_em = now()
    from candidatas c
   where m.id = c.id
  returning m.*;
end;
$$;

revoke all on function public.reivindicar_mensagens_agendadas(int) from public, anon, authenticated;
grant execute on function public.reivindicar_mensagens_agendadas(int) to service_role;

-- ---------------------------------------------------------------------------
-- Aprovação humana dos rascunhos (piloto da IA no follow-up, issue #52)
-- ---------------------------------------------------------------------------
create or replace function public.envios_para_aprovar()
returns table (
  id uuid, lead_id uuid, lead_nome text, cadencia text, etapa_ordem int,
  partes jsonb, ia_motivo text, criado_em timestamptz
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
  select m.id, m.lead_id, l.nome, c.nome, m.etapa_ordem, m.partes, m.ia_motivo, m.criado_em
    from public.mensagens_agendadas m
    join public.leads l on l.id = m.lead_id
    left join public.inscricoes i on i.id = m.inscricao_id
    left join public.cadencias c on c.id = i.cadencia_id
   where m.status = 'aguardando_aprovacao'
   order by m.criado_em;
end;
$$;

create or replace function public.aprovar_envio(p_id uuid, p_partes jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_ins uuid; v_ordem int;
begin
  if not public.sou_gestao() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_partes is not null and (jsonb_typeof(p_partes) <> 'array' or jsonb_array_length(p_partes) = 0) then
    raise exception 'Texto inválido.' using errcode = '22023';
  end if;
  update public.mensagens_agendadas
     set status = 'pendente',
         partes = coalesce(p_partes, partes),
         aprovado_por = auth.uid(),
         agendado_para = now(),
         atualizado_em = now()
   where id = p_id and status = 'aguardando_aprovacao'
  returning inscricao_id, etapa_ordem into v_ins, v_ordem;
  if not found then
    raise exception 'Envio não está aguardando aprovação.' using errcode = '22023';
  end if;
  if v_ins is not null then
    perform public.registrar_evento_envio(v_ins, 'aprovado', null, v_ordem, p_id);
  end if;
end;
$$;

create or replace function public.rejeitar_envio(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sou_gestao() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  update public.mensagens_agendadas
     set status = 'cancelado', erro = 'rejeitado na aprovação', aprovado_por = auth.uid(), atualizado_em = now()
   where id = p_id and status = 'aguardando_aprovacao';
end;
$$;

revoke all on function public.envios_para_aprovar() from public, anon;
revoke all on function public.aprovar_envio(uuid, jsonb) from public, anon;
revoke all on function public.rejeitar_envio(uuid) from public, anon;
grant execute on function public.envios_para_aprovar() to authenticated;
grant execute on function public.aprovar_envio(uuid, jsonb) to authenticated;
grant execute on function public.rejeitar_envio(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Cadências iniciais (desligadas: a gestão revisa o texto e liga no painel)
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid;
begin
  if not exists (select 1 from public.cadencias where gatilho = 'visita_agendada') then
    insert into public.cadencias (nome, descricao, gatilho, pausa_ao_responder, criado_por)
    values ('Lembretes de visita',
            'Lembrete na véspera e no dia da visita, com pedido de confirmação.',
            'visita_agendada', false, null)
    returning id into v_id;
    insert into public.cadencia_etapas (cadencia_id, ordem, referencia, deslocamento, hora_fixa, template) values
      (v_id, 1, 'visita', interval '-1 day', time '10:00',
       'Oi {{primeiro_nome}}! Passando para lembrar da sua visita ao Moradas de Paraty amanhã, {{data_visita}}, às {{hora_visita}}.||Consegue me confirmar se está tudo certo? É só responder aqui.'),
      (v_id, 2, 'visita', interval '0', time '09:00',
       'Bom dia {{primeiro_nome}}! Hoje é o dia da sua visita, às {{hora_visita}}. Qualquer imprevisto, me avise por aqui que a gente reorganiza.');
  end if;

  if not exists (select 1 from public.cadencias where gatilho = 'primeiro_contato') then
    insert into public.cadencias (nome, descricao, gatilho, status_crm_validos, criado_por)
    values ('Sem resposta ao primeiro contato',
            'Duas tentativas espaçadas para quem preencheu o formulário e não respondeu.',
            'primeiro_contato', array['novo'], null)
    returning id into v_id;
    insert into public.cadencia_etapas (cadencia_id, ordem, referencia, deslocamento, template) values
      (v_id, 1, 'anterior', interval '1 day',
       'Oi {{primeiro_nome}}, tudo bem? Vi que você se interessou pelos lotes do Moradas de Paraty. Ficou alguma dúvida que eu possa ajudar?'),
      (v_id, 2, 'anterior', interval '3 days',
       'Oi {{primeiro_nome}}! Não quero incomodar: se ainda fizer sentido conhecer o Moradas de Paraty, é só me responder aqui. Se preferir não receber mais mensagens, responda SAIR.');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Cron: materializa as etapas vencidas a cada minuto (só SQL, sem HTTP)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'agendar-etapas-cadencias') then
    perform cron.unschedule('agendar-etapas-cadencias');
  end if;
  perform cron.schedule('agendar-etapas-cadencias', '* * * * *', 'select public.agendar_etapas()');
end $$;

notify pgrst, 'reload schema';
