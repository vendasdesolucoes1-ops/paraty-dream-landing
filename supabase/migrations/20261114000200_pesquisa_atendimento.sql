-- Pesquisa de atendimento no follow-up, e as respostas dos leads à vista.
--
-- Dois gatilhos novos de cadência:
--   pos_atendimento: X tempo depois de o lead ser entregue a um corretor.
--     Os corretores atendem pelo celular deles (a conversa não passa por aqui),
--     então a pesquisa também confere se o corretor chamou mesmo.
--   pos_visita: X tempo depois de a visita ser marcada como realizada.
--
-- cadencias.envio_automatico: desligado, cada mensagem da cadência cai na aba
-- Aprovação antes de sair (o toggle "automático ou não").
--
-- A resposta do lead vira uma linha em pesquisas_satisfacao (nota 1 a 5,
-- comentário, dúvida, se foi atendido). Nota até 2 ou "ninguém me chamou"
-- avisa a gestão; dúvida avisa o corretor. Uma pesquisa por lead a cada 30 dias.
--
-- followup_respostas: o que os leads responderam às cadências e campanhas
-- (a classificação automática falhou por semanas e nada disso aparecia).

-- ---------------------------------------------------------------------------
-- Cadências: gatilhos novos e envio automático

alter table public.cadencias drop constraint if exists cadencias_gatilho_check;
alter table public.cadencias add constraint cadencias_gatilho_check
  check (gatilho in ('manual', 'primeiro_contato', 'visita_agendada', 'campanha',
                     'pos_visita', 'pos_atendimento'));

alter table public.cadencias add column if not exists envio_automatico boolean not null default true;
comment on column public.cadencias.envio_automatico is
  'Desligado: cada mensagem vai para a aba Aprovação antes de sair.';

create or replace function public.gatilho_de_pesquisa(p_gatilho text)
returns boolean
language sql
immutable
as $$ select p_gatilho in ('pos_visita', 'pos_atendimento') $$;

-- ---------------------------------------------------------------------------
-- Respostas

create table if not exists public.pesquisas_satisfacao (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  inscricao_id  uuid references public.inscricoes(id) on delete set null,
  cadencia_id   uuid references public.cadencias(id) on delete set null,
  vendedor_id   uuid references public.vendedores(id) on delete set null,
  gatilho       text not null,
  nota          int check (nota between 1 and 5),
  foi_atendido  boolean,
  tem_duvida    boolean not null default false,
  comentario    text,
  respondida_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);
create unique index if not exists pesquisas_satisfacao_inscricao_idx
  on public.pesquisas_satisfacao (inscricao_id) where inscricao_id is not null;
create index if not exists pesquisas_satisfacao_vendedor_idx
  on public.pesquisas_satisfacao (vendedor_id, respondida_em desc);
create index if not exists pesquisas_satisfacao_lead_idx
  on public.pesquisas_satisfacao (lead_id, respondida_em desc);

alter table public.pesquisas_satisfacao enable row level security;
drop policy if exists pesquisas_satisfacao_select on public.pesquisas_satisfacao;
create policy pesquisas_satisfacao_select on public.pesquisas_satisfacao
  for select to authenticated
  using (public.sou_gestao() or vendedor_id = public.meu_vendedor_id());
revoke insert, update, delete on public.pesquisas_satisfacao from anon, authenticated;
grant select on public.pesquisas_satisfacao to authenticated;

-- ---------------------------------------------------------------------------
-- Leitura da resposta (sem IA: número ou palavra, determinístico)

create or replace function public.ler_nota_pesquisa(p_texto text)
returns int
language plpgsql
immutable
as $$
declare
  t text := lower(coalesce(p_texto, ''));
  m text[];
