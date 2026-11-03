-- CRM ligado aos anúncios (etapa 4).
--
-- 1. Duas origens novas de lead: `anuncio_whatsapp` (a primeira mensagem veio de
--    um anúncio de clique para o WhatsApp) e `formulario_meta` (cadastro dos
--    anúncios de formulário da Meta).
-- 2. O lead guarda de qual anúncio e campanha veio.
-- 3. registrar_origem_anuncio(): chamada pelo webhook do WhatsApp quando a
--    mensagem traz contextInfo.externalAdReply. Só marca contato novo e nunca
--    sobrescreve uma origem de anúncio já registrada.
-- 4. Os nomes do anúncio/campanha são preenchidos depois, de hora em hora,
--    quando o anúncio ainda não tinha chegado pela sincronização da Meta.
-- 5. marketing_funil_campanhas(): do investimento à venda, por campanha.
--
-- Tudo idempotente.

-- ---------------------------------------------------------------------------
-- 1. Origens
-- ---------------------------------------------------------------------------
alter table public.leads drop constraint if exists leads_origem_check;
alter table public.leads add constraint leads_origem_check check (
  origem = any (array['lp', 'whatsapp', 'whatsapp_contato', 'indicacao', 'instagram',
                      'google_maps', 'anuncio_whatsapp', 'formulario_meta'])
);

-- ---------------------------------------------------------------------------
-- 2. De qual anúncio o lead veio
-- ---------------------------------------------------------------------------
alter table public.leads
  add column if not exists anuncio_id text,
  add column if not exists anuncio_nome text,
  add column if not exists campanha_id text,
  add column if not exists campanha_nome text,
  add column if not exists ctwa_clid text,
  add column if not exists anuncio_titulo text,
  add column if not exists origem_anuncio_em timestamptz;

create index if not exists leads_campanha_id_idx on public.leads (campanha_id) where campanha_id is not null;

comment on column public.leads.anuncio_id is 'ID do anúncio da Meta que trouxe o lead (externalAdReply.sourceId ou lead ads).';
comment on column public.leads.ctwa_clid is 'Click ID do anúncio de clique para o WhatsApp (externalAdReply.ctwaClid).';

