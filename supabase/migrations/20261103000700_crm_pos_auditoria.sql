-- Correções pós-auditoria de usabilidade (estrutura). As alterações em massa
-- de dados que pedem OK do usuário (devolver leads do vendedor inativo, marcar
-- internos, mover para Nutrição, limpar nomes, recalcular score) NÃO estão
-- aqui: vão como comandos separados depois da aprovação.

-- ---------------------------------------------------------------------------
-- 1. Preço do lote só para a gestão (no banco, não só na tela)
-- ---------------------------------------------------------------------------
-- As telas leem a view `lotes_painel`, que devolve valor só para a gestão.
-- Fechar a coluna `lotes.valor` fica para a migration 20261103000800, aplicada
-- depois que o painel novo (que lê a view) estiver publicado.
create or replace view public.lotes_painel as
select l.id, l.quadra, l.numero_lote, l.metragem, l.tipo, l.status, l.observacoes,
       l.posicao_x, l.posicao_y, l.created_at,
       case when public.sou_gestao() then l.valor end as valor
  from public.lotes l;

revoke all on public.lotes_painel from public, anon;
grant select on public.lotes_painel to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Origem: lista única + "Cadastro manual" + nada apaga origem/campanha
-- ---------------------------------------------------------------------------
alter table public.leads drop constraint if exists leads_origem_check;
alter table public.leads add constraint leads_origem_check
  check (origem = any (array['lp', 'whatsapp', 'whatsapp_contato', 'indicacao', 'instagram',
                             'google_maps', 'anuncio_whatsapp', 'formulario_meta', 'manual']));

-- Origens que o sistema registra sozinho: a tela não troca.
create or replace function public.origem_automatica(p text)
returns boolean
language sql
immutable
as $$
  select p = any (array['formulario_meta', 'anuncio_whatsapp', 'lp', 'whatsapp_contato', 'google_maps'])
$$;

create or replace function public.leads_preservar_origem()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sistema boolean := coalesce(auth.role(), '') = 'service_role'
                       or session_user in ('postgres', 'supabase_admin');
begin
  -- Salvar a ficha nunca apaga o que veio da Meta.
  new.origem          := coalesce(nullif(new.origem, ''), old.origem);
  new.campanha_id     := coalesce(nullif(new.campanha_id, ''), old.campanha_id);
  new.campanha_nome   := coalesce(nullif(new.campanha_nome, ''), old.campanha_nome);
  new.anuncio_id      := coalesce(nullif(new.anuncio_id, ''), old.anuncio_id);
  new.anuncio_nome    := coalesce(nullif(new.anuncio_nome, ''), old.anuncio_nome);
  new.conjunto_nome   := coalesce(nullif(new.conjunto_nome, ''), old.conjunto_nome);
  new.formulario_id   := coalesce(nullif(new.formulario_id, ''), old.formulario_id);
  new.formulario_nome := coalesce(nullif(new.formulario_nome, ''), old.formulario_nome);
  new.leadgen_id      := coalesce(nullif(new.leadgen_id, ''), old.leadgen_id);
  -- Origem automática só muda pelo sistema.
  if not v_sistema and public.origem_automatica(old.origem) and new.origem is distinct from old.origem then
    new.origem := old.origem;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_preservar_origem on public.leads;
create trigger leads_preservar_origem
  before update on public.leads
  for each row execute function public.leads_preservar_origem();

-- ---------------------------------------------------------------------------
-- 3. Entradas do lead: primeira e última origem, e "teve entrada pelo canal"
-- ---------------------------------------------------------------------------
create table if not exists public.lead_entradas (
  id             bigserial primary key,
  lead_id        uuid not null references public.leads(id) on delete cascade,
  canal          text not null,
  ocorrido_em    timestamptz not null default now(),
  campanha_nome  text,
  anuncio_nome   text,
  formulario_nome text,
  referencia     text,
  criado_em      timestamptz not null default now(),
  unique (lead_id, canal, ocorrido_em)
);
create index if not exists lead_entradas_lead_idx on public.lead_entradas (lead_id, ocorrido_em);

