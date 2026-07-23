create table if not exists public.client_common_expense_participation (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  month text not null, -- 'YYYY-MM'
  included boolean not null,
  updated_at timestamptz not null default now(),
  unique (client_id, month)
);
alter table public.client_common_expense_participation enable row level security;
create policy "tenant_isolation" on public.client_common_expense_participation
  for all using (company_id = (auth.jwt() ->> 'company_id')::uuid);
create index if not exists idx_common_exp_participation_month
  on public.client_common_expense_participation(company_id, month);
