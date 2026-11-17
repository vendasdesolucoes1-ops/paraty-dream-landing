-- SLA sem alerta falso.
--
-- O "esperando agora" contava qualquer coisa que o lead mandasse depois da
-- nossa última resposta. Em 17/11, dos 23 leads "esperando", 18 não pediam
-- resposta nenhuma:
--   • reação com emoji (👍 na mensagem do vendedor) — gravada como mensagem;
--   • mensagem de template / criptografada de sistema (contas de empresa);
--   • "ok", "beleza", "valeu", "obrigado" depois de uma resposta nossa;
--   • lead parado há semanas (vira candidato a "perdido", não SLA estourado).
--
-- Agora só conta como entrada do lead o que pede resposta. A distribuição, as
-- conversas e as mensagens gravadas não mudam: é só a conta do painel.

-- Mensagem do lead que pede resposta?
--   p_depois_de_resposta: já havia resposta nossa antes dela (um "ok" no
--   começo da conversa ainda pede atenção; depois de uma resposta, encerra).
create or replace function public.msg_pede_resposta(
  p_tipo text,
  p_texto text,
  p_depois_de_resposta boolean
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_tipo, '') in (
      'reactionMessage', 'templateMessage', 'secretEncryptedMessage',
      'protocolMessage', 'pollUpdateMessage', 'senderKeyDistributionMessage',
      'messageContextInfo', 'editedMessage', 'keepInChatMessage'
    ) then false
    when p_depois_de_resposta
     and lower(regexp_replace(trim(coalesce(p_texto, '')), '[[:space:][:punct:]]+', ' ', 'g'))
         ~ '^ *(ok|okay|okk+|blz|beleza|belezinha|valeu|vlw|obrigad[oa]|muito obrigad[oa]|obg|brigad[oa]|ta bom|tá bom|ta ok|tá ok|certo|show|perfeito|combinado|fechado|entendi|ótimo|otimo|top|joia|jóia|massa|tranquilo|de nada|valeu deixa p la|deixa pra la|deixa pra lá) *$'
      then false
    -- Figurinha, ou texto só de emoji, depois de uma resposta nossa.
    when p_depois_de_resposta and coalesce(p_tipo, '') = 'stickerMessage'
      then false
    when p_depois_de_resposta
     and coalesce(p_tipo, '') in ('conversation', 'extendedTextMessage')
     and trim(coalesce(p_texto, '')) <> ''
     and coalesce(p_texto, '') !~ '[[:alnum:]]'
      then false
    else true
  end
$$;

grant execute on function public.msg_pede_resposta(text, text, boolean) to authenticated, service_role;

-- Leads parados há mais que isso saem do "esperando agora".
create or replace function public.sla_limite_espera_dias()
returns int
language sql
immutable
as $$ select 30 $$;

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
  -- Entradas do lead que pedem resposta (reação, template, "ok" depois de
  -- uma resposta nossa etc. ficam de fora).
  entradas as (
    select m.lead_id, m.created_at
      from public.whatsapp_messages m
      join base b on b.id = m.lead_id
     where not m.from_me
       and public.msg_pede_resposta(
             m.message_type,
             m.content,
             exists (select 1 from public.whatsapp_messages r
                      where r.lead_id = m.lead_id and r.from_me
                        and r.created_at < m.created_at)
           )
  ),
  marcos as (
    select b.*,
           e.primeira_entrada_em,
           e.ultima_entrada_em,
           (select max(m.created_at) from public.whatsapp_messages m
             where m.lead_id = b.id and m.from_me) as ultima_saida_em
      from base b
      cross join lateral (
        select min(x.created_at) as primeira_entrada_em,
               max(x.created_at) as ultima_entrada_em
          from entradas x
         where x.lead_id = b.id
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
             else (select min(x.created_at) from entradas x
                    where x.lead_id = mc.id
                      and x.created_at > coalesce(mc.ultima_saida_em, '-infinity'::timestamptz)
                      and x.created_at >= now() - make_interval(days => public.sla_limite_espera_dias()))
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

notify pgrst, 'reload schema';
