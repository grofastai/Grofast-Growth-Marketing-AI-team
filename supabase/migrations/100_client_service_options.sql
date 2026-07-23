create table if not exists public.service_options (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);
alter table public.service_options enable row level security;
create policy "tenant_isolation" on public.service_options
  for all using (company_id = (auth.jwt() ->> 'company_id')::uuid);

create table if not exists public.client_services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  service_option_id uuid not null references public.service_options(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (client_id, service_option_id)
);
alter table public.client_services enable row level security;
create policy "tenant_isolation" on public.client_services
  for all using (company_id = (auth.jwt() ->> 'company_id')::uuid);
create index if not exists idx_client_services_client on public.client_services(client_id);
create index if not exists idx_client_services_option on public.client_services(service_option_id);