begin
  -- Dígito solto: "m2", "360" e "1º" não contam.
  m := regexp_match(t, '(?:^|[^0-9a-z])([1-5])(?:[^0-9a-zº°]|$)');
  if m is not null then
    return m[1]::int;
  end if;
  if t ~ '(p[eé]ssim|horr[ií]vel|terr[ií]vel|n[aã]o gostei)' then return 1; end if;
  if t ~ '(ruim|fraco|demorou|demorado)' then return 2; end if;
  if t ~ '(regular|mais ou menos|razo[aá]vel|ok\M)' then return 3; end if;
  if t ~ '([oó]tim|excelente|perfeit|maravilh|nota dez|muito bo[am]|top\M)' then return 5; end if;
  if t ~ '(\mbom\M|\mboa\M|gostei|legal)' then return 4; end if;
  return null;
end;
$$;

create or replace function public.ler_atendimento_pesquisa(p_texto text)
returns boolean
language plpgsql
immutable
as $$
declare
  t text := lower(coalesce(p_texto, ''));
begin
  if t ~ '(ningu[eé]m|ainda n[aã]o|n[aã]o (me )?(chamou|chamaram|ligou|ligaram|procurou|procuraram|respondeu|retornou|falou))' then
    return false;
  end if;
  if t ~ '(\msim\M|chamou|ligou|me atendeu|fui atendid|falei com|falou comigo|j[aá] conversamos|me respondeu)' then
    return true;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quem pode receber uma pesquisa agora

create or replace function public.pesquisa_pode_inscrever(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.leads l
     where l.id = p_lead_id
       and l.deletado_em is null
       and not coalesce(l.is_teste, false) and not coalesce(l.interno, false)
       and not coalesce(l.contato_bloqueado, false) and l.sem_interesse_em is null
       and nullif(l.telefone, '') is not null
       and l.status_crm <> 'perdido'
  )
  and not exists (
    select 1 from public.inscricoes i join public.cadencias c on c.id = i.cadencia_id
     where i.lead_id = p_lead_id and public.gatilho_de_pesquisa(c.gatilho)
       and i.criado_em > now() - interval '30 days'
  )
$$;

revoke all on function public.pesquisa_pode_inscrever(uuid) from public, anon, authenticated;

-- Lead entregue a um corretor: entra na pesquisa pós-atendimento.
create or replace function public.cadencias_lead_atribuido()
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
  if not public.pesquisa_pode_inscrever(new.id) then
    return null;
  end if;
  perform public._inscrever(c.id, new.id)
     from public.cadencias c
    where c.gatilho = 'pos_atendimento' and c.ativa and c.pausada_em is null;
  return null;
end;
$$;

revoke all on function public.cadencias_lead_atribuido() from public, anon, authenticated;

drop trigger if exists cadencias_lead_atribuido on public.leads;
create trigger cadencias_lead_atribuido
  after insert or update of vendedor_id on public.leads
  for each row execute function public.cadencias_lead_atribuido();

-- ---------------------------------------------------------------------------
-- {{vendedor}}: primeiro nome do corretor do lead.

