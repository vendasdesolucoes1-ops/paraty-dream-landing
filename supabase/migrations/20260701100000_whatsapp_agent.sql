-- WhatsApp + AI agent system for Moradas de Paraty (single-tenant, no org_id/franchise_id)

create table if not exists whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  instance_name text not null unique,
  api_url text not null,
  api_key text not null,
  status text not null default 'disconnected',
  qr_code text,
  qr_code_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text,
  remote_jid text,
  lead_id uuid references leads(id),
  unread_count integer not null default 0,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references whatsapp_instances(id),
  contact_id uuid references whatsapp_contacts(id),
  lead_id uuid references leads(id),
  remote_jid text,
  message_id text unique,
  from_me boolean not null default false,
  message_type text,
  content text,
  status text,
  created_at timestamptz not null default now()
);

create table if not exists ai_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  instance_id uuid references whatsapp_instances(id),
  is_active boolean not null default true,
  system_prompt text,
  transfer_keywords text[],
  transfer_to_human_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists ai_agent_conversations (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references ai_agents(id),
  session_id text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists ai_agent_human_takeover (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references ai_agent_conversations(id),
  human_takeover_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  type text,
  title text,
  body text,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_messages_session on whatsapp_messages (contact_id, created_at);
create index if not exists idx_whatsapp_messages_lead on whatsapp_messages (lead_id, created_at);
create index if not exists idx_ai_agent_conversations_session on ai_agent_conversations (session_id);

do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'leads_phone_key'
  ) then
    create unique index leads_phone_key on leads (telefone);
  end if;
end $$;

-- Round-robin salesperson assignment

create or replace function get_next_round_robin_salesperson()
returns uuid
language plpgsql
as $$
declare
  next_vendedor_id uuid;
begin
  select id into next_vendedor_id
  from vendedores
  where ativo = true
  order by posicao_round_robin asc, created_at asc
  limit 1;

  if next_vendedor_id is null then
    return null;
  end if;

  update vendedores
  set posicao_round_robin = (
    select coalesce(max(posicao_round_robin), 0) + 1 from vendedores
  )
  where id = next_vendedor_id;

  return next_vendedor_id;
end;
$$;

-- RLS

alter table whatsapp_instances enable row level security;
alter table whatsapp_contacts enable row level security;
alter table whatsapp_messages enable row level security;
alter table ai_agents enable row level security;
alter table ai_agent_conversations enable row level security;
alter table ai_agent_human_takeover enable row level security;
alter table notifications enable row level security;

create policy "service_role_all_whatsapp_instances" on whatsapp_instances
  for all to service_role using (true) with check (true);

create policy "service_role_all_whatsapp_contacts" on whatsapp_contacts
  for all to service_role using (true) with check (true);

create policy "service_role_all_whatsapp_messages" on whatsapp_messages
  for all to service_role using (true) with check (true);

create policy "service_role_all_ai_agents" on ai_agents
  for all to service_role using (true) with check (true);

create policy "service_role_all_ai_agent_conversations" on ai_agent_conversations
  for all to service_role using (true) with check (true);

create policy "service_role_all_ai_agent_human_takeover" on ai_agent_human_takeover
  for all to service_role using (true) with check (true);

create policy "service_role_all_notifications" on notifications
  for all to service_role using (true) with check (true);
