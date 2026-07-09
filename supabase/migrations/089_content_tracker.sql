-- Content Tracker: tracks each video/poster through Shot -> Editing -> Edited -> Posted,
-- a shared per-company log so posting counts and shot/edited backlogs are answerable
-- without cross-referencing daily_updates work_entries (which are per-person time logs,
-- not per-content-item lifecycle records). Visible to every team member, not just admin
-- or whoever created the row — the whole point is shared visibility.
create table if not exists content_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  client_name text not null,
  title text not null,
  content_type text not null default 'video' check (content_type in ('video','poster')),
  status text not null default 'shot' check (status in ('shot','editing','edited','posted')),
  shot_by uuid references users(id) on delete set null,
  shot_date date,
  edited_by uuid references users(id) on delete set null,
  edited_date date,
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_items_company_idx on content_items(company_id);
create index if not exists content_items_status_idx on content_items(company_id, status);

-- One row per platform a content item actually went to (a single video can post
-- to Instagram, YouTube, Facebook, LinkedIn and GMB on different dates).
-- Named content_item_posts (not content_posts) because content_posts already
-- exists as the Content Calendar feature's scheduling table with unrelated columns.
create table if not exists content_item_posts (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references content_items(id) on delete cascade,
  company_id uuid not null,
  platform text not null check (platform in ('instagram','youtube','facebook','linkedin','gmb')),
  posted_date date not null default current_date,
  posted_by uuid references users(id) on delete set null,
  post_link text,
  created_at timestamptz not null default now()
);

create index if not exists content_item_posts_item_idx on content_item_posts(content_item_id);
create index if not exists content_item_posts_company_idx on content_item_posts(company_id);

-- Paid ad creatives — separate from organic content_items since ads have their
-- own lifecycle (hooks, targeting strategy, corrections) that organic posts don't.
create table if not exists ads_tracker (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  client_name text not null,
  ad_name text not null,
  platform text not null default 'meta',
  launch_date date,
  hook_count integer not null default 0,
  targeting_type text check (targeting_type in ('broad','interest','lookalike','retargeting')),
  targeting_notes text,
  status text not null default 'active' check (status in ('active','paused','testing','stopped')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ads_tracker_company_idx on ads_tracker(company_id);

-- Running history of corrections/strategy changes per ad — kept as a log (not
-- overwritten) so a client can be shown "we tested 3 hooks and 2 targeting
-- strategies over 3 weeks" rather than just the current state.
create table if not exists ad_revisions (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references ads_tracker(id) on delete cascade,
  company_id uuid not null,
  revision_date date not null default current_date,
  notes text not null,
  hook_count_after integer,
  targeting_type_after text check (targeting_type_after in ('broad','interest','lookalike','retargeting')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ad_revisions_ad_idx on ad_revisions(ad_id);

alter table content_items enable row level security;
alter table content_item_posts enable row level security;
alter table ads_tracker enable row level security;
alter table ad_revisions enable row level security;

-- Shared company-wide visibility: every member of the company can read/write
-- these tables (not scoped to their own created_by), since the whole point is
-- that what one person logs is visible to everyone on the team.
create policy "tenant_all" on content_items
  for all using (company_id = (auth.jwt() ->> 'company_id')::uuid)
  with check (company_id = (auth.jwt() ->> 'company_id')::uuid);

create policy "tenant_all" on content_item_posts
  for all using (company_id = (auth.jwt() ->> 'company_id')::uuid)
  with check (company_id = (auth.jwt() ->> 'company_id')::uuid);

create policy "tenant_all" on ads_tracker
  for all using (company_id = (auth.jwt() ->> 'company_id')::uuid)
  with check (company_id = (auth.jwt() ->> 'company_id')::uuid);

create policy "tenant_all" on ad_revisions
  for all using (company_id = (auth.jwt() ->> 'company_id')::uuid)
  with check (company_id = (auth.jwt() ->> 'company_id')::uuid);

create policy "service_all" on content_items for all using (true) with check (true);
create policy "service_all" on content_item_posts for all using (true) with check (true);
create policy "service_all" on ads_tracker for all using (true) with check (true);
create policy "service_all" on ad_revisions for all using (true) with check (true);