create or replace function public.renderizar_template(p_template text, p_lead_id uuid, p_visita_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nome   text;
  v_vend   text;
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

  if position('{{vendedor}}' in v_texto) > 0 then
    select split_part(trim(coalesce(v.nome, '')), ' ', 1) into v_vend
      from public.leads l join public.vendedores v on v.id = l.vendedor_id
     where l.id = p_lead_id;
    v_texto := replace(v_texto, '{{vendedor}}', coalesce(nullif(v_vend, ''), 'nosso corretor'));
  end if;

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

-- ---------------------------------------------------------------------------
-- Agendador: envio automático desligado vai para aprovação; pesquisa termina
-- como concluída e não conta tentativas sem resposta.

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
  v_aprovar boolean;
begin
  select * into v_regras from public.regras_envio where id;

  update public.mensagens_agendadas m
     set status = 'cancelado', erro = 'visita já passou', atualizado_em = now()
    from public.inscricoes i join public.visitas v on v.id = i.visita_id
    join public.cadencias c on c.id = i.cadencia_id
   where m.inscricao_id = i.id
     and c.gatilho = 'visita_agendada'
     and m.status in ('pendente', 'aguardando_aprovacao')
     and v.data_hora <= now();

  for r in
    select i.*, c.gatilho, c.instance_id as cadencia_instancia, c.envio_automatico
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
        case when r.gatilho in ('visita_agendada', 'campanha')
               or public.gatilho_de_pesquisa(r.gatilho) then 'concluida' else 'sem_resposta' end,
        'fim das etapas');
      continue;
    end if;

    if r.gatilho not in ('visita_agendada', 'campanha')
       and not public.gatilho_de_pesquisa(r.gatilho)
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

    v_aprovar := v_etapa.modo = 'ia_aprovacao' or not coalesce(r.envio_automatico, true);

    v_msg := null;
    insert into public.mensagens_agendadas (
      lead_id, tipo, telefone, partes, midia, agendado_para, status,
      instance_id, inscricao_id, etapa_ordem, chave_idempotencia
    )
    select r.lead_id,
           case when r.gatilho = 'campanha' then 'campanha' else 'cadencia' end,
           l.telefone, v_partes, v_etapa.midia, now(),
           case when v_aprovar then 'aguardando_aprovacao' else 'pendente' end,
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
      case when v_aprovar then 'aguardando_aprovacao' else 'enfileirado' end,
      null, v_prox.ordem, v_msg);
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;

revoke all on function public.agendar_etapas(int) from public, anon, authenticated;
grant execute on function public.agendar_etapas(int) to service_role;

-- ---------------------------------------------------------------------------
-- Respostas: pesquisa não pausa nem é pausada por takeover; a resposta é lida.

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
    if not exists (select 1 from public.envios_eventos e
                    where e.inscricao_id = r.id and e.evento = 'respondeu'
                      and e.criado_em > now() - interval '6 hours') then
      perform public.registrar_evento_envio(r.id, 'respondeu');
    end if;
    update public.inscricoes set tentativas_sem_resposta = 0 where id = r.id;
    if r.pausa_ao_responder and r.gatilho <> 'visita_agendada'
       and not public.gatilho_de_pesquisa(r.gatilho) then
      perform public.mudar_inscricao(r.id, 'pausada', 'lead respondeu');
    end if;
  end loop;
  return new;
end;
$$;

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
      join public.cadencias cd on cd.id = i.cadencia_id
     where c.id = new.conversation_id
       and not public.gatilho_de_pesquisa(cd.gatilho)
  loop
    perform public.mudar_inscricao(r.id, 'pausada', 'takeover humano');
  end loop;
  return new;
end;
$$;

-- Visita: nova visita não "converte" pesquisa; visita realizada inicia a
-- pesquisa pós-visita.
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
         and not public.gatilho_de_pesquisa(c.gatilho)
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

  if new.status in ('agendada', 'confirmada') and old.status not in ('agendada', 'confirmada')
     and new.data_hora > now() then
    perform public._inscrever(c.id, new.lead_id, new.id)
       from public.cadencias c
      where c.gatilho = 'visita_agendada' and c.ativa and c.pausada_em is null;
  end if;

  if new.status = 'realizada' and old.status is distinct from 'realizada'
     and public.pesquisa_pode_inscrever(new.lead_id) then
    perform public._inscrever(c.id, new.lead_id, new.id)
       from public.cadencias c
      where c.gatilho = 'pos_visita' and c.ativa and c.pausada_em is null;
  end if;

  for r in select i.id from public.inscricoes i
             join public.cadencias c on c.id = i.cadencia_id
            where i.visita_id = new.id and i.status in ('ativa', 'pausada')
              and c.gatilho = 'visita_agendada'
  loop
    if new.status = 'cancelada' then
      perform public.mudar_inscricao(r.id, 'cancelada', 'visita cancelada');
    elsif new.status in ('realizada', 'no_show') then
      perform public.mudar_inscricao(r.id, 'concluida', 'visita ' || new.status);
    elsif new.data_hora is distinct from old.data_hora then
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