alter table public.lead_entradas enable row level security;
drop policy if exists "lead_entradas_select" on public.lead_entradas;
create policy "lead_entradas_select" on public.lead_entradas
  for select to authenticated using (public.pode_ver_lead(lead_id));
grant select on public.lead_entradas to authenticated;

alter table public.leads
  add column if not exists origem_primeira text,
  add column if not exists origem_ultima text,
  add column if not exists entrada_em timestamptz,
  add column if not exists canais_entrada text[] not null default '{}',
  add column if not exists interno boolean not null default false;

create index if not exists leads_canais_entrada_idx on public.leads using gin (canais_entrada);
create index if not exists leads_entrada_em_idx on public.leads (entrada_em desc);

create or replace function public.recalcular_entradas(p_lead_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.leads l set
    origem_primeira = e.primeira,
    origem_ultima   = e.ultima,
    entrada_em      = e.ultima_em,
    canais_entrada  = e.canais
  from (
    select (array_agg(canal order by ocorrido_em, id))[1]           as primeira,
           (array_agg(canal order by ocorrido_em desc, id desc))[1] as ultima,
           max(ocorrido_em)                                         as ultima_em,
           array_agg(distinct canal)                                as canais
      from public.lead_entradas where lead_id = p_lead_id
  ) e
  where l.id = p_lead_id and e.primeira is not null
    and (l.origem_primeira, l.origem_ultima, l.entrada_em, l.canais_entrada)
        is distinct from (e.primeira, e.ultima, e.ultima_em, e.canais)
$$;

create or replace function public.lead_entradas_recalcular()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalcular_entradas(new.lead_id);
  return null;
end;
$$;

drop trigger if exists lead_entradas_recalcular on public.lead_entradas;
create trigger lead_entradas_recalcular
  after insert on public.lead_entradas
  for each row execute function public.lead_entradas_recalcular();

-- Lead novo: a origem dele é a primeira entrada.
create or replace function public.leads_registrar_entrada_inicial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.origem is not null then
    insert into public.lead_entradas (lead_id, canal, ocorrido_em, campanha_nome, anuncio_nome, formulario_nome)
    values (new.id, new.origem, coalesce(new.created_at, now()),
            new.campanha_nome, new.anuncio_nome, new.formulario_nome)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists leads_registrar_entrada_inicial on public.leads;
create trigger leads_registrar_entrada_inicial
  after insert on public.leads
  for each row execute function public.leads_registrar_entrada_inicial();

-- Lead (novo ou já existente) que preencheu o formulário da Meta.
create or replace function public.formulario_registrar_entrada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'gravado' and new.lead_id is not null and new.origem <> 'teste'
     and (tg_op = 'INSERT' or old.status is distinct from 'gravado' or old.lead_id is distinct from new.lead_id) then
    insert into public.lead_entradas (lead_id, canal, ocorrido_em, campanha_nome, anuncio_nome, formulario_nome, referencia)
    values (new.lead_id, 'formulario_meta', coalesce(new.criado_meta_em, new.recebido_em),
            new.campanha_nome, new.ad_nome, new.form_nome, new.leadgen_id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists formulario_registrar_entrada on public.meta_leads_formulario;
create trigger formulario_registrar_entrada
  after insert or update of status, lead_id on public.meta_leads_formulario
  for each row execute function public.formulario_registrar_entrada();

-- Lead que já existia e voltou por anúncio de clique para o WhatsApp.
create or replace function public.leads_registrar_entrada_anuncio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.origem_anuncio_em is distinct from old.origem_anuncio_em and new.origem_anuncio_em is not null
     and new.anuncio_id is not null and new.formulario_id is not distinct from old.formulario_id then
    insert into public.lead_entradas (lead_id, canal, ocorrido_em, campanha_nome, anuncio_nome)
    values (new.id, 'anuncio_whatsapp', new.origem_anuncio_em, new.campanha_nome, new.anuncio_nome)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists leads_registrar_entrada_anuncio on public.leads;
create trigger leads_registrar_entrada_anuncio
  after update of origem_anuncio_em on public.leads
  for each row execute function public.leads_registrar_entrada_anuncio();

revoke all on function public.recalcular_entradas(uuid) from public, anon, authenticated;

-- Histórico: a origem gravada de cada lead + todos os formulários já recebidos.
insert into public.lead_entradas (lead_id, canal, ocorrido_em, campanha_nome, anuncio_nome, formulario_nome)
select l.id, l.origem, l.created_at, l.campanha_nome, l.anuncio_nome, l.formulario_nome
  from public.leads l
 where l.origem is not null
on conflict do nothing;

insert into public.lead_entradas (lead_id, canal, ocorrido_em, campanha_nome, anuncio_nome, formulario_nome, referencia)
select m.lead_id, 'formulario_meta', coalesce(m.criado_meta_em, m.recebido_em),
       m.campanha_nome, m.ad_nome, m.form_nome, m.leadgen_id
  from public.meta_leads_formulario m
 where m.status = 'gravado' and m.lead_id is not null and m.origem <> 'teste'
on conflict do nothing;

-- O trigger já recalculou quem ganhou entrada agora; isto cobre o resto.
do $$
declare r record;
begin
  for r in select distinct lead_id from public.lead_entradas loop
    perform public.recalcular_entradas(r.lead_id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Score do lead (regra da auditoria)
-- ---------------------------------------------------------------------------
-- +2 compra nos próximos 3 meses · +1 em até 1 ano · −2 só pesquisando
-- +2 quer visitar · +1 respondeu no WhatsApp · +2 visita agendada
create or replace function public.calcular_score(p_lead_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when l.prazo_compra ilike 'nos próximos 3 meses%' then 2
      when l.prazo_compra ilike 'em até 1 ano%' then 1
      when l.prazo_compra ilike '%só pesquisando%' then -2
      else 0
    end
    + case when l.quer_visitar ilike 'sim%' then 2 else 0 end
    + case when exists (select 1 from public.whatsapp_messages w
                         where w.lead_id = l.id and not w.from_me) then 1 else 0 end
    + case when exists (select 1 from public.visitas v
                         where v.lead_id = l.id and v.status in ('agendada', 'confirmada', 'realizada'))
           then 2 else 0 end
  from public.leads l
  where l.id = p_lead_id
$$;

create or replace function public.atualizar_score(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v int := public.calcular_score(p_lead_id);
begin
  update public.leads set score = v where id = p_lead_id and score is distinct from v;
end;
$$;

create or replace function public.score_por_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_id is null then return null; end if;
  if tg_table_name = 'whatsapp_messages' then
    if (to_jsonb(new)->>'from_me')::boolean then return null; end if;
  end if;
  perform public.atualizar_score(new.lead_id);
  return null;
end;
$$;

create or replace function public.score_lead_mudou()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.atualizar_score(new.id);
  return null;
end;
$$;

drop trigger if exists score_lead_mudou on public.leads;
create trigger score_lead_mudou
  after insert or update of prazo_compra, quer_visitar on public.leads
  for each row execute function public.score_lead_mudou();

drop trigger if exists score_resposta_whatsapp on public.whatsapp_messages;
create trigger score_resposta_whatsapp
  after insert on public.whatsapp_messages
  for each row execute function public.score_por_lead();

drop trigger if exists score_visita on public.visitas;
create trigger score_visita
  after insert or update of status on public.visitas
  for each row execute function public.score_por_lead();

revoke all on function public.atualizar_score(uuid) from public, anon, authenticated;
revoke all on function public.calcular_score(uuid) from public, anon;
grant execute on function public.calcular_score(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Etapa "Nutrição"
-- ---------------------------------------------------------------------------
alter table public.leads drop constraint if exists leads_status_crm_check;
alter table public.leads add constraint leads_status_crm_check
  check (status_crm = any (array['novo', 'qualificado', 'agendado', 'visitou', 'proposta',
                                 'fechado', 'perdido', 'nutricao']));

-- ---------------------------------------------------------------------------
-- 6. Vendedor inativo devolve a carteira; rodízio pula quem não tem telefone
-- ---------------------------------------------------------------------------
-- "Participa do rodízio" deixa de ser o mesmo que "vendedor ativo": tirar
-- alguém da fila não pode tirar a carteira dele. Inativar (ativo = false,
-- ou desativar o login) devolve os leads abertos.
alter table public.vendedores add column if not exists no_rodizio boolean not null default true;
update public.vendedores set no_rodizio = ativo where no_rodizio is distinct from ativo;

create or replace function public.proximo_vendedor_da_fila()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Sem telefone o vendedor não recebe o aviso do lead: fica fora da fila.
  select id into v_id
    from public.vendedores
   where ativo = true and no_rodizio = true
     and length(regexp_replace(coalesce(telefone, ''), '\D', '', 'g')) >= 10
   order by posicao_round_robin asc, created_at asc
   limit 1
   for update skip locked;
  if v_id is null then
    return null;
  end if;
  update public.vendedores
     set posicao_round_robin = (select coalesce(max(posicao_round_robin), 0) + 1 from public.vendedores)
   where id = v_id;
  return v_id;
end;
$$;

revoke all on function public.proximo_vendedor_da_fila() from public, anon, authenticated;
grant execute on function public.proximo_vendedor_da_fila() to service_role;

create or replace function public.devolver_carteira(p_vendedor_id uuid, p_motivo text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  v_novo uuid;
  n integer := 0;
  v_nome text;
begin
  select nome into v_nome from public.vendedores where id = p_vendedor_id;
  for l in
    select id from public.leads
     where vendedor_id = p_vendedor_id and deletado_em is null
       and status_crm not in ('fechado', 'perdido')
     for update
  loop
    v_novo := case when public.rodizio_ativo() then public.proximo_vendedor_da_fila() end;
    if v_novo = p_vendedor_id then v_novo := null; end if;
    update public.leads set vendedor_id = v_novo where id = l.id;
    insert into public.interacoes (lead_id, tipo, canal, conteudo)
    values (l.id, 'sistema', 'atribuicao',
            p_motivo || coalesce(' (' || v_nome || ')', '') ||
            case when v_novo is null then ' → Sem vendedor.'
                 else ' → redistribuído pelo rodízio.' end);
    n := n + 1;
  end loop;
  if n > 0 then
    perform public.notificar_gestao('carteira_devolvida', 'Carteira devolvida',
      format('%s lead(s) de %s voltaram para %s.', n, coalesce(v_nome, 'um vendedor'),
             case when public.rodizio_ativo() then 'o rodízio' else '"Sem vendedor"' end),
      '/dashboard/crm');
  end if;
  return n;
end;
$$;

revoke all on function public.devolver_carteira(uuid, text) from public, anon, authenticated;

create or replace function public.vendedor_inativo_devolve_leads()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.ativo and not new.ativo then
    perform public.devolver_carteira(new.id, 'Devolvido: vendedor inativo');
  end if;
  return null;
end;
$$;

drop trigger if exists vendedor_inativo_devolve_leads on public.vendedores;
create trigger vendedor_inativo_devolve_leads
  after update of ativo on public.vendedores
  for each row execute function public.vendedor_inativo_devolve_leads();

-- Usuário com papel Vendedor sempre tem cadastro de vendedor ligado.
-- AFTER: no INSERT o perfil precisa existir antes (vendedores.profile_id é FK).
create or replace function public.profiles_garantir_vendedor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if new.role::text = 'vendedor' and new.vendedor_id is null and new.deletado_em is null then
    select id into v_id from public.vendedores where profile_id = new.id limit 1;
    if v_id is null then
      insert into public.vendedores (nome, email, ativo, profile_id)
      values (coalesce(nullif(new.nome, ''), new.email, 'Vendedor'), new.email, new.ativo, new.id)
      returning id into v_id;
    end if;
    update public.profiles set vendedor_id = v_id where id = new.id and vendedor_id is null;
  end if;
  return null;
end;
$$;

drop trigger if exists profiles_garantir_vendedor on public.profiles;
create trigger profiles_garantir_vendedor
  after insert or update of role, vendedor_id on public.profiles
  for each row execute function public.profiles_garantir_vendedor();

-- ---------------------------------------------------------------------------
-- 7. Relatório de conversão: origem = "teve entrada pelo canal"
-- ---------------------------------------------------------------------------
create or replace function public.relatorio_conversao(p_inicio date, p_fim date)
returns table (
  dimensao          text,
  chave             text,
  rotulo            text,
  entraram          integer,
  qualificados      integer,
  agendados         integer,
  visitaram         integer,
  propostas         integer,
  fechados          integer,
  perdidos          integer,
  taxa_qualificacao numeric,
  taxa_agendamento  numeric,
  taxa_visita       numeric,
  taxa_proposta     numeric,
  taxa_fechamento   numeric,
  taxa_geral        numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with safra as (
    select l.id, l.vendedor_id, l.origem, l.status_crm,
           -- Canais pelos quais o lead já entrou (a origem gravada conta como um).
           array(select distinct c from unnest(array_append(l.canais_entrada, l.origem)) c
                  where c is not null) as canais
      from public.leads l
     where not l.is_teste
       and l.deletado_em is null
       and l.created_at >= public.inicio_do_dia_brt(p_inicio)
       and l.created_at < public.inicio_do_dia_brt(p_fim + 1)
       and (public.sou_gestao() or l.vendedor_id = public.meu_vendedor_id())
  ),
  alcance as (
    select s.id, s.vendedor_id, s.origem, s.canais, s.status_crm,
           greatest(
             1,
             public.etapa_ordem(s.status_crm),
             coalesce((
               select max(public.etapa_ordem(h.status_novo))
                 from public.leads_etapas_historico h
                where h.lead_id = s.id
             ), 0),
             coalesce((
               select max(case when v.status = 'realizada' then 4 else 3 end)
                 from public.visitas v
                where v.lead_id = s.id
             ), 0)
           ) as ordem_max
      from safra s
  ),
  agregado as (
    select case when grouping(a.vendedor_id) = 0 then 'vendedor' else 'total' end as dimensao,
           case
             when grouping(a.vendedor_id) = 0 then coalesce(a.vendedor_id::text, 'sem_vendedor')
             else 'total'
           end as chave,
           case
             when grouping(a.vendedor_id) = 0 then coalesce(max(vd.nome), 'Sem vendedor')
             else 'Total'
           end as rotulo,
           count(*)::integer as entraram,
           count(*) filter (where a.ordem_max >= 2)::integer as qualificados,
           count(*) filter (where a.ordem_max >= 3)::integer as agendados,
           count(*) filter (where a.ordem_max >= 4)::integer as visitaram,
           count(*) filter (where a.ordem_max >= 5)::integer as propostas,
           count(*) filter (where a.ordem_max >= 6)::integer as fechados,
           count(*) filter (where a.status_crm = 'perdido')::integer as perdidos
      from alcance a
      left join public.vendedores vd on vd.id = a.vendedor_id
     group by grouping sets ((), (a.vendedor_id))
    union all
    -- Por origem: "teve entrada pelo canal" (um lead pode contar em mais de um).
    select 'origem', coalesce(c.canal, 'sem_origem'), coalesce(c.canal, 'Sem origem'),
           count(*)::integer,
           count(*) filter (where a.ordem_max >= 2)::integer,
           count(*) filter (where a.ordem_max >= 3)::integer,
           count(*) filter (where a.ordem_max >= 4)::integer,
           count(*) filter (where a.ordem_max >= 5)::integer,
           count(*) filter (where a.ordem_max >= 6)::integer,
           count(*) filter (where a.status_crm = 'perdido')::integer
      from alcance a
      left join lateral unnest(case when cardinality(a.canais) = 0 then array[null::text]
                                    else a.canais end) as c(canal) on true
     group by c.canal
  )
  select g.dimensao, g.chave, g.rotulo,
         g.entraram, g.qualificados, g.agendados, g.visitaram, g.propostas, g.fechados, g.perdidos,
         round(g.qualificados::numeric / nullif(g.entraram, 0), 4),
         round(g.agendados::numeric / nullif(g.qualificados, 0), 4),
         round(g.visitaram::numeric / nullif(g.agendados, 0), 4),
         round(g.propostas::numeric / nullif(g.visitaram, 0), 4),
         round(g.fechados::numeric / nullif(g.propostas, 0), 4),
         round(g.fechados::numeric / nullif(g.entraram, 0), 4)
    from agregado g
   order by case g.dimensao when 'total' then 0 when 'vendedor' then 1 else 2 end,
            g.entraram desc, g.rotulo
$$;

notify pgrst, 'reload schema';
