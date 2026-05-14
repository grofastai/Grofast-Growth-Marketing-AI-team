-- ── Pricing rate card (per video type, per company) ─────────────────────────
create table if not exists pricing_rates (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  video_type    text not null,
  rate_per_video numeric(10,2) not null default 0,
  created_at    timestamptz default now(),
  unique(company_id, video_type)
);

alter table pricing_rates enable row level security;

create policy "tenant_isolation" on pricing_rates
  for all using (company_id = (auth.jwt() ->> 'company_id')::uuid);

create policy "admin_write" on pricing_rates
  for insert with check ((auth.jwt() ->> 'role') = 'ADMIN');

-- ── Hourly cost rate per employee ─────────────────────────────────────────────
alter table users add column if not exists hourly_rate numeric(10,2);

-- ── Per-video manual cost overrides ──────────────────────────────────────────
-- video_uid = the `id` field inside editing_videos JSONB entries
create table if not exists video_cost_overrides (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  video_uid   text not null,
  manual_cost numeric(10,2) not null,
  created_at  timestamptz default now(),
  unique(company_id, video_uid)
);

alter table video_cost_overrides enable row level security;

create policy "tenant_isolation" on video_cost_overrides
  for all using (company_id = (auth.jwt() ->> 'company_id')::uuid);

create policy "admin_write" on video_cost_overrides
  for insert with check ((auth.jwt() ->> 'role') = 'ADMIN');
