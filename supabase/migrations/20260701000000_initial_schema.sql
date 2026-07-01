-- Initial database schema for Moradas de Paraty

create extension if not exists "pgcrypto";

create table if not exists vendedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text,
  telefone text,
  ativo boolean not null default true,
  posicao_round_robin integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists lotes (
  id uuid primary key default gen_random_uuid(),
  numero_lote text not null,
  quadra text,
  metragem numeric,
  tipo text check (tipo in ('residencial', 'comercial')),
  valor numeric,
  status text not null default 'disponivel' check (status in ('disponivel', 'reservado', 'vendido')),
  posicao_x numeric,
  posicao_y numeric,
  observacoes text,
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text,
  telefone text,
  cidade text,
  metragem_interesse numeric,
  tipo_lote_interesse text,
  origem text check (origem in ('lp', 'whatsapp', 'indicacao', 'instagram')),
  status_crm text not null default 'novo' check (status_crm in ('novo', 'qualificado', 'agendado', 'visitou', 'proposta', 'fechado', 'perdido')),
  lote_interesse_id uuid references lotes(id),
  vendedor_id uuid references vendedores(id),
  score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists interacoes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  tipo text check (tipo in ('whatsapp', 'ligacao', 'email', 'visita')),
  conteudo text,
  canal text,
  created_at timestamptz not null default now()
);

create table if not exists configuracoes (
  id uuid primary key default gen_random_uuid(),
  chave text unique not null,
  valor text,
  created_at timestamptz not null default now()
);

-- updated_at trigger for leads

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_leads_updated_at on leads;
create trigger trg_leads_updated_at
  before update on leads
  for each row
  execute function set_updated_at();

-- RLS

alter table lotes enable row level security;
alter table leads enable row level security;
alter table vendedores enable row level security;
alter table interacoes enable row level security;
alter table configuracoes enable row level security;

create policy "service_role_all_lotes" on lotes
  for all to service_role using (true) with check (true);

create policy "service_role_all_leads" on leads
  for all to service_role using (true) with check (true);

create policy "service_role_all_vendedores" on vendedores
  for all to service_role using (true) with check (true);

create policy "service_role_all_interacoes" on interacoes
  for all to service_role using (true) with check (true);

create policy "service_role_all_configuracoes" on configuracoes
  for all to service_role using (true) with check (true);