-- A mensagem do lead depois da pesquisa vira resposta registrada.
create or replace function public.pesquisa_registrar_resposta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_insc record;
  v_texto text := btrim(coalesce(new.content, ''));
  v_nota int;
  v_atendido boolean;
  v_duvida boolean;
  v_pesq public.pesquisas_satisfacao;
  v_lead record;
  v_alerta text;
begin
  if new.from_me or new.lead_id is null or v_texto = '' then
    return new;
  end if;

  -- A pesquisa mais recente enviada a este lead nos últimos 3 dias.
  select i.id, i.cadencia_id, c.gatilho, i.ultimo_envio_em into v_insc
    from public.inscricoes i join public.cadencias c on c.id = i.cadencia_id
   where i.lead_id = new.lead_id and public.gatilho_de_pesquisa(c.gatilho)
     and i.ultimo_envio_em is not null
     and i.ultimo_envio_em > now() - interval '3 days'
     and i.ultimo_envio_em <= new.created_at
   order by i.ultimo_envio_em desc
   limit 1;
  if v_insc.id is null then
    return new;
  end if;

  select * into v_pesq from public.pesquisas_satisfacao where inscricao_id = v_insc.id;
  -- Já respondida há mais de 1 hora: conversa seguiu, não é mais a pesquisa.
  if v_pesq.id is not null and v_pesq.atualizada_em < now() - interval '1 hour' then
    return new;
  end if;

  v_nota := public.ler_nota_pesquisa(v_texto);
  v_atendido := case when v_insc.gatilho = 'pos_atendimento'
                     then public.ler_atendimento_pesquisa(v_texto) end;
  v_duvida := v_texto like '%?%' or lower(v_texto) ~ 'd[uú]vida';
  select id, nome, vendedor_id into v_lead from public.leads where id = new.lead_id;

  if v_pesq.id is null then
    insert into public.pesquisas_satisfacao
      (lead_id, inscricao_id, cadencia_id, vendedor_id, gatilho, nota, foi_atendido, tem_duvida, comentario)
    values (new.lead_id, v_insc.id, v_insc.cadencia_id, v_lead.vendedor_id, v_insc.gatilho,
            v_nota, v_atendido, v_duvida, left(v_texto, 1000))
    returning * into v_pesq;
  else
    update public.pesquisas_satisfacao
       set nota = coalesce(nota, v_nota),
           foi_atendido = coalesce(foi_atendido, v_atendido),
           tem_duvida = tem_duvida or v_duvida,
           comentario = left(coalesce(comentario || E'\n', '') || v_texto, 2000),
           atualizada_em = now()
     where id = v_pesq.id
    returning * into v_pesq;
  end if;

  update public.inscricoes set status = 'concluida', motivo_saida = 'respondeu a pesquisa',
         encerrada_em = coalesce(encerrada_em, now()), proxima_em = null, atualizado_em = now()
   where id = v_insc.id and status in ('ativa', 'pausada');

  insert into public.interacoes (lead_id, tipo, canal, conteudo)
  values (new.lead_id, 'sistema', 'pesquisa',
          'Pesquisa de atendimento: ' || coalesce('nota ' || v_nota, 'sem nota')
          || case when v_atendido = false then ' · disse que não foi atendido' else '' end
          || case when v_duvida then ' · ficou com dúvida' else '' end
          || ' — "' || left(v_texto, 200) || '"');

  -- Alertas: só na primeira leitura de cada sinal.
  if (v_nota is not null and v_nota <= 2 and v_pesq.atualizada_em = v_pesq.respondida_em)
     or (v_atendido = false) then
    v_alerta := coalesce(v_lead.nome, 'Lead')
      || case when v_atendido = false then ' disse que o corretor ainda não chamou.'
              else ' avaliou o atendimento com nota ' || v_nota || '.' end;
    perform public.notificar_gestao('pesquisa_alerta', 'Pesquisa de atendimento', v_alerta,
                                    '/dashboard/crm?lead=' || new.lead_id);
  end if;
  if v_duvida and v_lead.vendedor_id is not null then
    insert into public.notifications (user_id, type, title, body, link)
    select v.profile_id, 'pesquisa_duvida', 'Lead com dúvida',
           coalesce(v_lead.nome, 'Um lead') || ' respondeu a pesquisa com uma dúvida: "'
           || left(v_texto, 160) || '"',
           '/dashboard/crm?lead=' || new.lead_id
      from public.vendedores v
     where v.id = v_lead.vendedor_id and v.profile_id is not null;
  end if;
  return new;
