-- RLS por papel e carteira (auditoria de 15/10/2026, R-04).
--
-- Antes: `USING (true)` em leads, interações, visitas, mensagens, lotes,
-- vendedores, configurações, instâncias e agentes. Qualquer usuário logado —
-- inclusive um vendedor — lia a base inteira, a api_key da Evolution e o token
-- do Instagram, e alterava preço de lote e o prompt da IA.
--
-- Agora:
--   admin/gestor  → tudo, como antes.
--   vendedor      → leads da própria carteira (e o que pende deles); leitura de
--                   lotes, vendedores e configurações não sensíveis.
--   segredos      → api_key da Evolution não é legível por ninguém do painel;
--                   token do Instagram só por admin/gestor.

-- ---------------------------------------------------------------------------
-- Funções auxiliares (SECURITY DEFINER: leem profiles sem depender de RLS)
-- ---------------------------------------------------------------------------
create or replace function public.sou_gestao()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_my_role() in ('admin', 'gestor'), false)
$$;

create or replace function public.meu_vendedor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select vendedor_id from public.profiles
   where id = auth.uid() and ativo and deletado_em is null
$$;

-- Pode ver o lead? Gestão vê todos; vendedor só os da carteira.
create or replace function public.pode_ver_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.sou_gestao()
      or (
        p_lead_id is not null
        and public.meu_vendedor_id() is not null
        and exists (
          select 1 from public.leads l
           where l.id = p_lead_id and l.vendedor_id = public.meu_vendedor_id()
        )
      )
$$;

revoke all on function public.sou_gestao() from public, anon;
revoke all on function public.meu_vendedor_id() from public, anon;
revoke all on function public.pode_ver_lead(uuid) from public, anon;
grant execute on function public.sou_gestao() to authenticated;
grant execute on function public.meu_vendedor_id() to authenticated;
grant execute on function public.pode_ver_lead(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated_all_leads" on public.leads;

create policy "leads_select_por_papel" on public.leads
  for select to authenticated
  using (public.sou_gestao() or vendedor_id = public.meu_vendedor_id());

-- O vendedor cadastra leads na própria carteira (lead-form-dialog já faz isso);
-- a gestão cadastra para qualquer um.
create policy "leads_insert_por_papel" on public.leads
  for insert to authenticated
  with check (public.sou_gestao() or vendedor_id = public.meu_vendedor_id());

create policy "leads_update_por_papel" on public.leads
  for update to authenticated
  using (public.sou_gestao() or vendedor_id = public.meu_vendedor_id())
  with check (public.sou_gestao() or vendedor_id = public.meu_vendedor_id());

create policy "leads_delete_gestao" on public.leads
  for delete to authenticated
  using (public.sou_gestao());

-- ---------------------------------------------------------------------------
-- Tabelas penduradas no lead
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated_all_interacoes" on public.interacoes;
create policy "interacoes_por_lead" on public.interacoes
  for all to authenticated
  using (public.pode_ver_lead(lead_id))
  with check (public.pode_ver_lead(lead_id));

drop policy if exists "authenticated_all_visitas" on public.visitas;
create policy "visitas_por_lead" on public.visitas
  for all to authenticated
  using (public.pode_ver_lead(lead_id))
  with check (public.pode_ver_lead(lead_id));

-- Mensagem sem lead (contato desconhecido) só a gestão enxerga.
drop policy if exists "authenticated_all_whatsapp_messages" on public.whatsapp_messages;
create policy "whatsapp_messages_por_lead" on public.whatsapp_messages
  for select to authenticated
  using (public.sou_gestao() or public.pode_ver_lead(lead_id));

-- ---------------------------------------------------------------------------
-- Cadastros: todos leem, só a gestão altera
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated_all_lotes" on public.lotes;
create policy "lotes_select" on public.lotes
  for select to authenticated using (true);
create policy "lotes_write_gestao" on public.lotes
  for all to authenticated
  using (public.sou_gestao()) with check (public.sou_gestao());

drop policy if exists "authenticated_all_vendedores" on public.vendedores;
create policy "vendedores_select" on public.vendedores
  for select to authenticated using (true);
create policy "vendedores_write_gestao" on public.vendedores
  for all to authenticated
  using (public.sou_gestao()) with check (public.sou_gestao());

-- ---------------------------------------------------------------------------
-- configuracoes: chaves sensíveis só para a gestão
-- ---------------------------------------------------------------------------
create or replace function public.chave_configuracao_sensivel(p_chave text)
returns boolean
language sql
immutable
as $$
  select p_chave in ('instagram_token') or p_chave like '%\_secret' or p_chave like '%\_token'
$$;

drop policy if exists "authenticated_all_configuracoes" on public.configuracoes;
create policy "configuracoes_select" on public.configuracoes
  for select to authenticated
  using (public.sou_gestao() or not public.chave_configuracao_sensivel(chave));
create policy "configuracoes_write_gestao" on public.configuracoes
  for all to authenticated
  using (public.sou_gestao()) with check (public.sou_gestao());

-- ---------------------------------------------------------------------------
-- whatsapp_instances: a api_key não sai do servidor
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated_all_whatsapp_instances" on public.whatsapp_instances;
create policy "whatsapp_instances_select_gestao" on public.whatsapp_instances
  for select to authenticated using (public.sou_gestao());
create policy "whatsapp_instances_update_gestao" on public.whatsapp_instances
  for update to authenticated
  using (public.sou_gestao()) with check (public.sou_gestao());

-- Criar e apagar instância passa pela edge function whatsapp-instance (admin).
revoke select, insert, update, delete on public.whatsapp_instances from authenticated;
grant select (id, instance_name, api_url, status, qr_code, qr_code_expires_at, created_at)
  on public.whatsapp_instances to authenticated;
grant update (api_url, api_key) on public.whatsapp_instances to authenticated;

-- ---------------------------------------------------------------------------
-- ai_agents: todos leem (o painel mostra o estado), só a gestão altera
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated_all_ai_agents" on public.ai_agents;
create policy "ai_agents_select" on public.ai_agents
  for select to authenticated using (true);
create policy "ai_agents_write_gestao" on public.ai_agents
  for all to authenticated
  using (public.sou_gestao()) with check (public.sou_gestao());

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Takeovers abertos visíveis no painel (auditoria R-06)
-- ---------------------------------------------------------------------------
-- ai_agent_human_takeover só tem política de service_role: o contador do
-- Início e o selo do Kanban liam a tabela direto e ficavam sempre vazios. Esta
-- RPC devolve os atendimentos humanos em aberto que o usuário pode ver:
-- gestão vê todos; vendedor, os da própria carteira (casando o telefone da
-- conversa com o do lead pelos 10 últimos dígitos).
create or replace function public.takeovers_abertos()
returns table (session_id text, desde timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.session_id, min(t.human_takeover_at) as desde
    from public.ai_agent_human_takeover t
    join public.ai_agent_conversations c on c.id = t.conversation_id
   where t.resolved_at is null
     and (
       public.sou_gestao()
       or exists (
         select 1 from public.leads l
          where l.vendedor_id = public.meu_vendedor_id()
            and l.telefone is not null
            and right(regexp_replace(l.telefone, '\D', '', 'g'), 10)
              = right(regexp_replace(c.session_id, '\D', '', 'g'), 10)
       )
     )
   group by c.session_id
$$;

revoke all on function public.takeovers_abertos() from public, anon;
grant execute on function public.takeovers_abertos() to authenticated;

notify pgrst, 'reload schema';
