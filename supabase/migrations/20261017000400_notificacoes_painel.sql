-- Notificações no painel e registro de exportações de leads (issue #60).
--
-- Antes: as Edge Functions gravavam em `notifications` ("Lead pediu atendimento
-- humano", "Novo lead atribuído", "Mensagem automática não enviada"…), mas só o
-- service_role tinha política — o painel não lia nada e os avisos se perdiam.
--
-- Agora:
--   notifications → cada usuário lê e marca como lidas só as próprias
--                   (user_id = auth.uid()); inserir e apagar continua só com o
--                   service_role. Entra na publicação realtime para o sino do
--                   cabeçalho atualizar sozinho.
--   exportacoes   → registro de quem exportou leads, quando, quantos e com
--                   quais filtros. Cada um insere os próprios; a gestão lê tudo.

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
-- `read` (boolean) já existe e continua sendo mantida; `lida_em` guarda quando.
alter table public.notifications add column if not exists lida_em timestamptz;

-- Notificações já marcadas como lidas antes desta coluna ganham uma data.
update public.notifications
   set lida_em = created_at
 where read and lida_em is null;

create index if not exists idx_notifications_user_lida_criada
  on public.notifications (user_id, lida_em, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_proprias" on public.notifications;
create policy "notifications_select_proprias" on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notifications_update_proprias" on public.notifications;
create policy "notifications_update_proprias" on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- O painel só pode mexer na leitura: título, corpo, link e dono são da Edge
-- Function que gerou o aviso.
revoke all on public.notifications from anon;
revoke insert, update, delete on public.notifications from authenticated;
grant select on public.notifications to authenticated;
grant update (read, lida_em) on public.notifications to authenticated;

-- Realtime: o sino recebe INSERT/UPDATE sem precisar recarregar. A RLS acima
-- vale também para o realtime, então cada um só recebe os próprios avisos.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- exportacoes
-- ---------------------------------------------------------------------------
create table if not exists public.exportacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  tipo text not null default 'leads',
  total_registros integer not null default 0 check (total_registros >= 0),
  filtros jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_exportacoes_user_criada
  on public.exportacoes (user_id, created_at desc);
create index if not exists idx_exportacoes_criada
  on public.exportacoes (created_at desc);

alter table public.exportacoes enable row level security;

drop policy if exists "exportacoes_select_gestao" on public.exportacoes;
create policy "exportacoes_select_gestao" on public.exportacoes
  for select to authenticated
  using (public.sou_gestao());

drop policy if exists "exportacoes_insert_proprias" on public.exportacoes;
create policy "exportacoes_insert_proprias" on public.exportacoes
  for insert to authenticated
  with check (user_id = auth.uid());

-- Registro de auditoria: ninguém do painel altera nem apaga.
revoke all on public.exportacoes from anon;
revoke update, delete on public.exportacoes from authenticated;
grant select, insert on public.exportacoes to authenticated;