end;
$$;

revoke all on function public.pesquisa_registrar_resposta() from public, anon, authenticated;

drop trigger if exists pesquisa_registrar_resposta on public.whatsapp_messages;
create trigger pesquisa_registrar_resposta
  after insert on public.whatsapp_messages
  for each row execute function public.pesquisa_registrar_resposta();

-- ---------------------------------------------------------------------------
-- Painel: gravar cadência com os gatilhos novos e o envio automático.

create or replace function public.salvar_cadencia(p_cadencia jsonb, p_etapas jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid := nullif(p_cadencia->>'id', '')::uuid;
  v_etapa jsonb;
  v_ordem int := 0;
  v_ids   uuid[] := '{}';
  v_eid   uuid;
begin
  if not public.sou_gestao() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if coalesce(trim(p_cadencia->>'nome'), '') = '' then
    raise exception 'Dê um nome à cadência.' using errcode = '22023';
  end if;
  if coalesce(p_cadencia->>'gatilho', '') not in
     ('manual', 'primeiro_contato', 'visita_agendada', 'pos_visita', 'pos_atendimento') then
    raise exception 'Gatilho inválido.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_etapas) <> 'array' or jsonb_array_length(p_etapas) = 0 then
    raise exception 'A cadência precisa de ao menos uma etapa.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.cadencias (nome, descricao, gatilho, ativa, pausa_ao_responder,
                                  status_crm_validos, instance_id, envio_automatico)
    values (
      trim(p_cadencia->>'nome'),
      nullif(trim(p_cadencia->>'descricao'), ''),
      p_cadencia->>'gatilho',
      coalesce((p_cadencia->>'ativa')::boolean, false),
      coalesce((p_cadencia->>'pausa_ao_responder')::boolean, true),
      case when jsonb_typeof(p_cadencia->'status_crm_validos') = 'array'
            and jsonb_array_length(p_cadencia->'status_crm_validos') > 0
           then array(select jsonb_array_elements_text(p_cadencia->'status_crm_validos')) end,
      nullif(p_cadencia->>'instance_id', '')::uuid,
      coalesce((p_cadencia->>'envio_automatico')::boolean, true))
    returning id into v_id;
  else
    update public.cadencias set
      nome = trim(p_cadencia->>'nome'),
      descricao = nullif(trim(p_cadencia->>'descricao'), ''),
      gatilho = p_cadencia->>'gatilho',
      ativa = coalesce((p_cadencia->>'ativa')::boolean, false),
      pausa_ao_responder = coalesce((p_cadencia->>'pausa_ao_responder')::boolean, true),
      status_crm_validos =
        case when jsonb_typeof(p_cadencia->'status_crm_validos') = 'array'
              and jsonb_array_length(p_cadencia->'status_crm_validos') > 0
             then array(select jsonb_array_elements_text(p_cadencia->'status_crm_validos')) end,
      instance_id = nullif(p_cadencia->>'instance_id', '')::uuid,
      envio_automatico = coalesce((p_cadencia->>'envio_automatico')::boolean, envio_automatico),
      atualizado_em = now()
    where id = v_id and gatilho <> 'campanha';
    if not found then
      raise exception 'Cadência não encontrada.' using errcode = '22023';
    end if;
  end if;

  update public.cadencia_etapas set ordem = ordem + 100000 where cadencia_id = v_id;

  for v_etapa in select * from jsonb_array_elements(p_etapas) loop
    v_ordem := v_ordem + 1;
    insert into public.cadencia_etapas as e
      (id, cadencia_id, ordem, referencia, deslocamento, hora_fixa, modo, template, midia, ativa)
    values (
      coalesce(nullif(v_etapa->>'id', '')::uuid, gen_random_uuid()),
      v_id, v_ordem,
      coalesce(v_etapa->>'referencia', 'anterior'),
      coalesce(nullif(v_etapa->>'deslocamento', ''), '1 day')::interval,
      nullif(v_etapa->>'hora_fixa', '')::time,
      coalesce(v_etapa->>'modo', 'template'),
      coalesce(v_etapa->>'template', ''),
      case when jsonb_typeof(v_etapa->'midia') = 'object' then v_etapa->'midia' end,
      coalesce((v_etapa->>'ativa')::boolean, true))
    on conflict (id) do update set
      ordem = excluded.ordem, referencia = excluded.referencia, deslocamento = excluded.deslocamento,
      hora_fixa = excluded.hora_fixa, modo = excluded.modo, template = excluded.template,
      midia = excluded.midia, ativa = excluded.ativa
    where e.cadencia_id = v_id
    returning id into v_eid;
    if v_eid is null then
      raise exception 'Etapa de outra cadência.' using errcode = '22023';
    end if;
    v_ids := v_ids || v_eid;
  end loop;

  delete from public.cadencia_etapas where cadencia_id = v_id and not (id = any (v_ids));
  return v_id;
