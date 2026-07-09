-- Agenda module: scheduled site visits, linked to leads and vendedores.

create table if not exists visitas (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id),
  vendedor_id uuid references vendedores(id),
  data_hora timestamptz not null,
  status text not null default 'agendada'
    check (status in ('agendada', 'confirmada', 'realizada', 'cancelada', 'no_show')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_visitas_data_hora on visitas (data_hora);
create index if not exists idx_visitas_lead_id on visitas (lead_id);

create or replace function set_visitas_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_visitas_updated_at on visitas;
create trigger trg_visitas_updated_at
  before update on visitas
  for each row
  execute function set_visitas_updated_at();

alter table visitas enable row level security;

create policy "service_role_all_visitas" on visitas
  for all to service_role using (true) with check (true);

create policy "authenticated_all_visitas" on visitas
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.visitas to authenticated;