-- ---------------------------------------------------------------------------
-- 3. Registro pelo webhook
-- ---------------------------------------------------------------------------
create or replace function public.registrar_origem_anuncio(
  p_lead_id   uuid,
  p_anuncio_id text,
  p_ctwa_clid text default null,
  p_titulo    text default null,
  p_url       text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_campanha_id text;
  v_campanha_nome text;
  n integer;
begin
  if p_lead_id is null or (p_anuncio_id is null and p_ctwa_clid is null) then
    return false;
  end if;

  select a.name, a.campaign_id, c.name
    into v_nome, v_campanha_id, v_campanha_nome
    from public.meta_anuncios a
    left join public.meta_campanhas c on c.id = a.campaign_id
   where a.id = p_anuncio_id;

  -- Só o contato novo (criado agora pela mensagem) ganha a origem de anúncio;
  -- quem já era lead continua com a origem que tinha.
  update public.leads l
     set anuncio_id        = p_anuncio_id,
         anuncio_nome      = v_nome,
         campanha_id       = v_campanha_id,
         campanha_nome     = v_campanha_nome,
         ctwa_clid         = p_ctwa_clid,
         anuncio_titulo    = left(p_titulo, 200),
         origem_anuncio_em = now(),
         origem            = case when l.origem is null or l.origem = 'whatsapp'
                                  then 'anuncio_whatsapp' else l.origem end
   where l.id = p_lead_id
     and l.anuncio_id is null
     and l.ctwa_clid is null
     and l.created_at > now() - interval '1 hour';
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.registrar_origem_anuncio(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_origem_anuncio(uuid, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Completar nomes de anúncio/campanha de hora em hora
-- ---------------------------------------------------------------------------
create or replace function public.completar_anuncio_dos_leads()
returns integer
language sql
security definer
set search_path = public
as $$
  with feito as (
    update public.leads l
       set anuncio_nome  = a.name,
           campanha_id   = a.campaign_id,
           campanha_nome = c.name
      from public.meta_anuncios a
      left join public.meta_campanhas c on c.id = a.campaign_id
     where l.anuncio_id = a.id
       and (l.anuncio_nome is null or l.campanha_id is null)
    returning 1
  )
  select count(*)::int from feito
$$;

revoke all on function public.completar_anuncio_dos_leads() from public, anon, authenticated;
grant execute on function public.completar_anuncio_dos_leads() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'crm-completar-anuncio') then
    perform cron.unschedule('crm-completar-anuncio');
  end if;
  perform cron.schedule('crm-completar-anuncio', '20 * * * *',
                        'select public.completar_anuncio_dos_leads();');
end $$;

-- ---------------------------------------------------------------------------
-- 5. Funil por campanha: investimento → contatos → … → vendas
-- ---------------------------------------------------------------------------
-- Contatos (Meta) = leads das campanhas de formulário ou conversas das de
-- WhatsApp. Etapas do CRM = leads ligados à campanha, criados no período, pela
-- etapa em que estão hoje (quem está em "visitou" também passou por
-- "agendado" e "qualificado"). Leads de teste e excluídos ficam de fora.
create or replace function public.marketing_funil_campanhas(p_inicio date, p_fim date)
returns table (
  campanha_id      text,
  campanha_nome    text,
  effective_status text,
  tipo_resultado   text,
  investimento     numeric,
  contatos_meta    bigint,
  leads_crm        bigint,
  qualificados     bigint,
  agendados        bigint,
  visitas          bigint,
  propostas        bigint,
  vendas           bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with gasto as (
    select i.campaign_id,
           sum(i.spend) as investimento,
           sum(i.leads) as leads,
           sum(i.mensagens_iniciadas) as mensagens
      from public.meta_insights_diarios i
     where i.data between p_inicio and p_fim
     group by i.campaign_id
  ),
  crm as (
    select l.campanha_id,
           count(*) as total,
           count(*) filter (where l.status_crm in ('qualificado','agendado','visitou','proposta','fechado')) as qualificados,
           count(*) filter (where l.status_crm in ('agendado','visitou','proposta','fechado')) as agendados,
           count(*) filter (where l.status_crm in ('visitou','proposta','fechado')) as visitas,
           count(*) filter (where l.status_crm in ('proposta','fechado')) as propostas,
           count(*) filter (where l.status_crm = 'fechado') as vendas
      from public.leads l
     where l.campanha_id is not null
       and l.deletado_em is null
       and not coalesce(l.is_teste, false)
       and (l.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
     group by l.campanha_id
  )
  select c.id, c.name, c.effective_status, coalesce(r.tipo_resultado, 'clique'),
         coalesce(g.investimento, 0),
         (case coalesce(r.tipo_resultado, 'clique')
            when 'lead' then coalesce(g.leads, 0)
            when 'conversa' then coalesce(g.mensagens, 0)
            else 0 end)::bigint,
         coalesce(k.total, 0)::bigint,
         coalesce(k.qualificados, 0)::bigint,
         coalesce(k.agendados, 0)::bigint,
         coalesce(k.visitas, 0)::bigint,
         coalesce(k.propostas, 0)::bigint,
         coalesce(k.vendas, 0)::bigint
    from public.meta_campanhas c
    left join public.meta_campanha_resultado r on r.campaign_id = c.id
    left join gasto g on g.campaign_id = c.id
    left join crm k on k.campanha_id = c.id
   where p_fim >= p_inicio
     and (coalesce(g.investimento, 0) > 0 or coalesce(k.total, 0) > 0)
   order by coalesce(g.investimento, 0) desc
$$;

revoke all on function public.marketing_funil_campanhas(date, date) from public, anon;
grant execute on function public.marketing_funil_campanhas(date, date) to authenticated;

notify pgrst, 'reload schema';
