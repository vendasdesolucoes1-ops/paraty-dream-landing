-- LGPD: exclusão completa do titular, retenção automática e registro de
-- pedidos (auditoria R-11, issue #47).
--
-- A exclusão definitiva anterior deixava rastro: rag_consultas (texto que o
-- lead escreveu), itens de disparo (nome e telefone), notificações e, agora,
-- a trilha de auditoria. E casava conversas pelos 10 últimos dígitos, o que
-- podia apagar a conversa de OUTRO lead com o mesmo número em outro DDD.

-- ---------------------------------------------------------------------------
-- Pedidos de titulares
-- ---------------------------------------------------------------------------
create table if not exists public.solicitacoes_titular (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid references public.leads(id) on delete set null,
  telefone_chave  text,
  tipo            text not null check (tipo in ('acesso', 'correcao', 'exclusao', 'oposicao')),
  status          text not null default 'aberta' check (status in ('aberta', 'concluida', 'recusada')),
  descricao       text,
  resposta        text,
  responsavel_id  uuid references public.profiles(id),
  solicitado_em   timestamptz not null default now(),
  concluido_em    timestamptz
);

alter table public.solicitacoes_titular enable row level security;
drop policy if exists "solicitacoes_titular_gestao" on public.solicitacoes_titular;
create policy "solicitacoes_titular_gestao" on public.solicitacoes_titular
  for all to authenticated using (public.sou_gestao()) with check (public.sou_gestao());
grant select, insert, update on public.solicitacoes_titular to authenticated;

-- ---------------------------------------------------------------------------
-- A trilha de auditoria aceita UMA mudança: anonimização pela exclusão do
-- titular (função SECURITY DEFINER, dona = postgres).
-- ---------------------------------------------------------------------------
create or replace function public.auditoria_imutavel()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and current_user in ('postgres', 'supabase_admin')
     and new.antes is null and new.depois is null and new.mudancas is null then
    return new;
  end if;
  raise exception 'A trilha de auditoria é somente inclusão.' using errcode = '42501';
end;
$$;

-- ---------------------------------------------------------------------------
-- Exclusão completa (corpo novo da implementação; o guarda de papel continua
-- em excluir_lead_definitivo)
-- ---------------------------------------------------------------------------
create or replace function public.excluir_lead_definitivo_impl(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_telefone text;
  v_chave    text;
  v_contagem jsonb := '{}'::jsonb;
  n          int;
begin
  select telefone into v_telefone from public.leads where id = p_lead_id;
  if not found then
    raise exception 'Lead não encontrado.' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.clientes where lead_id = p_lead_id) then
    raise exception 'Este lead já é um cliente comprador e não pode ser excluído. Remova o vínculo em Clientes antes de tentar de novo.'
      using errcode = 'P0001';
  end if;

  v_chave := public.telefone_chave(v_telefone);

  delete from public.mensagens_agendadas where lead_id = p_lead_id;
  get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('mensagens_agendadas', n);

  -- Conversas da IA pela chave canônica (DDD inteiro): nunca a de outro lead.
  if v_chave is not null then
    delete from public.ai_agent_human_takeover t
     where t.conversation_id in (
       select c.id from public.ai_agent_conversations c
        where public.telefone_chave(c.session_id) = v_chave
     );
    get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('takeovers', n);

    delete from public.ai_agent_conversations c where public.telefone_chave(c.session_id) = v_chave;
    get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('conversas', n);

    -- Contato da agenda do número: some junto, é dado do titular.
    delete from public.whatsapp_contacts w where public.telefone_chave(w.phone) = v_chave;
    get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('contatos', n);

    -- Itens de campanha guardam nome e telefone: anonimiza (a contagem da
    -- campanha continua valendo).
    update public.disparos_itens
       set nome = null, telefone = '[removido]', erro = null, lead_id = null
     where public.telefone_chave(telefone) = v_chave or lead_id = p_lead_id;
    get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('disparos_itens', n);
  end if;

  delete from public.whatsapp_messages where lead_id = p_lead_id;
  get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('whatsapp_messages', n);

  delete from public.rag_consultas where lead_id = p_lead_id;
  get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('rag_consultas', n);

  delete from public.notifications where link like '%lead=' || p_lead_id::text || '%';
  get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('notificacoes', n);

  delete from public.interacoes where lead_id = p_lead_id;
  get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('interacoes', n);

  delete from public.visitas where lead_id = p_lead_id;
  get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('visitas', n);

  -- A trilha guarda que o registro existiu e foi apagado, sem o conteúdo.
  update public.auditoria
     set antes = null, depois = null, mudancas = null
   where tabela in ('leads', 'visitas') and registro_id = p_lead_id::text;

  delete from public.leads where id = p_lead_id;

  insert into public.auditoria (tabela, registro_id, operacao, autor_id, origem)
  values ('leads', p_lead_id::text, 'DELETE', auth.uid(), 'exclusao_titular');

  return v_contagem;
end;
$$;

revoke all on function public.excluir_lead_definitivo_impl(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Retenção automática
-- ---------------------------------------------------------------------------
-- rag_consultas: 180 dias (diagnóstico da busca; o texto do lead não precisa
-- viver mais que isso). Fila: 90 dias depois de encerrada. Limites de taxa:
-- 2 dias. Leads apagados em soft delete há mais de 2 anos: exclusão completa.
create or replace function public.aplicar_retencao()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb := '{}'::jsonb;
  n int;
  r record;
begin
  delete from public.rag_consultas where criado_em < now() - interval '180 days';
  get diagnostics n = row_count; v := v || jsonb_build_object('rag_consultas', n);

  delete from public.mensagens_agendadas
   where status in ('enviado', 'cancelado', 'erro') and atualizado_em < now() - interval '90 days';
  get diagnostics n = row_count; v := v || jsonb_build_object('mensagens_agendadas', n);

  delete from public.limites_taxa where janela < now() - interval '2 days';

  n := 0;
  for r in
    select id from public.leads
     where deletado_em is not null and deletado_em < now() - interval '2 years'
       and not exists (select 1 from public.clientes c where c.lead_id = leads.id)
     limit 200
  loop
    perform public.excluir_lead_definitivo_impl(r.id);
    n := n + 1;
  end loop;
  v := v || jsonb_build_object('leads_excluidos', n);

  return v;
end;
$$;

revoke all on function public.aplicar_retencao() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'aplicar-retencao-lgpd') then
    perform cron.unschedule('aplicar-retencao-lgpd');
  end if;
end $$;

select cron.schedule('aplicar-retencao-lgpd', '41 3 * * *', $cron$ select public.aplicar_retencao() $cron$);