end;
$$;

revoke all on function public.salvar_cadencia(jsonb, jsonb) from public, anon;
grant execute on function public.salvar_cadencia(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Painel: resumo da pesquisa e respostas dos leads.

create or replace function public.pesquisas_resumo(p_dias int default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_desde timestamptz := now() - make_interval(days => greatest(1, least(p_dias, 365)));
begin
  if not public.sou_gestao() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'enviadas', (select count(*) from public.inscricoes i join public.cadencias c on c.id = i.cadencia_id
                  where public.gatilho_de_pesquisa(c.gatilho) and i.ultimo_envio_em >= v_desde),
    'respondidas', (select count(*) from public.pesquisas_satisfacao where respondida_em >= v_desde),
    'media', (select round(avg(nota)::numeric, 1) from public.pesquisas_satisfacao
               where respondida_em >= v_desde and nota is not null),
    'nao_atendidos', (select count(*) from public.pesquisas_satisfacao
                       where respondida_em >= v_desde and foi_atendido = false),
    'com_duvida', (select count(*) from public.pesquisas_satisfacao
                    where respondida_em >= v_desde and tem_duvida),
    'por_vendedor', coalesce((
      select jsonb_agg(x order by x.media nulls last) from (
        select coalesce(v.nome, 'Sem corretor') as nome, count(*) as respostas,
               round(avg(p.nota)::numeric, 1) as media,
               count(*) filter (where p.foi_atendido = false) as nao_atendidos
          from public.pesquisas_satisfacao p left join public.vendedores v on v.id = p.vendedor_id
         where p.respondida_em >= v_desde
         group by 1) x), '[]'::jsonb),
    'recentes', coalesce((
      select jsonb_agg(x order by x.respondida_em desc) from (
        select p.lead_id, l.nome as lead, v.nome as vendedor, p.gatilho, p.nota, p.foi_atendido,
               p.tem_duvida, p.comentario, p.respondida_em
          from public.pesquisas_satisfacao p
          join public.leads l on l.id = p.lead_id
          left join public.vendedores v on v.id = p.vendedor_id
         where p.respondida_em >= v_desde
         order by p.respondida_em desc
         limit 50) x), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.pesquisas_resumo(int) from public, anon;
grant execute on function public.pesquisas_resumo(int) to authenticated;

-- O que os leads responderam depois de uma mensagem de cadência ou campanha.
create or replace function public.followup_respostas(p_dias int default 7)
returns table (
  lead_id uuid, lead text, telefone text, vendedor text, origem text,
  resposta text, respondida_em timestamptz, intencao text
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
  select distinct on (w.lead_id)
         w.lead_id, l.nome, l.telefone, v.nome,
         coalesce(c.nome, 'Follow-up'),
         left(w.content, 500), w.created_at,
         (select s.intencao from public.lead_sinais s
           where s.lead_id = w.lead_id and s.criado_em >= w.created_at - interval '1 minute'
           order by s.criado_em limit 1)
    from public.whatsapp_messages w
    join public.leads l on l.id = w.lead_id
    left join public.vendedores v on v.id = l.vendedor_id
    join lateral (
      select m.inscricao_id, m.enviado_em from public.mensagens_agendadas m
       where m.lead_id = w.lead_id and m.status = 'enviado'
         and m.tipo in ('cadencia', 'campanha')
         and m.enviado_em <= w.created_at
         and m.enviado_em > w.created_at - interval '72 hours'
       order by m.enviado_em desc limit 1
    ) env on true
    left join public.inscricoes i on i.id = env.inscricao_id
    left join public.cadencias c on c.id = i.cadencia_id
   where not w.from_me
     and nullif(btrim(w.content), '') is not null
     and w.created_at > now() - make_interval(days => greatest(1, least(p_dias, 60)))
     and l.deletado_em is null
   order by w.lead_id, w.created_at desc;
end;
$$;

revoke all on function public.followup_respostas(int) from public, anon;
grant execute on function public.followup_respostas(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Duas pesquisas prontas, desligadas e com aprovação manual: a gestão revisa
-- o texto e liga quando quiser.

insert into public.cadencias (nome, descricao, gatilho, ativa, pausa_ao_responder, envio_automatico)
select 'Pesquisa pós-atendimento',
       'Um dia depois de o lead ser entregue a um corretor: confere se ele foi chamado e como foi.',
       'pos_atendimento', false, false, false
where not exists (select 1 from public.cadencias where gatilho = 'pos_atendimento');

insert into public.cadencia_etapas (cadencia_id, ordem, referencia, deslocamento, hora_fixa, modo, template)
select c.id, 1, 'inscricao', interval '1 day', time '10:00', 'template',
       'Oi {{primeiro_nome}}, aqui é do Moradas de Paraty. O {{vendedor}} já conseguiu falar com você? || De 1 a 5, como você avalia o atendimento até agora? Se ficou alguma dúvida, é só mandar por aqui.'
  from public.cadencias c
 where c.gatilho = 'pos_atendimento'
   and not exists (select 1 from public.cadencia_etapas e where e.cadencia_id = c.id);

insert into public.cadencias (nome, descricao, gatilho, ativa, pausa_ao_responder, envio_automatico)
select 'Pesquisa pós-visita',
       'Um dia depois da visita realizada: como foi a experiência e se ficou alguma dúvida.',
       'pos_visita', false, false, false
where not exists (select 1 from public.cadencias where gatilho = 'pos_visita');

insert into public.cadencia_etapas (cadencia_id, ordem, referencia, deslocamento, hora_fixa, modo, template)
select c.id, 1, 'inscricao', interval '1 day', time '10:00', 'template',
       'Oi {{primeiro_nome}}, obrigado pela visita ao Moradas de Paraty! || De 1 a 5, como foi sua experiência com o {{vendedor}}? Ficou alguma dúvida sobre os lotes?'
  from public.cadencias c
 where c.gatilho = 'pos_visita'
   and not exists (select 1 from public.cadencia_etapas e where e.cadencia_id = c.id);

notify pgrst, 'reload schema';
