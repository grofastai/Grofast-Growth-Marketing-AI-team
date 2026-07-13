-- Shoot scheduling (Phase 1): lets a shoot record multiple video titles, and adds a
-- "going" status between scheduled and completed/cancelled -- crew mark themselves as
-- going on the day, and can still cancel after reaching the location.
alter table shoots add column if not exists notes text;

alter table shoots drop constraint if exists shoots_status_check;
alter table shoots add constraint shoots_status_check
  check (status in ('scheduled', 'going', 'completed', 'cancelled'));

-- One shoot can produce multiple video titles (one session -> several separate videos).
-- Each title becomes its own content_items row once the shoot is marked Done.
-- content_item_id starts null and is set on completion -- this both traces "which shoot
-- did this video come from" and prevents double-creation if Done fires more than once.
create table if not exists shoot_titles (
  id uuid primary key default gen_random_uuid(),
  shoot_id uuid not null references shoots(id) on delete cascade,
  company_id uuid not null,
  title text not null,
  content_item_id uuid references content_items(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists shoot_titles_shoot_idx on shoot_titles(shoot_id);
create index if not exists shoot_titles_company_idx on shoot_titles(company_id);

alter table shoot_titles enable row level security;

create policy "tenant_all" on shoot_titles
  for all using (company_id = (auth.jwt() ->> 'company_id')::uuid)
  with check (company_id = (auth.jwt() ->> 'company_id')::uuid);

create policy "service_all" on shoot_titles for all using (true) with check (true);
