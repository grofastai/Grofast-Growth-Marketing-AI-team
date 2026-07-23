-- Monthly posting target per client, scoped to branding vs ads (the Media
-- Tracker log tabs each of these appears in), so the new per-client stats box
-- next to Waiting to Post can show Target alongside Posted/Unposted/Edited.
create table if not exists content_client_targets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  client_name text not null,
  kind text not null check (kind in ('branding','ads')),
  month text not null, -- 'YYYY-MM'
  target integer not null default 0,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(company_id, client_name, kind, month)
);

create index if not exists content_client_targets_company_idx on content_client_targets(company_id);

alter table content_client_targets enable row level security;

-- Same shared company-wide visibility as content_items — any team member can
-- set the target, not just admin (matches the rest of the tracker's model
-- where whoever's working the board can update it).
create policy "tenant_all" on content_client_targets
  for all using (company_id = (auth.jwt() ->> 'company_id')::uuid)
  with check (company_id = (auth.jwt() ->> 'company_id')::uuid);

create policy "service_all" on content_client_targets for all using (true) with check (true);
