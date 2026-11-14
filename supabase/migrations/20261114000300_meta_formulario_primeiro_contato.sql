-- Primeira mensagem da Sophia para quem preenche o Formulário Meta.
--
-- Até aqui só o formulário do site (enrich-lead) puxava conversa. O lead do
-- formulário instantâneo do Meta só gerava aviso ao corretor: se o corretor
-- não chamasse, ninguém chamava (Gabriela, 13/11, "quero visitar", nenhuma
-- mensagem).
--
-- Agora, quando o formulário é gravado (webhook ou importação), entra na fila
-- um "primeiro_contato" com o mesmo mecanismo do site: processar-fila-mensagens
-- envia, respeita a IA ligada (ai_agents.is_active) e não aborda quem conversou
-- nas últimas 2 horas (podeAbordar), o que cobre quem clicou no WhatsApp do
-- anúncio e já mandou "Preenchi seu formulário...".
--
-- Travas: só formulários das últimas 24 h (importação de histórico não manda
-- nada), sem teste, interno, bloqueado ou sem interesse; fora das 8h-21h de
-- Brasília a mensagem espera a manhã seguinte.

create or replace function public.abertura_formulario_meta(p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l record;
  v_nome text;
  v_partes jsonb;
begin
  select nome, finalidade, quer_visitar into l from public.leads where id = p_lead_id;
  v_nome := split_part(trim(coalesce(l.nome, '')), ' ', 1);
  if v_nome !~ '^[[:alpha:]][[:alpha:]''-]{0,19}$' then
    v_nome := null;
  else
    v_nome := upper(left(v_nome, 1)) || lower(substr(v_nome, 2));
  end if;

  v_partes := jsonb_build_array(
    case when v_nome is null then 'Oi! Aqui é a Sophia, do Moradas de Paraty.'
         else 'Oi, ' || v_nome || '! Aqui é a Sophia, do Moradas de Paraty.' end,
    'Vi que você preencheu nosso formulário sobre os lotes.',
    case
      when coalesce(l.quer_visitar, '') ilike 'sim%' then
        'Você marcou que quer conhecer o loteamento. Quer que eu veja os horários de visita pra você?'
      when nullif(trim(l.finalidade), '') is not null then
        'Você marcou que o lote seria para ' || lower(trim(l.finalidade))
        || '. Já tem um tamanho de terreno em mente?'
      else 'Você tá pensando em morar, investir ou usar nas temporadas?'
    end);
  return v_partes;
end;
$$;

revoke all on function public.abertura_formulario_meta(uuid) from public, anon, authenticated;

create or replace function public.meta_formulario_primeiro_contato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  v_quando timestamptz := now() + make_interval(secs => 180 + floor(random() * 180)::int);
  v_hora int;
begin
  if new.status <> 'gravado' or new.lead_id is null
     or (tg_op = 'UPDATE' and old.status = 'gravado')
     or coalesce(new.criado_meta_em, now()) < now() - interval '24 hours' then
    return null;
  end if;

  select id, telefone, is_teste, interno, contato_bloqueado, sem_interesse_em, deletado_em
    into l from public.leads where id = new.lead_id;
  if l.id is null or nullif(l.telefone, '') is null
     or coalesce(l.is_teste, false) or coalesce(l.interno, false)
     or coalesce(l.contato_bloqueado, false) or l.sem_interesse_em is not null
     or l.deletado_em is not null then
    return null;
  end if;

  -- Já está conversando (clicou no WhatsApp do anúncio): a Sophia já respondeu.
  if exists (select 1 from public.whatsapp_messages w
              where w.lead_id = l.id and w.created_at > now() - interval '2 hours') then
    return null;
  end if;

  -- Madrugada: espera as 8h30 de Brasília.
  v_hora := extract(hour from v_quando at time zone 'America/Sao_Paulo');
  if v_hora < 8 or v_hora >= 21 then
    v_quando := (date_trunc('day', v_quando at time zone 'America/Sao_Paulo')
                 + case when v_hora >= 21 then interval '1 day' else interval '0' end
                 + interval '8 hours 30 minutes') at time zone 'America/Sao_Paulo';
  end if;

  insert into public.mensagens_agendadas (lead_id, tipo, telefone, partes, agendado_para)
  values (l.id, 'primeiro_contato', l.telefone, public.abertura_formulario_meta(l.id), v_quando)
  on conflict do nothing;
  return null;
end;
$$;

revoke all on function public.meta_formulario_primeiro_contato() from public, anon, authenticated;

drop trigger if exists meta_formulario_primeiro_contato on public.meta_leads_formulario;
create trigger meta_formulario_primeiro_contato
  after insert or update of status on public.meta_leads_formulario
  for each row execute function public.meta_formulario_primeiro_contato();
