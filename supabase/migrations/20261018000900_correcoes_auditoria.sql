-- Correções da auditoria de contratos (CRM, follow-up e Sophia).

-- 1. Um agente por instância. Com duas linhas, as buscas por instância
--    (.maybeSingle) erram e a Sophia para em silêncio. Duplicadas antigas são
--    desligadas da instância (não apagadas: conversas apontam para elas), e
--    fica a mais antiga.
update public.ai_agents a
   set instance_id = null, is_active = false
 where a.instance_id is not null
   and exists (
     select 1 from public.ai_agents b
      where b.instance_id = a.instance_id
        and (b.created_at, b.id) < (a.created_at, a.id)
   );
create unique index if not exists ai_agents_uma_por_instancia
  on public.ai_agents (instance_id) where instance_id is not null;

-- 2. Aprovar um rascunho de follow-up quando o lead já tem outra mensagem do
--    mesmo tipo na fila batia no índice único de ativos e aparecia como erro
--    técnico. Agora explica o que fazer.
create or replace function public.aprovar_envio(p_id uuid, p_partes jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_ins uuid; v_ordem int; v_lead uuid; v_tipo text;
begin
  if not public.sou_gestao() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_partes is not null and (jsonb_typeof(p_partes) <> 'array' or jsonb_array_length(p_partes) = 0) then
    raise exception 'Texto inválido.' using errcode = '22023';
  end if;
  select lead_id, tipo into v_lead, v_tipo
    from public.mensagens_agendadas
   where id = p_id and status = 'aguardando_aprovacao';
  if not found then
    raise exception 'Envio não está aguardando aprovação.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.mensagens_agendadas
     where lead_id = v_lead and tipo = v_tipo and status in ('pendente', 'enviando') and id <> p_id
  ) then
    raise exception 'Este lead já tem outra mensagem de follow-up na fila. Aprove de novo depois que ela for enviada.'
      using errcode = '22023';
  end if;
  update public.mensagens_agendadas
     set status = 'pendente',
         partes = coalesce(p_partes, partes),
         aprovado_por = auth.uid(),
         agendado_para = now(),
         atualizado_em = now()
   where id = p_id and status = 'aguardando_aprovacao'
  returning inscricao_id, etapa_ordem into v_ins, v_ordem;
  if v_ins is not null then
    perform public.registrar_evento_envio(v_ins, 'aprovado', null, v_ordem, p_id);
  end if;
end;
$$;

-- 3. Colunas que o código usa e que só existiam em produção (criadas fora das
--    migrations). Sem elas um ambiente novo, como o staging, quebra nesses
--    caminhos. Em produção nada muda: "if not exists".
alter table public.imagery_slides
  add column if not exists image_source text,
  add column if not exists acervo_id uuid;
alter table public.processos
  add column if not exists observacoes text,
  add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table public.whatsapp_messages
  add column if not exists media_url text,
  add column if not exists mime_type text,
  add column if not exists duration_seconds int;

-- 4. Campanha com até 5.000 leads: inscrever 20.000 numa chamada chegava perto do
--    limite de tempo do Supabase para o painel (~8 s). Com 150 envios/dia por
--    número, 5.000 já são semanas de envio.
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
  if array_length(p_lead_ids, 1) > 5000 then
    raise exception 'Campanha limitada a 5.000 leads (o limite diário do número já espalha os envios por semanas).' using errcode = '22023';
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

notify pgrst, 'reload schema';
