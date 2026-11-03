-- Formulário Meta (Lead Ads) → CRM.
--
-- A Edge Function meta-leadgen recebe o webhook "leadgen" da Página, registra
-- o evento em meta_leads_formulario, lê o lead na Meta e chama
-- registrar_lead_formulario, que aplica as regras combinadas:
--   - origem "formulario_meta"; nome, telefone, e-mail, cidade e as respostas;
--   - campanha, conjunto, anúncio e formulário de origem, e o JSON bruto;
--   - deduplicação pelo telefone (DDD + 8 últimos dígitos): lead existente é
--     atualizado e ganha uma interação no histórico;
--   - "qualificado" se compra nos próximos 3 meses ou quer visitar, senão "novo";
--   - rodízio de vendedores e aviso no sino, mas só depois que a gestão ligar a
--     chave configuracoes.rodizio_formulario_ativo (tela Equipe). Enquanto ela
--     estiver desligada, o lead entra sem vendedor e o aviso vai para a gestão;
--     ao ligar, definir_rodizio_formulario(true) reparte os que ficaram esperando.

alter table public.leads
  add column if not exists conjunto_nome text,
  add column if not exists formulario_id text,
  add column if not exists formulario_nome text,
  add column if not exists leadgen_id text,
  add column if not exists finalidade text,
  add column if not exists prazo_compra text,
  add column if not exists quer_visitar text;

comment on column public.leads.leadgen_id is 'ID do lead no formulário da Meta (Lead Ads) que criou ou atualizou este lead por último.';

create table if not exists public.meta_leads_formulario (
  leadgen_id     text primary key,
  form_id        text,
  form_nome      text,
  page_id        text,
  ad_id          text,
  ad_nome        text,
  conjunto_nome  text,
  campanha_id    text,
  campanha_nome  text,
  plataforma     text,
  criado_meta_em timestamptz,
  origem         text not null default 'webhook' check (origem in ('webhook', 'importacao', 'teste')),
  status         text not null default 'pendente' check (status in ('pendente', 'gravado', 'erro')),
  tentativas     integer not null default 0,
  erro           text,
  lead_id        uuid references public.leads (id) on delete set null,
  duplicado      boolean,
  evento         jsonb,
  bruto          jsonb,
  recebido_em    timestamptz not null default now(),
  processado_em  timestamptz
);

create index if not exists meta_leads_formulario_pendentes_idx
  on public.meta_leads_formulario (recebido_em) where status <> 'gravado';

alter table public.meta_leads_formulario enable row level security;
drop policy if exists meta_leads_formulario_gestao on public.meta_leads_formulario;
create policy meta_leads_formulario_gestao on public.meta_leads_formulario
  for select to authenticated using (public.sou_gestao());

-- Chave de comparação de telefone brasileiro: DDD + 8 últimos dígitos. Assim
-- "5512991234567", "+55 (12) 99123-4567" e "551291234567" (sem o 9) batem.
create or replace function public.chave_telefone_br(p text)
returns text
language sql
immutable
as $$
  with d as (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as n),
       s as (
         select case when length(n) in (12, 13) and n like '55%' then substr(n, 3) else n end as n from d
       )
  select case when length(n) in (10, 11) then left(n, 2) || right(n, 8) end from s
$$;

-- Chave do rodízio do formulário. Começa desligada: a equipe ainda é de teste.
insert into public.configuracoes (chave, valor)
select 'rodizio_formulario_ativo', 'false'
 where not exists (select 1 from public.configuracoes where chave = 'rodizio_formulario_ativo');

create or replace function public.rodizio_formulario_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select lower(valor) = 'true' from public.configuracoes
                    where chave = 'rodizio_formulario_ativo' limit 1), false)
$$;

