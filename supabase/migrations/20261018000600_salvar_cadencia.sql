-- Gravação atômica de uma cadência com as etapas, e contagem de inscrições
-- por status numa consulta só (painel de follow-up).
--
-- Antes o painel gravava etapa por etapa, passando por uma ordem temporária
-- para não violar unique (cadencia_id, ordem): uma falha no meio deixava a
-- cadência com etapas fora de ordem, e o agendador podia ver o estado
-- intermediário. Aqui é uma transação só.

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
  if coalesce(p_cadencia->>'gatilho', '') not in ('manual', 'primeiro_contato', 'visita_agendada') then
    raise exception 'Gatilho inválido.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_etapas) <> 'array' or jsonb_array_length(p_etapas) = 0 then
    raise exception 'A cadência precisa de ao menos uma etapa.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.cadencias (nome, descricao, gatilho, ativa, pausa_ao_responder, status_crm_validos, instance_id)
    values (
      trim(p_cadencia->>'nome'),
      nullif(trim(p_cadencia->>'descricao'), ''),
      p_cadencia->>'gatilho',
      coalesce((p_cadencia->>'ativa')::boolean, false),
      coalesce((p_cadencia->>'pausa_ao_responder')::boolean, true),
      case when jsonb_typeof(p_cadencia->'status_crm_validos') = 'array'
            and jsonb_array_length(p_cadencia->'status_crm_validos') > 0
           then array(select jsonb_array_elements_text(p_cadencia->'status_crm_validos')) end,
      nullif(p_cadencia->>'instance_id', '')::uuid)
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
      atualizado_em = now()
    where id = v_id and gatilho <> 'campanha';
    if not found then
      raise exception 'Cadência não encontrada.' using errcode = '22023';
    end if;
  end if;

  -- Ordem temporária alta (não colide com a final) e depois a definitiva,
  -- tudo dentro desta transação.
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

create or replace function public.contagem_inscricoes(p_cadencia_id uuid)
returns table (status text, total bigint)
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
  select i.status, count(*) from public.inscricoes i where i.cadencia_id = p_cadencia_id group by 1;
end;
$$;

revoke all on function public.salvar_cadencia(jsonb, jsonb) from public, anon;
revoke all on function public.contagem_inscricoes(uuid) from public, anon;
grant execute on function public.salvar_cadencia(jsonb, jsonb) to authenticated;
grant execute on function public.contagem_inscricoes(uuid) to authenticated;

notify pgrst, 'reload schema';
