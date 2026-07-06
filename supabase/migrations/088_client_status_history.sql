-- Historical tracking of client Active/Past status, mirroring salary_history's
-- pattern. Without this, every report defaulted to "what is the client's
-- status today" even when looking at a past month, silently mis-bucketing
-- that month's hours/cost if the client's status has since changed.
create table if not exists client_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  client_id uuid not null references clients(id) on delete cascade,
  status text not null,
  effective_from date not null,
  created_at timestamptz default now()
);

create index if not exists client_status_history_client_id_idx on client_status_history(client_id);

alter table client_status_history enable row level security;

create policy "admin_read" on client_status_history
  for select using ((auth.jwt() ->> 'role') = 'ADMIN');

create policy "service_all" on client_status_history
  for all using (true) with check (true);

-- Backfill: one row per existing client using their current status.
-- This can't recover exactly when a client actually changed status in the
-- past (that history doesn't exist) — it only guarantees correctness for
-- any status change made from this point forward.
insert into client_status_history (company_id, client_id, status, effective_from)
select company_id, id, status, coalesce(created_at::date, '2020-01-01')
from clients
on conflict do nothing;