create or replace function public.registrar_lead_formulario(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leadgen   text := nullif(p->>'leadgen_id', '');
  v_tel       text := nullif(p->>'telefone', '');
  v_chave     text := public.chave_telefone_br(nullif(p->>'telefone', ''));
  v_qual      boolean := coalesce((p->>'qualificado')::boolean, false);
  v_teste     boolean := coalesce((p->>'is_teste')::boolean, false);
  v_notificar boolean := coalesce((p->>'notificar')::boolean, true);
  v_origem    text := coalesce(nullif(p->>'origem_registro', ''), 'webhook');
  v_criado    timestamptz := coalesce(nullif(p->>'criado_em', '')::timestamptz, now());
  v_lead      public.leads%rowtype;
  v_novo      boolean := false;
  v_vend      uuid;
  v_status    text;
  v_ja        uuid;
  v_profile   uuid;
  v_resumo    text;
  v_rodizio   boolean := public.rodizio_formulario_ativo();
begin
  if v_leadgen is null then
    raise exception 'leadgen_id obrigatório';
  end if;

  -- Mesmo lead da Meta já gravado: nada a fazer (webhook repetido, reimportação).
  select lead_id into v_ja
    from public.meta_leads_formulario
   where leadgen_id = v_leadgen and status = 'gravado' and lead_id is not null;
  if v_ja is not null then
    select * into v_lead from public.leads where id = v_ja;
    return jsonb_build_object('lead_id', v_ja, 'novo', false, 'duplicado', false, 'repetido', true,
                              'status_crm', v_lead.status_crm, 'qualificado', v_qual,
                              'vendedor_id', v_lead.vendedor_id);
  end if;

  if v_chave is not null then
    select * into v_lead
      from public.leads l
     where public.chave_telefone_br(l.telefone) = v_chave
     order by (l.deletado_em is null) desc, l.created_at
     limit 1
     for update;
  end if;

  v_resumo := concat_ws(E'\n',
    'Cadastro pelo Formulário Meta' || coalesce(' — ' || nullif(p->>'form_nome', ''), ''),
    'Campanha: ' || nullif(p->>'campanha_nome', ''),
    'Anúncio: ' || nullif(p->>'ad_nome', ''),
    'Usar o lote para: ' || nullif(p->>'finalidade', ''),
    'Quando pretende comprar: ' || nullif(p->>'prazo_compra', ''),
    'Como prefere pagar: ' || nullif(p->>'forma_pagamento', ''),
    'Quer visitar: ' || nullif(p->>'quer_visitar', ''),
    'Cidade: ' || nullif(p->>'cidade', ''),
    'E-mail: ' || nullif(p->>'email', ''));

  if v_lead.id is null then
    v_novo := true;
    v_vend := case when v_rodizio and not v_teste then public.get_next_round_robin_salesperson() end;
    v_status := case when v_qual then 'qualificado' else 'novo' end;
    insert into public.leads (
      nome, telefone, email, cidade, origem, status_crm, vendedor_id, objetivo, forma_pagamento,
      finalidade, prazo_compra, quer_visitar, anuncio_id, anuncio_nome, conjunto_nome,
      campanha_id, campanha_nome, formulario_id, formulario_nome, leadgen_id,
      origem_anuncio_em, is_teste, created_at
    ) values (
      coalesce(nullif(p->>'nome', ''), v_tel, 'Lead do formulário'), v_tel, nullif(p->>'email', ''),
      nullif(p->>'cidade', ''), 'formulario_meta', v_status, v_vend, nullif(p->>'objetivo', ''),
      nullif(p->>'forma_pagamento', ''), nullif(p->>'finalidade', ''), nullif(p->>'prazo_compra', ''),
      nullif(p->>'quer_visitar', ''), nullif(p->>'ad_id', ''), nullif(p->>'ad_nome', ''),
      nullif(p->>'conjunto_nome', ''), nullif(p->>'campanha_id', ''), nullif(p->>'campanha_nome', ''),
      nullif(p->>'form_id', ''), nullif(p->>'form_nome', ''), v_leadgen,
      v_criado, v_teste, v_criado
    )
    returning * into v_lead;
  else
    v_vend := coalesce(v_lead.vendedor_id,
                       case when v_rodizio and not v_teste then public.get_next_round_robin_salesperson() end);
    v_status := case
      when v_lead.status_crm in ('novo', 'perdido') or v_lead.deletado_em is not null
        then case when v_qual then 'qualificado' else 'novo' end
      else v_lead.status_crm
    end;
    update public.leads l set
      email           = coalesce(l.email, nullif(p->>'email', '')),
      cidade          = coalesce(l.cidade, nullif(p->>'cidade', '')),
      objetivo        = coalesce(l.objetivo, nullif(p->>'objetivo', '')),
      forma_pagamento = coalesce(nullif(p->>'forma_pagamento', ''), l.forma_pagamento),
      finalidade      = coalesce(nullif(p->>'finalidade', ''), l.finalidade),
      prazo_compra    = coalesce(nullif(p->>'prazo_compra', ''), l.prazo_compra),
      quer_visitar    = coalesce(nullif(p->>'quer_visitar', ''), l.quer_visitar),
      formulario_id   = coalesce(nullif(p->>'form_id', ''), l.formulario_id),
      formulario_nome = coalesce(nullif(p->>'form_nome', ''), l.formulario_nome),
      leadgen_id      = v_leadgen,
      -- A primeira campanha que trouxe o lead continua sendo a de origem.
      anuncio_id      = coalesce(l.anuncio_id, nullif(p->>'ad_id', '')),
      anuncio_nome    = case when l.anuncio_id is null then nullif(p->>'ad_nome', '') else l.anuncio_nome end,
      conjunto_nome   = case when l.anuncio_id is null then nullif(p->>'conjunto_nome', '') else l.conjunto_nome end,
      campanha_id     = case when l.anuncio_id is null then nullif(p->>'campanha_id', '') else l.campanha_id end,
      campanha_nome   = case when l.anuncio_id is null then nullif(p->>'campanha_nome', '') else l.campanha_nome end,
      origem_anuncio_em = coalesce(l.origem_anuncio_em, v_criado),
      status_crm      = v_status,
      vendedor_id     = v_vend,
      deletado_em     = null,
      is_teste        = coalesce(l.is_teste, false) or v_teste
    where l.id = v_lead.id
    returning * into v_lead;
  end if;

  insert into public.interacoes (lead_id, tipo, canal, conteudo, created_at)
  values (v_lead.id, 'sistema', 'formulario_meta',
          case when v_novo then v_resumo else 'Novo contato pelo formulário. ' || v_resumo end,
          v_criado);

  if v_notificar and v_vend is null then
    -- Sem rodízio (ou sem vendedor): a gestão fica sabendo.
    perform public.notificar_gestao(
      'lead_formulario',
      case when v_teste then '🧪 TESTE — ' else '' end ||
      case when v_novo then 'Novo lead do formulário' else 'Lead voltou pelo formulário' end,
      v_lead.nome || case when v_qual then ' — qualificado' else '' end ||
      coalesce(' (' || nullif(p->>'campanha_nome', '') || ')', '') || ' — sem vendedor atribuído.',
      '/dashboard/crm?lead=' || v_lead.id);
  elsif v_notificar then
    select profile_id into v_profile from public.vendedores where id = v_vend;
    if v_profile is not null then
      insert into public.notifications (user_id, type, title, body, link)
      values (v_profile, 'lead_atribuido',
              case when v_teste then '🧪 TESTE — ' else '' end ||
              case when v_novo then 'Novo lead do formulário' else 'Lead voltou pelo formulário' end,
              v_lead.nome || case when v_qual then ' — qualificado' else '' end ||
              coalesce(' (' || nullif(p->>'campanha_nome', '') || ')', ''),
              '/dashboard/crm?lead=' || v_lead.id);
    end if;
  end if;

  insert into public.meta_leads_formulario as m (
    leadgen_id, form_id, form_nome, ad_id, ad_nome, conjunto_nome, campanha_id, campanha_nome,
    plataforma, criado_meta_em, origem, status, lead_id, duplicado, bruto, processado_em
  ) values (
    v_leadgen, nullif(p->>'form_id', ''), nullif(p->>'form_nome', ''), nullif(p->>'ad_id', ''),
    nullif(p->>'ad_nome', ''), nullif(p->>'conjunto_nome', ''), nullif(p->>'campanha_id', ''),
    nullif(p->>'campanha_nome', ''), nullif(p->>'plataforma', ''), v_criado, v_origem, 'gravado',
    v_lead.id, not v_novo, p->'bruto', now()
  )
  on conflict (leadgen_id) do update set
    form_id = excluded.form_id, form_nome = excluded.form_nome, ad_id = excluded.ad_id,
    ad_nome = excluded.ad_nome, conjunto_nome = excluded.conjunto_nome,
    campanha_id = excluded.campanha_id, campanha_nome = excluded.campanha_nome,
    plataforma = excluded.plataforma, criado_meta_em = excluded.criado_meta_em,
    status = 'gravado', erro = null, lead_id = excluded.lead_id, duplicado = excluded.duplicado,
    bruto = excluded.bruto, processado_em = now();

  return jsonb_build_object('lead_id', v_lead.id, 'novo', v_novo, 'duplicado', not v_novo,
                            'status_crm', v_lead.status_crm, 'qualificado', v_qual,
                            'vendedor_id', v_vend);
end;
$$;

revoke all on function public.registrar_lead_formulario(jsonb) from public, anon, authenticated;
grant execute on function public.registrar_lead_formulario(jsonb) to service_role;

-- Liga/desliga o rodízio do formulário. Ao ligar, reparte os leads do
-- formulário que entraram sem vendedor e avisa cada vendedor uma vez.
create or replace function public.definir_rodizio_formulario(p_ativo boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  v_vend uuid;
  n integer := 0;
begin
  if not public.sou_gestao() and coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Apenas a gestão pode mudar o rodízio.' using errcode = '42501';
  end if;
  update public.configuracoes set valor = case when p_ativo then 'true' else 'false' end
   where chave = 'rodizio_formulario_ativo';
  if not found then
    insert into public.configuracoes (chave, valor)
    values ('rodizio_formulario_ativo', case when p_ativo then 'true' else 'false' end);
  end if;
  if not p_ativo then
    return 0;
  end if;

  create temporary table if not exists _distribuidos (vendedor_id uuid) on commit drop;
  truncate _distribuidos;
  for l in
    select id from public.leads
     where origem = 'formulario_meta' and vendedor_id is null and deletado_em is null
       and not coalesce(is_teste, false) and status_crm not in ('fechado', 'perdido')
     order by created_at
     for update
  loop
    v_vend := public.get_next_round_robin_salesperson();
    exit when v_vend is null;
    update public.leads set vendedor_id = v_vend where id = l.id;
    insert into _distribuidos values (v_vend);
    n := n + 1;
  end loop;
  perform public.avisar_vendedor_formulario(vendedor_id, count(*)::int)
     from _distribuidos group by vendedor_id;
  return n;
end;
$$;

-- Importação dos leads antigos: um aviso por vendedor em vez de um por lead.
create or replace function public.avisar_vendedor_formulario(p_vendedor_id uuid, p_quantidade integer)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, body, link)
  select v.profile_id, 'lead_atribuido', 'Leads do formulário atribuídos a você',
         p_quantidade || case when p_quantidade = 1 then ' lead do Formulário Meta foi atribuído'
                                                  else ' leads do Formulário Meta foram atribuídos' end
         || ' a você. Veja no CRM com o filtro de origem "Formulário Meta".',
         '/dashboard/crm'
    from public.vendedores v
   where v.id = p_vendedor_id and v.profile_id is not null and p_quantidade > 0
$$;

revoke all on function public.avisar_vendedor_formulario(uuid, integer) from public, anon, authenticated;
grant execute on function public.avisar_vendedor_formulario(uuid, integer) to service_role;

revoke all on function public.definir_rodizio_formulario(boolean) from public, anon;
grant execute on function public.definir_rodizio_formulario(boolean) to authenticated, service_role;
revoke all on function public.rodizio_formulario_ativo() from public, anon;
grant execute on function public.rodizio_formulario_ativo() to authenticated, service_role;

-- Rede de segurança: reprocessa eventos que ficaram pendentes ou com erro.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'meta-leadgen-pendentes') then
    perform cron.unschedule('meta-leadgen-pendentes');
  end if;
  perform cron.schedule(
    'meta-leadgen-pendentes',
    '*/10 * * * *',
    $cron$
      select net.http_post(
        url     := 'https://mokgxoygbjvtketoyraf.supabase.co/functions/v1/meta-leadgen?acao=processar',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', (
            select decrypted_secret from vault.decrypted_secrets
             where name = 'cron_meta_secret' limit 1
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      )
       where exists (select 1 from public.meta_leads_formulario
                      where status <> 'gravado' and tentativas < 5);
    $cron$
  );
end $$;

notify pgrst, 'reload schema';
