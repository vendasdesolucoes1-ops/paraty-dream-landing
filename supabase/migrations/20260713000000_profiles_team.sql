-- Access control: profiles table linking auth.users to a role and optional vendedor.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text,
  role text not null default 'vendedor' check (role in ('admin', 'gestor', 'vendedor')),
  vendedor_id uuid references vendedores(id),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function set_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at
  before update on profiles
  for each row
  execute function set_profiles_updated_at();

alter table profiles enable row level security;

create policy "service_role_all_profiles" on profiles
  for all to service_role using (true) with check (true);

create policy "authenticated_read_profiles" on profiles
  for select to authenticated using (true);

create policy "authenticated_update_own_profile" on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;
