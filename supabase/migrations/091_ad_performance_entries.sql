-- Ads Tracker performance log (Phase 1 of the ads-tracker-performance-log spec) --
-- manual entry of Meta/Google Ads metrics per ad, since the live Ads API connector
-- isn't available. Append-only history (like ad_revisions) so trends and "week 1
-- vs week 3" comparisons are possible later, rather than a single overwritten row.
create table if not exists ad_performance_entries (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references ads_tracker(id) on delete cascade,
  company_id uuid not null,
  entry_date date not null default current_date,
  spend numeric not null,
  impressions integer not null,
  reach integer not null,
  clicks integer not null,
  ctr numeric not null,       -- percentage, e.g. 1.20
  results integer not null,   -- generic: leads/messages/purchases, matches the ad's objective
  note text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ad_performance_entries_ad_idx on ad_performance_entries(ad_id);
create index if not exists ad_performance_entries_company_idx on ad_performance_entries(company_id);

alter table ad_performance_entries enable row level security;

create policy "tenant_all" on ad_performance_entries
  for all using (company_id = (auth.jwt() ->> 'company_id')::uuid)
  with check (company_id = (auth.jwt() ->> 'company_id')::uuid);

create policy "service_all" on ad_performance_entries for all using (true) with check (true);
